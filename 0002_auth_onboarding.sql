-- Secure onboarding: organization and creator-admin membership are created atomically.
create or replace function public.create_organization_for_current_user(
  p_name text,
  p_country_code text default 'NG',
  p_base_currency text default 'NGN'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org_id uuid;
  v_slug text;
  v_base_slug text;
  v_suffix integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Organization name is required'; end if;
  if exists(select 1 from public.organization_memberships where user_id=v_user and status='active') then
    raise exception 'You already belong to an active organization';
  end if;
  v_base_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then v_base_slug := 'organization'; end if;
  v_slug := v_base_slug;
  while exists(select 1 from public.organizations where slug=v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  end loop;
  insert into public.organizations(name,slug,country_code,base_currency,created_by)
  values(trim(p_name),v_slug,upper(coalesce(nullif(p_country_code,''),'NG')),upper(coalesce(nullif(p_base_currency,''),'NGN')),v_user)
  returning id into v_org_id;
  insert into public.organization_memberships(organization_id,user_id,role,status)
  values(v_org_id,v_user,'company_admin','active');
  insert into public.departments(organization_id,name,code) values
    (v_org_id,'Administration','ADMIN'),(v_org_id,'Finance','FIN'),(v_org_id,'Procurement','PROC'),(v_org_id,'Operations','OPS')
  on conflict do nothing;
  insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_org_id,v_user,'organization.created','organization',v_org_id::text,jsonb_build_object('name',trim(p_name),'creator_role','company_admin'));
  return v_org_id;
end;
$$;
revoke all on function public.create_organization_for_current_user(text,text,text) from public;
grant execute on function public.create_organization_for_current_user(text,text,text) to authenticated;

-- Profile is private by default; members can read profiles of users in the same workspace.
create policy "members can view workspace profiles"
on public.profiles for select
using (id = auth.uid() or exists (
  select 1 from public.organization_memberships mine
  join public.organization_memberships theirs on theirs.organization_id=mine.organization_id
  where mine.user_id=auth.uid() and mine.status='active' and theirs.user_id=profiles.id and theirs.status='active'
));
