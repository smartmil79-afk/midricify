-- Phase 2.8: enforce procurement roles inside privileged purchase-order RPCs.
-- These SECURITY DEFINER functions bypass table RLS, so authorization belongs here.
create or replace function public.create_purchase_order(
 p_request_id uuid,
 p_vendor_id uuid,
 p_delivery_address text default null,
 p_delivery_date date default null,
 p_payment_terms text default null,
 p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
 v_user uuid:=auth.uid();
 v_req public.purchase_requests%rowtype;
 v_vendor public.vendors%rowtype;
 v_org uuid;
 v_po_id uuid;
 v_no text;
 v_count int;
 v_subtotal numeric;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select * into v_req from public.purchase_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found'; end if;
 v_org:=v_req.organization_id;
 if not public.has_org_role(v_org,array['company_admin','procurement_officer']) then
  raise exception 'Purchase order creation permission required';
 end if;
 if v_req.status<>'approved' then
  raise exception 'Only approved requests can be converted to a purchase order';
 end if;
 if exists(select 1 from public.purchase_orders where purchase_request_id=p_request_id) then
  raise exception 'This request already has a purchase order';
 end if;
 select * into v_vendor from public.vendors
 where id=p_vendor_id and organization_id=v_org and status='active';
 if not found then raise exception 'Vendor is not active or does not belong to this organization'; end if;
 select count(*)+1 into v_count from public.purchase_orders
 where organization_id=v_org and date_part('year',created_at)=date_part('year',now());
 v_no:='PO-'||to_char(now(),'YYYY')||'-'||lpad(v_count::text,5,'0');
 select coalesce(sum(line_total),0) into v_subtotal
 from public.purchase_request_items where request_id=p_request_id;
 insert into public.purchase_orders(
  organization_id,purchase_request_id,vendor_id,po_number,currency_code,
  subtotal,total,delivery_address,delivery_date,payment_terms,notes,created_by
 ) values(
  v_org,p_request_id,p_vendor_id,v_no,v_req.currency_code,
  v_subtotal,v_subtotal,p_delivery_address,p_delivery_date,
  coalesce(nullif(p_payment_terms,''),v_vendor.payment_terms),p_notes,v_user
 ) returning id into v_po_id;
 insert into public.purchase_order_items(
  purchase_order_id,description,quantity,unit,unit_price
 )
 select v_po_id,description,quantity,unit,estimated_unit_price
 from public.purchase_request_items where request_id=p_request_id;
 insert into public.audit_logs(
  organization_id,actor_id,action,entity_type,entity_id,metadata
 ) values(
  v_org,v_user,'purchase_order.created','purchase_order',v_po_id::text,
  jsonb_build_object('po_number',v_no,'request_id',p_request_id,'vendor_id',p_vendor_id)
 );
 return v_po_id;
end;
$$;

create or replace function public.submit_purchase_order(p_po_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 v_po public.purchase_orders%rowtype;
 v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select * into v_po from public.purchase_orders where id=p_po_id for update;
 if not found then raise exception 'PO not found'; end if;
 if not public.has_org_role(v_po.organization_id,array['company_admin','procurement_officer']) then
  raise exception 'Purchase order submission permission required';
 end if;
 if v_po.status<>'draft' then raise exception 'Only draft POs can be submitted'; end if;
 update public.purchase_orders set status='pending_approval',updated_at=now() where id=p_po_id;
 insert into public.purchase_order_approvals(purchase_order_id,organization_id,approver_role)
 values(p_po_id,v_po.organization_id,'executive_approver');
 insert into public.audit_logs(
  organization_id,actor_id,action,entity_type,entity_id,metadata
 ) values(
  v_po.organization_id,v_user,'purchase_order.submitted','purchase_order',p_po_id::text,
  jsonb_build_object('po_number',v_po.po_number)
 );
 return jsonb_build_object('status','pending_approval','purchase_order_id',p_po_id);
end;
$$;

-- Approval is limited to an executive approver or company administrator.
-- Keep this explicit in the RPC, independent of client-side UI visibility.
create or replace function public.decide_purchase_order(
 p_po_id uuid,
 p_decision text,
 p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 v_po public.purchase_orders%rowtype;
 v_user uuid:=auth.uid();
 v_pending public.purchase_order_approvals%rowtype;
begin
 if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
 if v_user is null then raise exception 'Sign in required'; end if;
 select * into v_po from public.purchase_orders where id=p_po_id for update;
 if not found then raise exception 'PO not found'; end if;
 if not public.has_org_role(v_po.organization_id,array['company_admin','executive_approver']) then
  raise exception 'Executive approval permission required';
 end if;
 select * into v_pending from public.purchase_order_approvals
 where purchase_order_id=p_po_id and status='pending' for update;
 if not found then raise exception 'No pending approval'; end if;
 if v_pending.approver_role<>'executive_approver' then
  raise exception 'Approval role mismatch';
 end if;
 if p_decision='rejected' and length(trim(coalesce(p_note,'')))<3 then
  raise exception 'Rejection reason required';
 end if;
 update public.purchase_order_approvals
 set status=p_decision,approver_id=v_user,
     decision_note=nullif(trim(coalesce(p_note,'')),''),
     decided_at=now()
 where id=v_pending.id;
 update public.purchase_orders
 set status=p_decision,
     approved_by=case when p_decision='approved' then v_user else null end,
     approved_at=case when p_decision='approved' then now() else null end,
     updated_at=now()
 where id=p_po_id;
 insert into public.audit_logs(
  organization_id,actor_id,action,entity_type,entity_id,metadata
 ) values(
  v_po.organization_id,v_user,'purchase_order.'||p_decision,'purchase_order',
  p_po_id::text,jsonb_build_object('note',p_note)
 );
 return jsonb_build_object('status',p_decision,'purchase_order_id',p_po_id);
end;
$$;

revoke all on function public.create_purchase_order(uuid,uuid,text,date,text,text) from public;
revoke all on function public.submit_purchase_order(uuid) from public;
revoke all on function public.decide_purchase_order(uuid,text,text) from public;
grant execute on function public.create_purchase_order(uuid,uuid,text,date,text,text) to authenticated;
grant execute on function public.submit_purchase_order(uuid) to authenticated;
grant execute on function public.decide_purchase_order(uuid,text,text) to authenticated;
