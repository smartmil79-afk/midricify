create or replace function public.set_chart_of_accounts_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
 new.updated_at:=now();
 return new;
end; $$;
create trigger chart_of_accounts_updated_at_trg
before update on public.chart_of_accounts
for each row execute function public.set_chart_of_accounts_updated_at();
revoke all on function public.set_chart_of_accounts_updated_at() from public,anon,authenticated;
