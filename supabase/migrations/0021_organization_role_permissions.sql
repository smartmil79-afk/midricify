-- Organisation-scoped role permission assignments for MIDRICIFY.
create table if not exists public.organization_role_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('requester','department_head','procurement_officer','auditor','finance_officer','accountant','storekeeper','executive_approver')),
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (organization_id, role, permission_id)
);
alter table public.organization_role_permissions enable row level security;
revoke all on public.organization_role_permissions from anon, authenticated;
grant select on public.organization_role_permissions to authenticated;
create policy "workspace admins read role permissions"
on public.organization_role_permissions for select to authenticated
using (exists (select 1 from public.organization_memberships m where m.organization_id=organization_role_permissions.organization_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='company_admin'));
create or replace function public.set_organization_role_permission(p_organization_id uuid,p_role text,p_permission_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_role not in ('requester','department_head','procurement_officer','auditor','finance_officer','accountant','storekeeper','executive_approver') then raise exception 'Invalid or protected role'; end if;
 if not exists(select 1 from organization_memberships where organization_id=p_organization_id and user_id=auth.uid() and status='active' and role='company_admin') then raise exception 'Only an active company administrator can manage permissions'; end if;
 if not exists(select 1 from permissions where id=p_permission_id) then raise exception 'Permission does not exist'; end if;
 if p_enabled then insert into organization_role_permissions(organization_id,role,permission_id,created_by) values(p_organization_id,p_role,p_permission_id,auth.uid()) on conflict do nothing;
 else delete from organization_role_permissions where organization_id=p_organization_id and role=p_role and permission_id=p_permission_id; end if;
end; $$;
revoke all on function public.set_organization_role_permission(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.set_organization_role_permission(uuid,text,uuid,boolean) to authenticated;
