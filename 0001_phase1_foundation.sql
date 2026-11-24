-- MIDRICIFY Phase 1 foundation schema
-- PostgreSQL / Supabase. Tenant isolation is membership-based.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code char(2) not null default 'NG',
  base_currency char(3) not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  manager_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  role text not null default 'requester' check (role in (
    'company_admin','requester','department_head','procurement_officer','auditor',
    'finance_officer','accountant','storekeeper','executive_approver'
  )),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null
);

create table if not exists public.role_permissions (
  role text not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role, permission_id)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_idx on public.organization_memberships(user_id);
create index if not exists memberships_org_idx on public.organization_memberships(organization_id);
create index if not exists departments_org_idx on public.departments(organization_id);
create index if not exists audit_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- Create a profile automatically when a Supabase Auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Membership helper functions prevent recursive RLS policy evaluation.
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can view organizations"
on public.organizations for select
using (public.is_org_member(id));

create policy "authenticated users can create organizations"
on public.organizations for insert
with check (auth.uid() = created_by);

create policy "admins can update organization"
on public.organizations for update
using (public.has_org_role(id, array['company_admin']))
with check (public.has_org_role(id, array['company_admin']));

create policy "users can view own profile"
on public.profiles for select using (id = auth.uid());

create policy "users can update own profile"
on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members view departments"
on public.departments for select using (public.is_org_member(organization_id));

create policy "admins manage departments"
on public.departments for all
using (public.has_org_role(organization_id, array['company_admin']))
with check (public.has_org_role(organization_id, array['company_admin']));

create policy "members view memberships"
on public.organization_memberships for select
using (public.is_org_member(organization_id) or user_id = auth.uid());

create policy "admins manage memberships"
on public.organization_memberships for all
using (public.has_org_role(organization_id, array['company_admin']))
with check (public.has_org_role(organization_id, array['company_admin']));

create policy "authenticated can read permission catalog"
on public.permissions for select using (auth.uid() is not null);

create policy "authenticated can read role permissions"
on public.role_permissions for select using (auth.uid() is not null);

create policy "members can read audit log"
on public.audit_logs for select using (public.is_org_member(organization_id));

create policy "admins can insert audit log"
on public.audit_logs for insert
with check (public.has_org_role(organization_id, array['company_admin']));

-- Seed permission catalog.
insert into public.permissions (key, description) values
('organization.view','View organization settings'),
('organization.manage','Manage organization settings'),
('users.view','View users and memberships'),
('users.manage','Invite and manage users'),
('departments.view','View departments'),
('departments.manage','Manage departments'),
('procurement.request.create','Create purchase requests'),
('procurement.request.approve','Approve purchase requests'),
('procurement.manage','Manage procurement'),
('budget.view','View budgets'),
('budget.manage','Manage budgets'),
('finance.view','View finance records'),
('finance.manage','Manage finance records'),
('accounting.view','View accounting'),
('accounting.manage','Manage accounting'),
('audit.view','View audit records')
on conflict (key) do nothing;

-- Note: Production onboarding should create organization + creator membership
-- via a trusted server action/transaction. Do not expose service-role credentials
-- to the browser. Review RLS and test tenant isolation before launch.
