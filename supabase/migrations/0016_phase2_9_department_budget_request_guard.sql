-- Phase 2.9: enforce department budget limits at the database boundary.
-- Correct the ITDepart allocation that was incorrectly linked to Finance.
update public.department_budgets
set department_id = '5eaaec95-effc-49c4-931a-df08354c8eb6',
    updated_at = now()
where id = 'c1ef497f-d0f8-42cd-968a-4036f732b381'
  and organization_id = 'e8993f74-1da7-4d6f-9bb6-73cfb5392901'
  and name = 'ITDepart';

create or replace function public.submit_purchase_request(
 p_title text,
 p_justification text,
 p_department_id uuid,
 p_needed_by date,
 p_currency_code text,
 p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
 v_user uuid := auth.uid();
 v_org uuid;
 v_req uuid;
 v_counter bigint;
 v_number text;
 v_total numeric(18,2) := 0;
 v_item jsonb;
 v_qty numeric;
 v_price numeric;
 v_allocated numeric(18,2);
 v_committed numeric(18,2);
 v_actual numeric(18,2);
 v_pending numeric(18,2);
 v_available numeric(18,2);
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if length(trim(coalesce(p_title,''))) < 3 then raise exception 'Request title is required'; end if;
 if length(trim(coalesce(p_justification,''))) < 5 then raise exception 'Please provide a justification'; end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'Add at least one request item'; end if;

 select organization_id into v_org
 from public.organization_memberships
 where user_id = v_user and status = 'active'
 order by created_at limit 1;
 if v_org is null then raise exception 'Workspace membership required'; end if;

 if p_department_id is null or not exists (
   select 1 from public.departments
   where id = p_department_id and organization_id = v_org and is_active
 ) then raise exception 'Select a valid active department'; end if;

 -- Serialize requests for this department so simultaneous submissions cannot overspend.
 perform 1 from public.departments
 where id = p_department_id and organization_id = v_org
 for update;

 for v_item in select * from jsonb_array_elements(p_items) loop
   v_qty := coalesce((v_item->>'quantity')::numeric,0);
   v_price := coalesce((v_item->>'estimated_unit_price')::numeric,0);
   if v_qty <= 0 or v_price < 0 then raise exception 'Invalid item quantity or price'; end if;
   if length(trim(coalesce(v_item->>'description',''))) < 2 then raise exception 'Item description is required'; end if;
   v_total := v_total + (v_qty * v_price);
 end loop;

 select coalesce(sum(b.allocated_amount),0)
 into v_allocated
 from public.department_budgets b
 where b.organization_id = v_org
   and b.department_id = p_department_id
   and b.status = 'active'
   and coalesce(p_needed_by,current_date) between b.period_start and b.period_end;

 if v_allocated <= 0 then
   raise exception 'Your department has no active budget allocation for the requested date. Please contact Finance.';
 end if;

 select coalesce(sum(s.committed_amount),0), coalesce(sum(s.actual_spend),0)
 into v_committed, v_actual
 from public.department_budgets b
 join public.budget_commitment_summary s on s.budget_id = b.id
 where b.organization_id = v_org
   and b.department_id = p_department_id
   and b.status = 'active'
   and coalesce(p_needed_by,current_date) between b.period_start and b.period_end;

 -- Submitted requests are also reserved so multiple pending requests cannot exceed the allocation.
 select coalesce(sum(pr.subtotal),0)
 into v_pending
 from public.purchase_requests pr
 where pr.organization_id = v_org
   and pr.department_id = p_department_id
   and pr.status = 'submitted'
   and pr.created_at::date between (
     select min(period_start) from public.department_budgets
     where organization_id=v_org and department_id=p_department_id and status='active'
       and coalesce(p_needed_by,current_date) between period_start and period_end
   ) and (
     select max(period_end) from public.department_budgets
     where organization_id=v_org and department_id=p_department_id and status='active'
       and coalesce(p_needed_by,current_date) between period_start and period_end
   );

 v_available := v_allocated - v_committed - v_actual - v_pending;
 if v_available <= 0 then
   raise exception 'Your department has exhausted its budget allocation. New purchase requests are blocked. Please contact Finance.';
 end if;
 if v_total > v_available then
   raise exception 'This request exceeds your department''s remaining budget of % %.', to_char(v_available,'FM999,999,999,990.00'), upper(coalesce(nullif(p_currency_code,''),'NGN'));
 end if;

 update public.organizations set request_counter = request_counter + 1
 where id = v_org returning request_counter into v_counter;
 v_number := 'PR-' || to_char(now(),'YYYY') || '-' || lpad(v_counter::text,5,'0');

 insert into public.purchase_requests(
   organization_id,request_number,requester_id,department_id,title,justification,needed_by,currency_code,status
 ) values (
   v_org,v_number,v_user,p_department_id,trim(p_title),trim(p_justification),p_needed_by,
   upper(coalesce(nullif(p_currency_code,''),'NGN')),'submitted'
 ) returning id into v_req;

 for v_item in select * from jsonb_array_elements(p_items) loop
   v_qty := (v_item->>'quantity')::numeric;
   v_price := (v_item->>'estimated_unit_price')::numeric;
   insert into public.purchase_request_items(request_id,description,quantity,unit,estimated_unit_price)
   values(v_req,trim(v_item->>'description'),v_qty,coalesce(nullif(v_item->>'unit',''),'unit'),v_price);
 end loop;
 update public.purchase_requests set subtotal = v_total where id = v_req;
 insert into public.purchase_request_approvals(request_id,organization_id,step_number,approver_role,status)
 values(v_req,v_org,1,'department_head','pending');
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_org,v_user,'purchase_request.submitted','purchase_request',v_req::text,
   jsonb_build_object('request_number',v_number,'subtotal',v_total,'budget_available_before_request',v_available));
 return v_req;
end;
$function$;

revoke all on function public.submit_purchase_request(text,text,uuid,date,text,jsonb) from public, anon;
grant execute on function public.submit_purchase_request(text,text,uuid,date,text,jsonb) to authenticated;
