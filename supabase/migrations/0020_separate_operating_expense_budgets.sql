alter table public.department_budgets
  add column if not exists budget_type text not null default 'procurement'
  check (budget_type in ('procurement','operating_expense'));

update public.department_budgets
set budget_type='operating_expense'
where id='c1ef497f-d0f8-42cd-968a-4036f732b381';

drop function if exists public.create_department_budget(uuid,text,integer,date,date,numeric,text);
create function public.create_department_budget(
 p_department_id uuid,p_name text,p_year integer,p_start date,p_end date,
 p_amount numeric,p_currency text default 'NGN',p_budget_type text default 'procurement'
) returns uuid language plpgsql security definer set search_path=public as $function$
declare v_user uuid:=auth.uid(); v_org uuid; v_id uuid;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select organization_id into v_org from public.organization_memberships
 where user_id=v_user and status='active' order by created_at limit 1;
 if v_org is null or not public.has_org_role(v_org,array['company_admin','finance_officer','accountant']) then
  raise exception 'Finance budget management permission required';
 end if;
 if p_amount<0 or p_end<p_start or p_year<2000 or p_year>2200 then raise exception 'Invalid budget period or amount'; end if;
 if p_budget_type not in ('procurement','operating_expense') then raise exception 'Invalid budget type'; end if;
 if p_department_id is not null and not exists(select 1 from public.departments where id=p_department_id and organization_id=v_org) then raise exception 'Department does not belong to workspace'; end if;
 insert into public.department_budgets(organization_id,department_id,name,fiscal_year,period_start,period_end,allocated_amount,currency_code,created_by,budget_type)
 values(v_org,p_department_id,trim(p_name),p_year,p_start,p_end,p_amount,coalesce(nullif(p_currency,''),'NGN'),v_user,p_budget_type) returning id into v_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_org,v_user,'budget.created','department_budget',v_id::text,jsonb_build_object('name',p_name,'amount',p_amount,'year',p_year,'budget_type',p_budget_type));
 return v_id;
end $function$;
revoke all on function public.create_department_budget(uuid,text,integer,date,date,numeric,text,text) from public,anon;
grant execute on function public.create_department_budget(uuid,text,integer,date,date,numeric,text,text) to authenticated;

create or replace view public.budget_commitment_summary as
select b.id as budget_id,b.organization_id,
(case when b.budget_type='procurement' then
 coalesce((select sum(pr.subtotal) from public.purchase_requests pr
  where pr.organization_id=b.organization_id and (b.department_id is null or pr.department_id=b.department_id)
  and pr.status='approved' and pr.created_at::date between b.period_start and b.period_end
  and not exists(select 1 from public.purchase_orders po where po.purchase_request_id=pr.id)),0)
 +coalesce((select sum(greatest(po.total-coalesce((select sum(pay.amount) from public.ap_invoices inv
  join public.ap_invoice_payments pay on pay.invoice_id=inv.id where inv.purchase_order_id=po.id
  and pay.organization_id=b.organization_id),0),0)) from public.purchase_orders po
  join public.purchase_requests pr on pr.id=po.purchase_request_id where po.organization_id=b.organization_id
  and (b.department_id is null or pr.department_id=b.department_id)
  and po.status not in ('cancelled','draft','rejected') and po.created_at::date between b.period_start and b.period_end),0)
 else 0 end)
+case when b.budget_type='operating_expense' then
 coalesce((select sum(er.amount) from public.expense_requests er where er.organization_id=b.organization_id
  and er.budget_id=b.id and (b.department_id is null or er.department_id=b.department_id)
  and er.status='approved' and er.expense_date between b.period_start and b.period_end),0)
 else 0 end as committed_amount,
case when b.budget_type='procurement' then coalesce((select sum(pay.amount)
 from public.ap_invoice_payments pay join public.ap_invoices inv on inv.id=pay.invoice_id
 join public.purchase_orders po on po.id=inv.purchase_order_id join public.purchase_requests pr on pr.id=po.purchase_request_id
 where pay.organization_id=b.organization_id and (b.department_id is null or pr.department_id=b.department_id)
 and pay.payment_date between b.period_start and b.period_end),0) else 0 end as actual_spend
from public.department_budgets b;
