-- Phase 2.4: Goods Receiving, inspection and stock updates
create table if not exists public.goods_receipts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 purchase_order_id uuid not null references public.purchase_orders(id),
 grn_number text not null,
 status text not null default 'pending_inspection' check(status in ('pending_inspection','accepted','rejected','partially_accepted')),
 received_date date not null default current_date,
 delivery_note_number text,
 received_by uuid references auth.users(id),
 inspected_by uuid references auth.users(id),
 inspection_note text,
 created_at timestamptz not null default now(),
 inspected_at timestamptz,
 unique(organization_id,grn_number)
);
create table if not exists public.goods_receipt_items (
 id uuid primary key default gen_random_uuid(),
 goods_receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
 purchase_order_item_id uuid not null references public.purchase_order_items(id),
 quantity_received numeric(12,2) not null check(quantity_received>0),
 quantity_accepted numeric(12,2) not null default 0 check(quantity_accepted>=0),
 quantity_rejected numeric(12,2) not null default 0 check(quantity_rejected>=0),
 rejection_reason text,
 created_at timestamptz not null default now(),
 check(quantity_accepted+quantity_rejected<=quantity_received)
);
create table if not exists public.inventory_stock (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 item_description text not null,
 unit text not null default 'unit',
 quantity_on_hand numeric(14,2) not null default 0,
 updated_at timestamptz not null default now(),
 unique(organization_id,item_description,unit)
);
create index if not exists goods_receipts_org_date_idx on public.goods_receipts(organization_id,received_date desc);
create index if not exists gr_items_receipt_idx on public.goods_receipt_items(goods_receipt_id);
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.inventory_stock enable row level security;
drop policy if exists gr_member_read on public.goods_receipts;
create policy gr_member_read on public.goods_receipts for select using(public.is_org_member(organization_id));
drop policy if exists gr_member_write on public.goods_receipts;
create policy gr_member_write on public.goods_receipts for all using(public.has_org_role(organization_id,array['company_admin','storekeeper','procurement_officer'])) with check(public.has_org_role(organization_id,array['company_admin','storekeeper','procurement_officer']));
drop policy if exists gri_member_read on public.goods_receipt_items;
create policy gri_member_read on public.goods_receipt_items for select using(exists(select 1 from public.goods_receipts g where g.id=goods_receipt_id and public.is_org_member(g.organization_id)));
drop policy if exists gri_member_write on public.goods_receipt_items;
create policy gri_member_write on public.goods_receipt_items for all using(exists(select 1 from public.goods_receipts g where g.id=goods_receipt_id and public.has_org_role(g.organization_id,array['company_admin','storekeeper','procurement_officer']))) with check(exists(select 1 from public.goods_receipts g where g.id=goods_receipt_id and public.has_org_role(g.organization_id,array['company_admin','storekeeper','procurement_officer'])));
drop policy if exists stock_member_read on public.inventory_stock;
create policy stock_member_read on public.inventory_stock for select using(public.is_org_member(organization_id));
drop policy if exists stock_admin_write on public.inventory_stock;
create policy stock_admin_write on public.inventory_stock for all using(public.has_org_role(organization_id,array['company_admin','storekeeper','procurement_officer'])) with check(public.has_org_role(organization_id,array['company_admin','storekeeper','procurement_officer']));

create or replace function public.create_goods_receipt(p_po_id uuid,p_received_date date,p_delivery_note text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_po public.purchase_orders%rowtype; v_gr uuid; v_grn text; v_seq int; v_item jsonb; v_po_item public.purchase_order_items%rowtype; v_qty numeric; v_received_total numeric;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select * into v_po from public.purchase_orders where id=p_po_id for update;
 if not found or not public.is_org_member(v_po.organization_id) then raise exception 'Purchase order not found or unauthorized'; end if;
 if v_po.status not in ('approved','sent','acknowledged','partially_received') then raise exception 'PO must be approved before receiving goods'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Enter at least one received item'; end if;
 perform pg_advisory_xact_lock(hashtext(v_po.organization_id::text||to_char(now(),'YYYY')));
 select count(*)+1 into v_seq from public.goods_receipts where organization_id=v_po.organization_id and date_part('year',created_at)=date_part('year',now());
 v_grn:='GRN-'||to_char(now(),'YYYY')||'-'||lpad(v_seq::text,5,'0');
 insert into public.goods_receipts(organization_id,purchase_order_id,grn_number,received_date,delivery_note_number,received_by)
 values(v_po.organization_id,p_po_id,v_grn,coalesce(p_received_date,current_date),nullif(trim(p_delivery_note),''),v_user) returning id into v_gr;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_po_item from public.purchase_order_items where id=(v_item->>'purchase_order_item_id')::uuid and purchase_order_id=p_po_id;
  if not found then raise exception 'Invalid PO line'; end if;
  v_qty:=(v_item->>'quantity_received')::numeric;
  if v_qty<=0 then raise exception 'Received quantity must be greater than zero'; end if;
  select coalesce(sum(case when gr.status='pending_inspection' then ri.quantity_received else ri.quantity_accepted end),0) into v_received_total from public.goods_receipt_items ri join public.goods_receipts gr on gr.id=ri.goods_receipt_id where ri.purchase_order_item_id=v_po_item.id;
  if v_received_total+v_qty>v_po_item.quantity then raise exception 'Received quantity exceeds remaining ordered quantity for %',v_po_item.description; end if;
  insert into public.goods_receipt_items(goods_receipt_id,purchase_order_item_id,quantity_received) values(v_gr,v_po_item.id,v_qty);
 end loop;
 update public.purchase_orders set status='partially_received',updated_at=now() where id=p_po_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_po.organization_id,v_user,'goods_receipt.created','goods_receipt',v_gr::text,jsonb_build_object('grn_number',v_grn,'purchase_order_id',p_po_id));
 return v_gr;
end $$;

create or replace function public.inspect_goods_receipt(p_receipt_id uuid,p_decisions jsonb,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_gr public.goods_receipts%rowtype; v_line public.goods_receipt_items%rowtype; v_dec jsonb; v_accepted numeric; v_rejected numeric; v_reason text; v_any_accept boolean:=false; v_any_reject boolean:=false; v_po uuid; v_org uuid;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select * into v_gr from public.goods_receipts where id=p_receipt_id for update;
 if not found or not public.is_org_member(v_gr.organization_id) then raise exception 'Receipt not found or unauthorized'; end if;
 if v_gr.status<>'pending_inspection' then raise exception 'Receipt is already inspected'; end if;
 if not public.has_org_role(v_gr.organization_id,array['company_admin','storekeeper','procurement_officer','auditor']) then raise exception 'Inspection permission required'; end if;
 for v_line in select * from public.goods_receipt_items where goods_receipt_id=p_receipt_id for update loop
  select d.value into v_dec from jsonb_array_elements(p_decisions) d(value) where (d.value->>'goods_receipt_item_id')::uuid=v_line.id;
  if v_dec is null then raise exception 'Inspection decision missing for every line'; end if;
  v_accepted:=coalesce((v_dec->>'quantity_accepted')::numeric,0); v_rejected:=coalesce((v_dec->>'quantity_rejected')::numeric,0); v_reason:=nullif(trim(v_dec->>'rejection_reason'),'');
  if v_accepted<0 or v_rejected<0 or v_accepted+v_rejected<>v_line.quantity_received then raise exception 'Accepted and rejected quantities must equal quantity received'; end if;
  if v_rejected>0 and coalesce(v_reason,'')='' then raise exception 'Rejection reason is required for rejected items'; end if;
  update public.goods_receipt_items set quantity_accepted=v_accepted,quantity_rejected=v_rejected,rejection_reason=v_reason where id=v_line.id;
  if v_accepted>0 then
   insert into public.inventory_stock(organization_id,item_description,unit,quantity_on_hand)
   select v_gr.organization_id,poi.description,poi.unit,v_accepted from public.purchase_order_items poi where poi.id=v_line.purchase_order_item_id
   on conflict(organization_id,item_description,unit) do update set quantity_on_hand=public.inventory_stock.quantity_on_hand+excluded.quantity_on_hand,updated_at=now();
  end if;
  if v_accepted>0 then v_any_accept:=true; end if; if v_rejected>0 then v_any_reject:=true; end if;
 end loop;
 update public.goods_receipts set status=case when v_any_accept and v_any_reject then 'partially_accepted' when v_any_accept then 'accepted' else 'rejected' end,inspected_by=v_user,inspection_note=nullif(trim(coalesce(p_note,'')),''),inspected_at=now() where id=p_receipt_id;
 select purchase_order_id into v_po from public.goods_receipts where id=p_receipt_id;
 if not exists(select 1 from public.purchase_order_items poi where poi.purchase_order_id=v_po and coalesce((select sum(ri.quantity_accepted) from public.goods_receipt_items ri join public.goods_receipts gr on gr.id=ri.goods_receipt_id where ri.purchase_order_item_id=poi.id and gr.status<>'rejected'),0)<poi.quantity) then
  update public.purchase_orders set status='received',updated_at=now() where id=v_po;
 else
  update public.purchase_orders set status='partially_received',updated_at=now() where id=v_po;
 end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_gr.organization_id,v_user,'goods_receipt.inspected','goods_receipt',p_receipt_id::text,jsonb_build_object('status',case when v_any_accept and v_any_reject then 'partially_accepted' when v_any_accept then 'accepted' else 'rejected' end,'note',p_note));
 return jsonb_build_object('status','inspected','goods_receipt_id',p_receipt_id);
end $$;
revoke all on function public.create_goods_receipt(uuid,date,text,jsonb) from public;
revoke all on function public.inspect_goods_receipt(uuid,jsonb,text) from public;
grant execute on function public.create_goods_receipt(uuid,date,text,jsonb) to authenticated;
grant execute on function public.inspect_goods_receipt(uuid,jsonb,text) to authenticated;
