alter table public.profiles
  add column if not exists unit_section text;

comment on column public.profiles.unit_section is 'User-maintained unit or section within their assigned department';

grant select, update on public.profiles to authenticated;
