-- Allow requesters to revise line amounts/items only while the HOD approval step is still pending.
create or replace function public.update_purchase_request_before_hod(
 p_request_id uuid,
 p_title text,
 p_justification text,
 p_needed_by date,
 p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
 v_user uuid := auth.uid();
 v_req public.purchase_requests%rowtype;
 v_hod public.purchase_request_approvals%rowtype;
 v_item jsonb;
 v_qty numeric;
 v_price numeric;
 v_total numeric(18,2) := 0;
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

 select * into v_req from public.purchase_requests where id=p_request_id for update;
 if not found then raise exception 'Purchase request not found'; end if;
 if v_req.requester_id <> v_user then raise exception 'Only the original requester can edit this request'; end if;
 if v_req.status <> 'submitted' or v_req.is_draft then raise exception 'This request can no longer be edited because approval has started'; end if;

 select * into v_hod from public.purchase_request_approvals
 where request_id=p_request_id and step_number=1 and approver_role='department_head'
 for update;
 if not found or v_hod.status <> 'pending' then
   raise exception 'Editing is locked because the HOD has started or completed the approval process';
 end if;

 perform 1 from public.departments where id=v_req.department_id and organization_id=v_req.organization_id for update;

 for v_item in select * from jsonb_array_elements(p_items) loop
   v_qty := coalesce((v_item->>'quantity')::numeric,0);
   v_price := coalesce((v_item->>'estimated_unit_price')::numeric,0);
   if v_qty <= 0 or v_price < 0 then raise exception 'Invalid item quantity or unit price'; end if;
   if length(trim(coalesce(v_item->>'description',''))) < 2 then raise exception 'Item description is required'; end if;
   v_total := v_total + v_qty * v_price;
 end loop;

 select coalesce(sum(allocated_amount),0) into v_allocated
 from public.department_budgets
 where organization_id=v_req.organization_id and department_id is not distinct from v_req.department_id
   and status='active' and coalesce(p_needed_by,current_date) between period_start and period_end;
 if v_allocated <= 0 then raise exception 'No active budget allocation exists for this department and date'; end if;

 select coalesce(sum(s.committed_amount),0),coalesce(sum(s.actual_spend),0)
 into v_committed,v_actual
 from public.department_budgets b join public.budget_commitment_summary s on s.budget_id=b.id
 where b.organization_id=v_req.organization_id and b.department_id is not distinct from v_req.department_id
   and b.status='active' and coalesce(p_needed_by,current_date) between b.period_start and b.period_end;

 select coalesce(sum(pr.subtotal),0) into v_pending
 from public.purchase_requests pr
 where pr.organization_id=v_req.organization_id and pr.department_id is not distinct from v_req.department_id
   and pr.status='submitted' and pr.id<>p_request_id
   and pr.created_at::date between (
     select min(period_start) from public.department_budgets where organization_id=v_req.organization_id
     and department_id is not distinct from v_req.department_id and status='active'
     and coalesce(p_needed_by,current_date) between period_start and period_end
   ) and (
     select max(period_end) from public.department_budgets where organization_id=v_req.organization_id
     and department_id is not distinct from v_req.department_id and status='active'
     and coalesce(p_needed_by,current_date) between period_start and period_end
   );
 v_available := v_allocated-v_committed-v_actual-v_pending;
 if v_total > v_available then
   raise exception 'Updated request exceeds remaining budget of % %',to_char(v_available,'FM999,999,999,990.00'),v_req.currency_code;
 end if;

 update public.purchase_requests set title=trim(p_title),justification=trim(p_justification),
   needed_by=p_needed_by,subtotal=v_total,updated_at=now() where id=p_request_id;
 delete from public.purchase_request_items where request_id=p_request_id;
 for v_item in select * from jsonb_array_elements(p_items) loop
   insert into public.purchase_request_items(request_id,description,quantity,unit,estimated_unit_price)
   values(p_request_id,trim(v_item->>'description'),(v_item->>'quantity')::numeric,
     coalesce(nullif(trim(v_item->>'unit'),''),'unit'),(v_item->>'estimated_unit_price')::numeric);
 end loop;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
 values(v_req.organization_id,v_user,'purchase_request.updated_before_hod','purchase_request',p_request_id::text,
   jsonb_build_object('old_total',v_req.subtotal,'new_total',v_total));
 return p_request_id;
end;
$function$;
revoke all on function public.update_purchase_request_before_hod(uuid,text,text,date,jsonb) from public,anon;
grant execute on function public.update_purchase_request_before_hod(uuid,text,text,date,jsonb) to authenticated;
