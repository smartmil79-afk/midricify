-- RFQ, supplier quotation, vendor comparison and landed-cost foundation.
create or replace function public.has_org_permission(p_organization_id uuid, p_permission_key text)
returns boolean language sql stable security invoker set search_path=public as $$
 select exists(select 1 from public.organization_memberships m
 where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.status='active'
 and (m.role='company_admin' or exists(
  select 1 from public.organization_role_permissions rp join public.permissions p on p.id=rp.permission_id
  where rp.organization_id=p_organization_id and rp.role=m.role and p.key=p_permission_key)));
$$;
revoke all on function public.has_org_permission(uuid,text) from public;
grant execute on function public.has_org_permission(uuid,text) to authenticated;
insert into public.permissions(key,description) values
 ('procurement.rfq.view','View RFQs, quotations and vendor comparisons'),
 ('procurement.rfq.manage','Create RFQs, record quotations and recommend vendors')
on conflict(key) do update set description=excluded.description;

create table if not exists public.rfqs(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 purchase_request_id uuid references public.purchase_requests(id) on delete set null, rfq_number text not null, title text not null,
 description text, currency_code text not null default 'NGN',
 status text not null default 'draft' check(status in('draft','issued','closed','awarded','cancelled')),
 response_due_date date, created_by uuid references auth.users(id) on delete set null,
 awarded_vendor_id uuid references public.vendors(id) on delete set null, awarded_quotation_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,rfq_number));
create table if not exists public.rfq_items(
 id uuid primary key default gen_random_uuid(), rfq_id uuid not null references public.rfqs(id) on delete cascade,
 description text not null, quantity numeric(18,4) not null check(quantity>0), unit text not null default 'unit',
 specifications text, created_at timestamptz not null default now());
create table if not exists public.rfq_vendors(
 id uuid primary key default gen_random_uuid(), rfq_id uuid not null references public.rfqs(id) on delete cascade,
 vendor_id uuid not null references public.vendors(id) on delete restrict,
 invitation_status text not null default 'invited' check(invitation_status in('invited','responded','declined')),
 invited_at timestamptz not null default now(), unique(rfq_id,vendor_id));
create table if not exists public.vendor_quotations(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 rfq_id uuid not null references public.rfqs(id) on delete cascade, vendor_id uuid not null references public.vendors(id) on delete restrict,
 quotation_number text, currency_code text not null default 'NGN', exchange_rate_to_base numeric(18,6) not null default 1 check(exchange_rate_to_base>0),
 quoted_at date not null default current_date, valid_until date, delivery_days integer check(delivery_days is null or delivery_days>=0),
 payment_terms text, warranty text, notes text, discount_amount numeric(18,2) not null default 0 check(discount_amount>=0),
 tax_amount numeric(18,2) not null default 0 check(tax_amount>=0), freight_cost numeric(18,2) not null default 0 check(freight_cost>=0),
 insurance_cost numeric(18,2) not null default 0 check(insurance_cost>=0), customs_duty numeric(18,2) not null default 0 check(customs_duty>=0),
 clearing_cost numeric(18,2) not null default 0 check(clearing_cost>=0), handling_cost numeric(18,2) not null default 0 check(handling_cost>=0),
 other_charges numeric(18,2) not null default 0 check(other_charges>=0), status text not null default 'submitted' check(status in('draft','submitted','selected','rejected')),
 quality_score numeric(5,2) check(quality_score between 0 and 100), created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(rfq_id,vendor_id));
create table if not exists public.vendor_quotation_items(
 id uuid primary key default gen_random_uuid(), quotation_id uuid not null references public.vendor_quotations(id) on delete cascade,
 rfq_item_id uuid not null references public.rfq_items(id) on delete cascade, quantity numeric(18,4) not null check(quantity>0),
 unit_price numeric(18,2) not null check(unit_price>=0), specification_compliant boolean not null default true, notes text,
 unique(quotation_id,rfq_item_id));

alter table public.rfqs enable row level security;
alter table public.rfq_items enable row level security;
alter table public.rfq_vendors enable row level security;
alter table public.vendor_quotations enable row level security;
alter table public.vendor_quotation_items enable row level security;

drop policy if exists rfqs_select_workspace on public.rfqs;
create policy rfqs_select_workspace on public.rfqs for select to authenticated using(public.has_org_permission(organization_id,'procurement.rfq.view') or public.has_org_permission(organization_id,'procurement.rfq.manage'));
drop policy if exists rfqs_insert_workspace on public.rfqs;
create policy rfqs_insert_workspace on public.rfqs for insert to authenticated with check(public.has_org_permission(organization_id,'procurement.rfq.manage'));
drop policy if exists rfqs_update_workspace on public.rfqs;
create policy rfqs_update_workspace on public.rfqs for update to authenticated using(public.has_org_permission(organization_id,'procurement.rfq.manage')) with check(public.has_org_permission(organization_id,'procurement.rfq.manage'));
drop policy if exists rfqs_delete_workspace on public.rfqs;
create policy rfqs_delete_workspace on public.rfqs for delete to authenticated using(public.has_org_permission(organization_id,'procurement.rfq.manage'));

drop policy if exists rfq_items_select_workspace on public.rfq_items;
create policy rfq_items_select_workspace on public.rfq_items for select to authenticated using(exists(select 1 from public.rfqs r where r.id=rfq_id and (public.has_org_permission(r.organization_id,'procurement.rfq.view') or public.has_org_permission(r.organization_id,'procurement.rfq.manage'))));
drop policy if exists rfq_items_write_workspace on public.rfq_items;
create policy rfq_items_write_workspace on public.rfq_items for all to authenticated using(exists(select 1 from public.rfqs r where r.id=rfq_id and public.has_org_permission(r.organization_id,'procurement.rfq.manage'))) with check(exists(select 1 from public.rfqs r where r.id=rfq_id and public.has_org_permission(r.organization_id,'procurement.rfq.manage')));

drop policy if exists rfq_vendors_select_workspace on public.rfq_vendors;
create policy rfq_vendors_select_workspace on public.rfq_vendors for select to authenticated using(exists(select 1 from public.rfqs r where r.id=rfq_id and (public.has_org_permission(r.organization_id,'procurement.rfq.view') or public.has_org_permission(r.organization_id,'procurement.rfq.manage'))));
drop policy if exists rfq_vendors_write_workspace on public.rfq_vendors;
create policy rfq_vendors_write_workspace on public.rfq_vendors for all to authenticated using(exists(select 1 from public.rfqs r where r.id=rfq_id and public.has_org_permission(r.organization_id,'procurement.rfq.manage'))) with check(exists(select 1 from public.rfqs r where r.id=rfq_id and public.has_org_permission(r.organization_id,'procurement.rfq.manage')));

drop policy if exists vendor_quotations_select_workspace on public.vendor_quotations;
create policy vendor_quotations_select_workspace on public.vendor_quotations for select to authenticated using(public.has_org_permission(organization_id,'procurement.rfq.view') or public.has_org_permission(organization_id,'procurement.rfq.manage'));
drop policy if exists vendor_quotations_write_workspace on public.vendor_quotations;
create policy vendor_quotations_write_workspace on public.vendor_quotations for all to authenticated using(public.has_org_permission(organization_id,'procurement.rfq.manage')) with check(public.has_org_permission(organization_id,'procurement.rfq.manage'));

drop policy if exists vendor_quotation_items_select_workspace on public.vendor_quotation_items;
create policy vendor_quotation_items_select_workspace on public.vendor_quotation_items for select to authenticated using(exists(select 1 from public.vendor_quotations q where q.id=quotation_id and (public.has_org_permission(q.organization_id,'procurement.rfq.view') or public.has_org_permission(q.organization_id,'procurement.rfq.manage'))));
drop policy if exists vendor_quotation_items_write_workspace on public.vendor_quotation_items;
create policy vendor_quotation_items_write_workspace on public.vendor_quotation_items for all to authenticated using(exists(select 1 from public.vendor_quotations q where q.id=quotation_id and public.has_org_permission(q.organization_id,'procurement.rfq.manage'))) with check(exists(select 1 from public.vendor_quotations q where q.id=quotation_id and public.has_org_permission(q.organization_id,'procurement.rfq.manage')));

grant select,insert,update,delete on public.rfqs,public.rfq_items,public.rfq_vendors,public.vendor_quotations,public.vendor_quotation_items to authenticated;
