-- MIDRICIFY A1: Fiscal calendar and chart of accounts
-- Tenant-scoped; journal posting is intentionally outside this phase.
insert into public.permissions (key, description) values
 ('finance.accounts.view','View the organisation chart of accounts'),
 ('finance.accounts.manage','Create and manage chart of accounts'),
 ('finance.period.view','View fiscal years and accounting periods'),
 ('finance.period.manage','Create and manage fiscal years and accounting periods')
on conflict (key) do nothing;

create table public.accounting_fiscal_years (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null, start_date date not null, end_date date not null,
 status text not null default 'open' check (status in ('open','soft_closed','closed')),
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 closed_by uuid references auth.users(id) on delete set null, closed_at timestamptz,
 constraint accounting_fiscal_year_dates_check check (start_date <= end_date),
 constraint accounting_fiscal_year_org_id_unique unique (organization_id,id),
 constraint accounting_fiscal_year_name_unique unique (organization_id,name),
 constraint accounting_fiscal_year_start_unique unique (organization_id,start_date)
);

create table public.accounting_periods (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 fiscal_year_id uuid not null,
 period_number smallint not null check (period_number between 1 and 12),
 name text not null, start_date date not null, end_date date not null,
 status text not null default 'open' check (status in ('open','soft_closed','closed')),
 closed_by uuid references auth.users(id) on delete set null, closed_at timestamptz,
 close_note text, created_at timestamptz not null default now(),
 constraint accounting_period_dates_check check (start_date <= end_date),
 constraint accounting_period_org_year_fk foreign key (organization_id,fiscal_year_id)
  references public.accounting_fiscal_years (organization_id,id) on delete cascade,
 constraint accounting_period_org_id_unique unique (organization_id,id),
 constraint accounting_period_number_unique unique (organization_id,fiscal_year_id,period_number)
);
create index accounting_periods_org_dates_idx on public.accounting_periods(organization_id,start_date,end_date);

create table public.chart_of_accounts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 account_code text not null, account_name text not null,
 account_type text not null check (account_type in ('asset','liability','equity','revenue','cost_of_sales','expense','other_income','other_expense')),
 normal_balance text not null check (normal_balance in ('debit','credit')),
 parent_account_id uuid,
 is_control_account boolean not null default false,
 is_system_account boolean not null default false,
 is_active boolean not null default true,
 allow_manual_posting boolean not null default true,
 description text,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint chart_of_accounts_code_nonempty check (length(btrim(account_code)) > 0),
 constraint chart_of_accounts_name_nonempty check (length(btrim(account_name)) > 0),
 constraint chart_of_accounts_org_id_unique unique (organization_id,id),
 constraint chart_of_accounts_org_code_unique unique (organization_id,account_code),
 constraint chart_of_accounts_parent_fk foreign key (organization_id,parent_account_id)
  references public.chart_of_accounts(organization_id,id) on delete restrict,
 constraint chart_of_accounts_not_own_parent check (parent_account_id is null or parent_account_id <> id)
);
create index chart_of_accounts_org_parent_idx on public.chart_of_accounts(organization_id,parent_account_id);
create index chart_of_accounts_org_type_active_idx on public.chart_of_accounts(organization_id,account_type,is_active);

alter table public.accounting_fiscal_years enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.chart_of_accounts enable row level security;

create policy accounting_fiscal_years_select on public.accounting_fiscal_years for select to authenticated
 using (public.has_org_permission(organization_id,'finance.period.view') or public.has_org_permission(organization_id,'finance.period.manage'));
create policy accounting_fiscal_years_insert on public.accounting_fiscal_years for insert to authenticated
 with check (public.has_org_permission(organization_id,'finance.period.manage'));
create policy accounting_fiscal_years_update on public.accounting_fiscal_years for update to authenticated
 using (public.has_org_permission(organization_id,'finance.period.manage'))
 with check (public.has_org_permission(organization_id,'finance.period.manage'));

create policy accounting_periods_select on public.accounting_periods for select to authenticated
 using (public.has_org_permission(organization_id,'finance.period.view') or public.has_org_permission(organization_id,'finance.period.manage'));
create policy accounting_periods_insert on public.accounting_periods for insert to authenticated
 with check (public.has_org_permission(organization_id,'finance.period.manage'));
create policy accounting_periods_update on public.accounting_periods for update to authenticated
 using (public.has_org_permission(organization_id,'finance.period.manage'))
 with check (public.has_org_permission(organization_id,'finance.period.manage'));

create policy chart_of_accounts_select on public.chart_of_accounts for select to authenticated
 using (public.has_org_permission(organization_id,'finance.accounts.view') or public.has_org_permission(organization_id,'finance.accounts.manage'));
create policy chart_of_accounts_insert on public.chart_of_accounts for insert to authenticated
 with check (public.has_org_permission(organization_id,'finance.accounts.manage'));
create policy chart_of_accounts_update on public.chart_of_accounts for update to authenticated
 using (public.has_org_permission(organization_id,'finance.accounts.manage'))
 with check (public.has_org_permission(organization_id,'finance.accounts.manage'));
create policy chart_of_accounts_delete on public.chart_of_accounts for delete to authenticated
 using (public.has_org_permission(organization_id,'finance.accounts.manage') and not is_system_account);

revoke all on public.accounting_fiscal_years from anon,authenticated;
revoke all on public.accounting_periods from anon,authenticated;
revoke all on public.chart_of_accounts from anon,authenticated;
grant select,insert,update on public.accounting_fiscal_years to authenticated;
grant select,insert,update on public.accounting_periods to authenticated;
grant select,insert,update,delete on public.chart_of_accounts to authenticated;

create or replace function public.enforce_accounting_period_bounds_and_overlap()
returns trigger language plpgsql set search_path=public as $$
declare v_year_start date; v_year_end date;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,0));
 select fy.start_date,fy.end_date into v_year_start,v_year_end
 from public.accounting_fiscal_years fy
 where fy.organization_id=new.organization_id and fy.id=new.fiscal_year_id;
 if not found then raise exception 'Fiscal year not found for this organisation'; end if;
 if new.start_date < v_year_start or new.end_date > v_year_end then
  raise exception 'Accounting period must fall within its fiscal year';
 end if;
 if exists (
  select 1 from public.accounting_periods p
  where p.organization_id=new.organization_id
   and p.id <> coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
   and daterange(p.start_date,p.end_date,'[]') && daterange(new.start_date,new.end_date,'[]')
 ) then raise exception 'Accounting period dates cannot overlap another period in the organisation'; end if;
 return new;
end; $$;
create trigger accounting_period_bounds_overlap_trg
before insert or update on public.accounting_periods
for each row execute function public.enforce_accounting_period_bounds_and_overlap();

create or replace function public.prevent_chart_of_accounts_cycle()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.parent_account_id is null then return new; end if;
 if exists (
  with recursive ancestors(id,parent_account_id) as (
   select a.id,a.parent_account_id from public.chart_of_accounts a
    where a.organization_id=new.organization_id and a.id=new.parent_account_id
   union all
   select parent.id,parent.parent_account_id from public.chart_of_accounts parent
    join ancestors child on child.parent_account_id=parent.id
    where parent.organization_id=new.organization_id
  )
  select 1 from ancestors where id=new.id
 ) then raise exception 'Chart of accounts hierarchy cannot contain a cycle'; end if;
 return new;
end; $$;
create trigger chart_of_accounts_prevent_cycle_trg
before insert or update on public.chart_of_accounts
for each row execute function public.prevent_chart_of_accounts_cycle();

create or replace function public.generate_accounting_fiscal_year(p_organization_id uuid,p_anchor_date date default current_date)
returns uuid language plpgsql security invoker set search_path=public as $$
declare
 v_start_month integer; v_start_date date; v_end_date date; v_fiscal_year_id uuid;
 v_period_start date; v_period_end date; v_period_number integer;
begin
 if auth.uid() is null or not public.has_org_permission(p_organization_id,'finance.period.manage') then
  raise exception 'Not authorised to manage accounting periods';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,0));
 select o.fiscal_year_start_month into v_start_month from public.organizations o where o.id=p_organization_id;
 if not found then raise exception 'Organisation not found'; end if;
 v_start_date:=make_date(extract(year from p_anchor_date)::integer,v_start_month,1);
 if p_anchor_date < v_start_date then v_start_date:=(v_start_date-interval '1 year')::date; end if;
 v_end_date:=(v_start_date+interval '1 year - 1 day')::date;
 select fy.id into v_fiscal_year_id from public.accounting_fiscal_years fy
  where fy.organization_id=p_organization_id and fy.start_date=v_start_date;
 if v_fiscal_year_id is not null then return v_fiscal_year_id; end if;
 insert into public.accounting_fiscal_years(organization_id,name,start_date,end_date,created_by)
  values(p_organization_id,'FY'||extract(year from v_start_date)::integer::text,v_start_date,v_end_date,auth.uid())
  returning id into v_fiscal_year_id;
 for v_period_number in 1..12 loop
  v_period_start:=(v_start_date+make_interval(months=>v_period_number-1))::date;
  v_period_end:=least((v_start_date+make_interval(months=>v_period_number)-interval '1 day')::date,v_end_date);
  insert into public.accounting_periods(organization_id,fiscal_year_id,period_number,name,start_date,end_date)
   values(p_organization_id,v_fiscal_year_id,v_period_number,to_char(v_period_start,'FMMonth YYYY'),v_period_start,v_period_end);
 end loop;
 return v_fiscal_year_id;
end; $$;

revoke all on function public.enforce_accounting_period_bounds_and_overlap() from public,anon,authenticated;
revoke all on function public.prevent_chart_of_accounts_cycle() from public,anon,authenticated;
revoke all on function public.generate_accounting_fiscal_year(uuid,date) from public,anon;
grant execute on function public.generate_accounting_fiscal_year(uuid,date) to authenticated;
