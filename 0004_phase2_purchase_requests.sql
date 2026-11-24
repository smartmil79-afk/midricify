-- MIDRICIFY Phase 2.0: Purchase request foundation
alter table public.organizations add column if not exists request_counter bigint not null default 0;
create table if not exists public.purchase_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 request_number text not null,
 requester_id uuid not null references public.profiles(id),
 department_id uuid references public.departments(id) on delete set null,
 title text not null,
 justification text not null,
 needed_by date,
 currency_code text not null default 'NGN',
 subtotal numeric(18,2) not null default 0 check(subtotal>=0),
 status text not null default 'submitted' check(status in ('draft','submitted','under_review','approved','rejected','cancelled','ordered')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,request_number)
);
create table if not exists public.purchase_request_items (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.purchase_requests(id) on delete cascade,
 description text not null,
 quantity numeric(14,3) not null check(quantity>0),
 unit text not null default 'unit',
 estimated_unit_price numeric(18,2) not null default 0 check(estimated_unit_price>=0),
 line_total numeric(18,2) generated always as (quantity*estimated_unit_price) stored,
 created_at timestamptz not null default now()
);
create table if not exists public.purchase_request_approvals (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.purchase_requests(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 step_number int not null,
 approver_id uuid references public.profiles(id) on delete set null,
 approver_role text,
 status text not null default 'pending' check(status in ('pending','approved','rejected','skipped')),
 decision_note text,
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 unique(request_id,step_number)
);
create index if not exists purchase_requests_org_date_idx on public.purchase_requests(organization_id,created_at desc);
create index if not exists purchase_requests_status_idx on public.purchase_requests(organization_id,status);
create index if not exists purchase_request_items_request_idx on public.purchase_request_items(request_id);
create index if not exists purchase_request_approvals_org_idx on public.purchase_request_approvals(organization_id,status);
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_request_approvals enable row level security;
drop policy if exists "members read purchase requests" on public.purchase_requests;
create policy "members read purchase requests" on public.purchase_requests for select using(public.is_org_member(organization_id));
drop policy if exists "admins manage purchase requests" on public.purchase_requests;
create policy "admins manage purchase requests" on public.purchase_requests for all using(public.has_org_role(organization_id,array['company_admin','procurement_officer'])) with check(public.has_org_role(organization_id,array['company_admin','procurement_officer']));
drop policy if exists "members read request items" on public.purchase_request_items;
create policy "members read request items" on public.purchase_request_items for select using(exists(select 1 from public.purchase_requests r where r.id=request_id and public.is_org_member(r.organization_id)));
drop policy if exists "admins manage request items" on public.purchase_request_items;
create policy "admins manage request items" on public.purchase_request_items for all using(exists(select 1 from public.purchase_requests r where r.id=request_id and public.has_org_role(r.organization_id,array['company_admin','procurement_officer']))) with check(exists(select 1 from public.purchase_requests r where r.id=request_id and public.has_org_role(r.organization_id,array['company_admin','procurement_officer'])));
drop policy if exists "members read approvals" on public.purchase_request_approvals;
create policy "members read approvals" on public.purchase_request_approvals for select using(public.is_org_member(organization_id));
drop policy if exists "admins manage approvals" on public.purchase_request_approvals;
create policy "admins manage approvals" on public.purchase_request_approvals for all using(public.has_org_role(organization_id,array['company_admin','procurement_officer'])) with check(public.has_org_role(organization_id,array['company_admin','procurement_officer']));

create or replace function public.submit_purchase_request(
 p_title text, p_justification text, p_department_id uuid, p_needed_by date,
 p_currency_code text, p_items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 v_user uuid:=auth.uid(); v_org uuid; v_req uuid; v_counter bigint; v_number text; v_total numeric(18,2);
 v_item jsonb; v_qty numeric; v_price numeric;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if length(trim(coalesce(p_title,'')))<3 then raise exception 'Request title is required'; end if;
 if length(trim(coalesce(p_justification,'')))<5 then raise exception 'Please provide a justification'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'Add at least one request item'; end if;
 select organization_id into v_org from public.organization_memberships where user_id=v_user and status='active' order by created_at limit 1;
 if v_org is null then raise exception 'Workspace membership required'; end if;
 if p_department_id is not null and not exists(select 1 from public.departments where id=p_department_id and organization_id=v_org and is_active) then raise exception 'Invalid department'; end if;
 update public.organizations set request_counter=request_counter+1 where id=v_org returning request_counter into v_counter;
 v_number:='PR-'||to_char(now(),'YYYY')||'-'||lpad(v_counter::text,5,'0');
 insert into public.purchase_requests(organization_id,request_number,requester_id,department_id,title,justification,needed_by,currency_code,status)
 values(v_org,v_number,v_user,p_department_id,trim(p_title),trim(p_justification),p_needed_by,upper(coalesce(nullif(p_currency_code,''),'NGN')),'submitted')
 returning id into v_req;
 v_total:=0;
 for v_item in select * from jsonb_array_elements(p_items) loop
  v_qty:=coalesce((v_item->>'quantity')::numeric,0); v_price:=coalesce((v_item->>'estimated_unit_price')::numeric,0);
  if v_qty<=0 or v_price<0 then raise exception 'Invalid item quantity or price'; end if;
  if length(trim(coalesce(v_item->>'description','')))<2 then raise exception 'Item description is required'; end if;
  insert into public.purchase_request_items(request_id,description,quantity,unit,estimated_unit_price)
  values(v_req,trim(v_item->>'description'),v_qty,coalesce(nullif(v_item->>'unit',''),'unit'),v_price);
  v_total:=v_total+(v_qty*v_price);
 end loop;
 update public.purchase_requests set subtotal=v_total where id=v_req;
 insert into public.purchase_request_approvals(request_id,organization_id,step_number,approver_role,status)
 values(v_req,v_org,1,'department_head','pending');
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_org,v_user,'purchase_request.submitted','purchase_request',v_req::text,jsonb_build_object('request_number',v_number,'subtotal',v_total));
 return v_req;
end; $$;
revoke all on function public.submit_purchase_request(text,text,uuid,date,text,jsonb) from public;
grant execute on function public.submit_purchase_request(text,text,uuid,date,text,jsonb) to authenticated;
