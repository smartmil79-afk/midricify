-- Phase 2.7: Restrict goods receipt creation to authorized procurement/store roles.
-- SECURITY DEFINER bypasses table RLS, so the function must enforce the role itself.
create or replace function public.create_goods_receipt(
 p_po_id uuid,
 p_received_date date,
 p_delivery_note text,
 p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
 v_user uuid:=auth.uid();
 v_po public.purchase_orders%rowtype;
 v_gr uuid;
 v_grn text;
 v_seq int;
 v_item jsonb;
 v_po_item public.purchase_order_items%rowtype;
 v_qty numeric;
 v_received_total numeric;
begin
 if v_user is null then raise exception 'Sign in required'; end if;

 select * into v_po from public.purchase_orders where id=p_po_id for update;
 if not found or not public.is_org_member(v_po.organization_id) then
  raise exception 'Purchase order not found or unauthorized';
 end if;
 if not public.has_org_role(v_po.organization_id,array['company_admin','storekeeper','procurement_officer']) then
  raise exception 'Goods receiving permission required';
 end if;
 if v_po.status not in ('approved','sent','acknowledged','partially_received') then
  raise exception 'PO must be approved before receiving goods';
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
  raise exception 'Enter at least one received item';
 end if;

 perform pg_advisory_xact_lock(hashtext(v_po.organization_id::text||to_char(now(),'YYYY')));
 select count(*)+1 into v_seq
 from public.goods_receipts
 where organization_id=v_po.organization_id
   and date_part('year',created_at)=date_part('year',now());
 v_grn:='GRN-'||to_char(now(),'YYYY')||'-'||lpad(v_seq::text,5,'0');

 insert into public.goods_receipts(
  organization_id,purchase_order_id,grn_number,received_date,
  delivery_note_number,received_by
 )
 values(
  v_po.organization_id,p_po_id,v_grn,coalesce(p_received_date,current_date),
  nullif(trim(p_delivery_note),''),v_user
 ) returning id into v_gr;

 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_po_item
  from public.purchase_order_items
  where id=(v_item->>'purchase_order_item_id')::uuid
    and purchase_order_id=p_po_id;
  if not found then raise exception 'Invalid PO line'; end if;

  v_qty:=(v_item->>'quantity_received')::numeric;
  if v_qty<=0 then raise exception 'Received quantity must be greater than zero'; end if;

  select coalesce(sum(
   case when gr.status='pending_inspection'
    then ri.quantity_received else ri.quantity_accepted end
  ),0) into v_received_total
  from public.goods_receipt_items ri
  join public.goods_receipts gr on gr.id=ri.goods_receipt_id
  where ri.purchase_order_item_id=v_po_item.id;

  if v_received_total+v_qty>v_po_item.quantity then
   raise exception 'Received quantity exceeds remaining ordered quantity for %',v_po_item.description;
  end if;

  insert into public.goods_receipt_items(
   goods_receipt_id,purchase_order_item_id,quantity_received
  ) values(v_gr,v_po_item.id,v_qty);
 end loop;

 update public.purchase_orders
 set status='partially_received',updated_at=now()
 where id=p_po_id;

 insert into public.audit_logs(
  organization_id,actor_id,action,entity_type,entity_id,metadata
 ) values(
  v_po.organization_id,v_user,'goods_receipt.created','goods_receipt',v_gr::text,
  jsonb_build_object('grn_number',v_grn,'purchase_order_id',p_po_id)
 );
 return v_gr;
end;
$$;

revoke all on function public.create_goods_receipt(uuid,date,text,jsonb) from public;
grant execute on function public.create_goods_receipt(uuid,date,text,jsonb) to authenticated;
