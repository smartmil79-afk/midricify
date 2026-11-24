-- Phase 2.6 Budget Control & Commitment Management
create table if not exists public.department_budgets (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 department_id uuid references public.departments(id) on delete set null,
 name text not null,
 fiscal_year int not null,
 period_start date not null,
 period_end date not null,
 currency_code text not null default 'NGN',
 allocated_amount numeric(18,2) not null check(allocated_amount>=0),
 status text not null default 'active' check(status in ('draft','active','closed')),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(period_end>=period_start),
 unique(organization_id,department_id,name,fiscal_year)
);
create table if not exists public.budget_transfers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 from_budget_id uuid not null references public.department_budgets(id),
 to_budget_id uuid not null references public.department_budgets(id),
 amount numeric(18,2) not null check(amount>0),
 reason text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_by uuid references auth.users(id),
 decided_by uuid references auth.users(id),
 decision_note text,
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 check(from_budget_id<>to_budget_id)
);
create index if not exists dept_budgets_org_year_idx on public.department_budgets(organization_id,fiscal_year,department_id);
create index if not exists budget_transfers_org_status_idx on public.budget_transfers(organization_id,status);
alter table public.department_budgets enable row level security;
alter table public.budget_transfers enable row level security;
drop policy if exists budgets_member_read on public.department_budgets;
create policy budgets_member_read on public.department_budgets for select using(public.is_org_member(organization_id));
drop policy if exists budgets_finance_write on public.department_budgets;
create policy budgets_finance_write on public.department_budgets for all using(public.has_org_role(organization_id,array['company_admin','finance_officer','accountant'])) with check(public.has_org_role(organization_id,array['company_admin','finance_officer','accountant']));
drop policy if exists transfers_member_read on public.budget_transfers;
create policy transfers_member_read on public.budget_transfers for select using(public.is_org_member(organization_id));
drop policy if exists transfers_finance_insert on public.budget_transfers;
create policy transfers_finance_insert on public.budget_transfers for insert with check(public.has_org_role(organization_id,array['company_admin','finance_officer','accountant']));
drop policy if exists transfers_finance_update on public.budget_transfers;
create policy transfers_finance_update on public.budget_transfers for update using(public.has_org_role(organization_id,array['company_admin','finance_officer'])) with check(public.has_org_role(organization_id,array['company_admin','finance_officer']));

create or replace view public.budget_commitment_summary with (security_invoker=true) as
select b.id as budget_id,b.organization_id,
 coalesce((select sum(pr.subtotal) from public.purchase_requests pr where pr.organization_id=b.organization_id and pr.department_id is not distinct from b.department_id and pr.status='approved' and pr.created_at::date between b.period_start and b.period_end and not exists(select 1 from public.purchase_orders po where po.purchase_request_id=pr.id)),0)
 +coalesce((select sum(po.total) from public.purchase_orders po join public.purchase_requests pr on pr.id=po.purchase_request_id where po.organization_id=b.organization_id and pr.department_id is not distinct from b.department_id and po.status not in ('cancelled','draft','rejected') and po.created_at::date between b.period_start and b.period_end),0) as committed_amount,
 coalesce((select sum(pay.amount) from public.ap_invoice_payments pay join public.ap_invoices inv on inv.id=pay.invoice_id join public.purchase_orders po on po.id=inv.purchase_order_id join public.purchase_requests pr on pr.id=po.purchase_request_id where pay.organization_id=b.organization_id and pr.department_id is not distinct from b.department_id and pay.payment_date between b.period_start and b.period_end),0) as actual_spend
from public.department_budgets b;

create or replace function public.create_department_budget(p_department_id uuid,p_name text,p_year int,p_start date,p_end date,p_amount numeric,p_currency text default 'NGN')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_org uuid; v_id uuid;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select organization_id into v_org from public.organization_memberships where user_id=v_user and status='active' order by created_at limit 1;
 if v_org is null or not public.has_org_role(v_org,array['company_admin','finance_officer','accountant']) then raise exception 'Finance budget management permission required'; end if;
 if p_amount<0 or p_end<p_start or p_year<2000 or p_year>2200 then raise exception 'Invalid budget period or amount'; end if;
 if p_department_id is not null and not exists(select 1 from public.departments where id=p_department_id and organization_id=v_org) then raise exception 'Department does not belong to workspace'; end if;
 insert into public.department_budgets(organization_id,department_id,name,fiscal_year,period_start,period_end,allocated_amount,currency_code,created_by)
 values(v_org,p_department_id,trim(p_name),p_year,p_start,p_end,p_amount,coalesce(nullif(p_currency,''),'NGN'),v_user) returning id into v_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_org,v_user,'budget.created','department_budget',v_id::text,jsonb_build_object('name',p_name,'amount',p_amount,'year',p_year));
 return v_id;
end $$;

create or replace function public.request_budget_transfer(p_from uuid,p_to uuid,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_org uuid; v_id uuid;
begin
 select organization_id into v_org from public.department_budgets where id=p_from;
 if v_user is null or v_org is null or not public.is_org_member(v_org) then raise exception 'Budget not found or unauthorized'; end if;
 if not public.has_org_role(v_org,array['company_admin','finance_officer','accountant']) then raise exception 'Finance permission required'; end if;
 if p_amount<=0 or p_from=p_to or coalesce(trim(p_reason),'')='' then raise exception 'Valid transfer amount and reason required'; end if;
 if not exists(select 1 from public.department_budgets where id=p_to and organization_id=v_org and status='active') then raise exception 'Destination budget not found or inactive'; end if;
 if not exists(select 1 from public.department_budgets where id=p_from and organization_id=v_org and status='active') then raise exception 'Source budget not found or inactive'; end if;
 insert into public.budget_transfers(organization_id,from_budget_id,to_budget_id,amount,reason,requested_by) values(v_org,p_from,p_to,p_amount,trim(p_reason),v_user) returning id into v_id;
 return v_id;
end $$;

create or replace function public.decide_budget_transfer(p_transfer_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_transfer public.budget_transfers%rowtype; v_available numeric;
begin
 select * into v_transfer from public.budget_transfers where id=p_transfer_id for update;
 if not found or not public.is_org_member(v_transfer.organization_id) then raise exception 'Transfer not found or unauthorized'; end if;
 if not public.has_org_role(v_transfer.organization_id,array['company_admin','finance_officer']) then raise exception 'Finance approver permission required'; end if;
 if v_transfer.status<>'pending' or p_decision not in ('approved','rejected') then raise exception 'Invalid transfer decision'; end if;
 if p_decision='approved' then
  select b.allocated_amount-coalesce(s.committed_amount,0)-coalesce(s.actual_spend,0) into v_available from public.department_budgets b left join public.budget_commitment_summary s on s.budget_id=b.id where b.id=v_transfer.from_budget_id;
  if coalesce(v_available,0)<v_transfer.amount then raise exception 'Insufficient uncommitted budget balance'; end if;
  update public.department_budgets set allocated_amount=allocated_amount-v_transfer.amount,updated_at=now() where id=v_transfer.from_budget_id;
  update public.department_budgets set allocated_amount=allocated_amount+v_transfer.amount,updated_at=now() where id=v_transfer.to_budget_id;
 end if;
 update public.budget_transfers set status=p_decision,decided_by=v_user,decision_note=p_note,decided_at=now() where id=p_transfer_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_transfer.organization_id,v_user,'budget.transfer.'||p_decision,'budget_transfer',p_transfer_id::text,jsonb_build_object('amount',v_transfer.amount,'note',p_note));
end $$;
revoke all on function public.create_department_budget(uuid,text,int,date,date,numeric,text) from public;
revoke all on function public.request_budget_transfer(uuid,uuid,numeric,text) from public;
revoke all on function public.decide_budget_transfer(uuid,text,text) from public;
grant execute on function public.create_department_budget(uuid,text,int,date,date,numeric,text) to authenticated;
grant execute on function public.request_budget_transfer(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.decide_budget_transfer(uuid,text,text) to authenticated;
