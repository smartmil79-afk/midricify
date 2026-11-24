-- MIDRICIFY Phase 1.2: administration foundation
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'requester' check (role in (
    'requester','department_head','procurement_officer','auditor','finance_officer',
    'accountant','storekeeper','executive_approver'
  )),
  department_id uuid references public.departments(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  token_hash text,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists invitations_org_status_idx on public.organization_invitations(organization_id,status);
alter table public.organization_invitations enable row level security;

-- Admins can manage department records; active workspace members may read.
drop policy if exists "members can read departments" on public.departments;
create policy "members can read departments" on public.departments for select
using (public.is_org_member(organization_id));
drop policy if exists "admins manage departments" on public.departments;
create policy "admins manage departments" on public.departments for all
using (public.has_org_role(organization_id,array['company_admin']))
with check (public.has_org_role(organization_id,array['company_admin']));

create policy "admins manage invitations" on public.organization_invitations for all
using (public.has_org_role(organization_id,array['company_admin']))
with check (public.has_org_role(organization_id,array['company_admin']));

-- Admins can see membership roster; members can see their own membership.
drop policy if exists "members can view memberships" on public.organization_memberships;
create policy "members can view memberships" on public.organization_memberships for select
using (user_id = auth.uid() or public.has_org_role(organization_id,array['company_admin']));

-- Seed permissions if migration is run after foundation migration.
insert into public.permissions(key,description) values
('workspace.manage','Manage organization settings'),
('members.manage','Manage members and invitations'),
('departments.manage','Manage departments'),
('requests.create','Create purchase requests'),
('requests.approve','Approve purchase requests'),
('procurement.manage','Manage sourcing and purchase orders'),
('budgets.view','View budgets'),
('budgets.manage','Manage budgets'),
('invoices.manage','Manage invoices and payables'),
('accounting.manage','Manage accounting operations'),
('inventory.manage','Manage inventory'),
('audit.view','View audit logs')
on conflict(key) do nothing;

-- Company Admin receives all current permissions.
insert into public.role_permissions(role,permission_id)
select 'company_admin',id from public.permissions
on conflict do nothing;
