-- Phase 2.1 approval workflow: secure decision RPC and approval inbox.
alter table public.purchase_request_approvals
 add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.purchase_requests
 add column if not exists submitted_at timestamptz;
-- Backfill department scope for the first approval step on existing requests.
update public.purchase_request_approvals a
set department_id=r.department_id
from public.purchase_requests r
where a.request_id=r.id and a.step_number=1 and a.department_id is null;
create index if not exists approval_pending_inbox_idx on public.purchase_request_approvals(organization_id,status,approver_role,department_id);

create or replace function public.decide_purchase_request(
 p_request_id uuid, p_decision text, p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid(); v_req public.purchase_requests%rowtype; v_org uuid;
 v_membership public.organization_memberships%rowtype; v_pending public.purchase_request_approvals%rowtype;
 v_next_role text; v_next_step int; v_status text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
 select * into v_req from public.purchase_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found'; end if;
 v_org:=v_req.organization_id;
 select * into v_membership from public.organization_memberships where organization_id=v_org and user_id=v_user and status='active';
 if not found then raise exception 'You are not a member of this workspace'; end if;
 select * into v_pending from public.purchase_request_approvals where request_id=p_request_id and status='pending' order by step_number limit 1 for update;
 if not found then raise exception 'No pending approval step'; end if;
 if v_membership.role<>'company_admin' and v_membership.role<>v_pending.approver_role then raise exception 'You do not have the required approver role'; end if;
 if v_pending.department_id is not null and v_membership.role<>'company_admin' and v_membership.department_id is distinct from v_pending.department_id then raise exception 'This approval is restricted to the request department'; end if;
 update public.purchase_request_approvals set status=p_decision,approver_id=v_user,decision_note=nullif(trim(coalesce(p_note,'')),''),decided_at=now() where id=v_pending.id;
 if p_decision='rejected' then
   update public.purchase_requests set status='rejected',updated_at=now() where id=p_request_id;
   v_status:='rejected';
 else
   -- Simple progressive approval policy: Department Head -> Finance above 100k -> Executive above 1m.
   if v_pending.approver_role='department_head' and v_req.subtotal>100000 then v_next_role:='finance_officer';
   elsif v_pending.approver_role in ('department_head','finance_officer') and v_req.subtotal>1000000 then v_next_role:='executive_approver';
   else v_next_role:=null; end if;
   if v_next_role is not null then
     select coalesce(max(step_number),0)+1 into v_next_step from public.purchase_request_approvals where request_id=p_request_id;
     insert into public.purchase_request_approvals(request_id,organization_id,step_number,approver_role,status,department_id)
     values(p_request_id,v_org,v_next_step,v_next_role,'pending',v_req.department_id);
     update public.purchase_requests set status='under_review',updated_at=now() where id=p_request_id;
     v_status:='under_review';
   else
     update public.purchase_requests set status='approved',updated_at=now() where id=p_request_id;
     v_status:='approved';
   end if;
 end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_org,v_user,'purchase_request.'||p_decision,'purchase_request',p_request_id::text,jsonb_build_object('note',p_note,'new_status',v_status,'approval_step',v_pending.step_number));
 return jsonb_build_object('status',v_status,'request_id',p_request_id);
end; $$;
revoke all on function public.decide_purchase_request(uuid,text,text) from public;
grant execute on function public.decide_purchase_request(uuid,text,text) to authenticated;

-- Approval inbox read: organization members can read approval records for their tenant.
drop policy if exists "members read approvals" on public.purchase_request_approvals;
create policy "members read approvals" on public.purchase_request_approvals for select
using(public.is_org_member(organization_id));
