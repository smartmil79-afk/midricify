-- Phase 2.5 Accounts Payable and PO/GRN/Invoice three-way matching
create table if not exists public.ap_invoices (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 purchase_order_id uuid not null references public.purchase_orders(id),
 vendor_id uuid not null references public.vendors(id),
 invoice_number text not null,
 invoice_date date not null,
 due_date date,
 currency_code text not null default 'NGN',
 subtotal numeric(14,2) not null default 0,
 tax_amount numeric(14,2) not null default 0,
 total numeric(14,2) not null default 0,
 status text not null default 'draft' check(status in ('draft','pending_match','matched','exception','approved','paid','rejected')),
 match_summary jsonb not null default '{}'::jsonb,
 notes text,
 created_by uuid references auth.users(id),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,vendor_id,invoice_number)
);
create table if not exists public.ap_invoice_items (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.ap_invoices(id) on delete cascade,
 purchase_order_item_id uuid not null references public.purchase_order_items(id),
 description text not null,
 quantity numeric(12,2) not null check(quantity>0),
 unit_price numeric(14,2) not null check(unit_price>=0),
 line_total numeric(14,2) generated always as (quantity*unit_price) stored,
 created_at timestamptz not null default now()
);
create table if not exists public.ap_invoice_payments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_id uuid not null references public.ap_invoices(id) on delete cascade,
 payment_reference text not null,
 payment_date date not null,
 amount numeric(14,2) not null check(amount>0),
 method text,
 notes text,
 recorded_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists ap_invoices_org_date_idx on public.ap_invoices(organization_id,invoice_date desc);
create index if not exists ap_items_invoice_idx on public.ap_invoice_items(invoice_id);
alter table public.ap_invoices enable row level security;
alter table public.ap_invoice_items enable row level security;
alter table public.ap_invoice_payments enable row level security;
drop policy if exists ap_invoice_read on public.ap_invoices;
create policy ap_invoice_read on public.ap_invoices for select using(public.is_org_member(organization_id));
drop policy if exists ap_invoice_insert on public.ap_invoices;
create policy ap_invoice_insert on public.ap_invoices for insert with check(public.has_org_role(organization_id,array['company_admin','finance_officer','accountant','procurement_officer']));
drop policy if exists ap_invoice_update on public.ap_invoices;
create policy ap_invoice_update on public.ap_invoices for update using(public.has_org_role(organization_id,array['company_admin','finance_officer','accountant'])) with check(public.has_org_role(organization_id,array['company_admin','finance_officer','accountant']));
drop policy if exists ap_items_read on public.ap_invoice_items;
create policy ap_items_read on public.ap_invoice_items for select using(exists(select 1 from public.ap_invoices i where i.id=invoice_id and public.is_org_member(i.organization_id)));
drop policy if exists ap_items_write on public.ap_invoice_items;
create policy ap_items_write on public.ap_invoice_items for all using(exists(select 1 from public.ap_invoices i where i.id=invoice_id and public.has_org_role(i.organization_id,array['company_admin','finance_officer','accountant','procurement_officer']))) with check(exists(select 1 from public.ap_invoices i where i.id=invoice_id and public.has_org_role(i.organization_id,array['company_admin','finance_officer','accountant','procurement_officer'])));
drop policy if exists ap_payments_read on public.ap_invoice_payments;
create policy ap_payments_read on public.ap_invoice_payments for select using(public.is_org_member(organization_id));
drop policy if exists ap_payments_write on public.ap_invoice_payments;
create policy ap_payments_write on public.ap_invoice_payments for insert with check(public.has_org_role(organization_id,array['company_admin','finance_officer','accountant']));

create or replace function public.create_ap_invoice(p_po_id uuid,p_invoice_number text,p_invoice_date date,p_due_date date,p_tax numeric,p_notes text,p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_po public.purchase_orders%rowtype; v_vendor public.vendors%rowtype; v_id uuid; v_item jsonb; v_poi public.purchase_order_items%rowtype; v_qty numeric; v_price numeric; v_sub numeric:=0; v_total numeric; v_acc numeric; v_received numeric; v_billed numeric; v_variance numeric; v_exception boolean:=false; v_details jsonb:='[]'::jsonb; v_currency text;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if coalesce(trim(p_invoice_number),'')='' then raise exception 'Supplier invoice number required'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Invoice needs at least one line'; end if;
 select * into v_po from public.purchase_orders where id=p_po_id for update;
 if not found or not public.is_org_member(v_po.organization_id) then raise exception 'PO not found or unauthorized'; end if;
 if v_po.status not in ('approved','sent','acknowledged','partially_received','received') then raise exception 'Invoice can only be recorded against an approved PO'; end if;
 if not public.has_org_role(v_po.organization_id,array['company_admin','finance_officer','accountant','procurement_officer']) then raise exception 'AP entry permission required'; end if;
 select * into v_vendor from public.vendors where id=v_po.vendor_id;
 v_currency:=v_po.currency_code;
 insert into public.ap_invoices(organization_id,purchase_order_id,vendor_id,invoice_number,invoice_date,due_date,currency_code,tax_amount,notes,created_by,status)
 values(v_po.organization_id,p_po_id,v_po.vendor_id,trim(p_invoice_number),coalesce(p_invoice_date,current_date),p_due_date,v_currency,greatest(coalesce(p_tax,0),0),nullif(trim(p_notes),''),v_user,'pending_match') returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  select * into v_poi from public.purchase_order_items where id=(v_item->>'purchase_order_item_id')::uuid and purchase_order_id=p_po_id;
  if not found then raise exception 'Invalid PO line selected'; end if;
  v_qty:=(v_item->>'quantity')::numeric; v_price:=(v_item->>'unit_price')::numeric;
  if v_qty<=0 or v_price<0 then raise exception 'Invalid billed quantity or price'; end if;
  insert into public.ap_invoice_items(invoice_id,purchase_order_item_id,description,quantity,unit_price) values(v_id,v_poi.id,v_poi.description,v_qty,v_price);
  v_sub:=v_sub+(v_qty*v_price);
  select coalesce(sum(ri.quantity_accepted),0) into v_acc from public.goods_receipt_items ri join public.goods_receipts gr on gr.id=ri.goods_receipt_id where ri.purchase_order_item_id=v_poi.id and gr.status in ('accepted','partially_accepted');
  select coalesce(sum(ri.quantity_received),0) into v_received from public.goods_receipt_items ri join public.goods_receipts gr on gr.id=ri.goods_receipt_id where ri.purchase_order_item_id=v_poi.id and gr.status<>'rejected';
  select coalesce(sum(ai.quantity),0) into v_billed from public.ap_invoice_items ai join public.ap_invoices ap on ap.id=ai.invoice_id where ai.purchase_order_item_id=v_poi.id and ap.status not in ('rejected');
  v_variance:=v_price-v_poi.unit_price;
  if v_billed>v_acc then v_exception:=true; end if;
  if abs(v_variance)>0.01 then v_exception:=true; end if;
  v_details:=v_details||jsonb_build_array(jsonb_build_object('po_item_id',v_poi.id,'description',v_poi.description,'ordered_qty',v_poi.quantity,'received_qty',v_received,'accepted_qty',v_acc,'invoiced_qty',v_qty,'cumulative_invoiced_qty',v_billed,'po_unit_price',v_poi.unit_price,'invoice_unit_price',v_price,'price_variance',v_variance,'quantity_match',v_billed<=v_acc,'price_match',abs(v_variance)<=0.01));
 end loop;
 v_total:=v_sub+greatest(coalesce(p_tax,0),0);
 update public.ap_invoices set subtotal=v_sub,total=v_total,match_summary=jsonb_build_object('matched',not v_exception,'lines',v_details,'subtotal',v_sub,'tax',greatest(coalesce(p_tax,0),0),'total',v_total),status=case when v_exception then 'exception' else 'matched' end where id=v_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_po.organization_id,v_user,'ap_invoice.created','ap_invoice',v_id::text,jsonb_build_object('invoice_number',p_invoice_number,'po_number',v_po.po_number,'total',v_total,'match_status',case when v_exception then 'exception' else 'matched' end));
 return v_id;
end $$;

create or replace function public.approve_ap_invoice(p_invoice_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_inv public.ap_invoices%rowtype;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select * into v_inv from public.ap_invoices where id=p_invoice_id for update;
 if not found or not public.is_org_member(v_inv.organization_id) then raise exception 'Invoice not found or unauthorized'; end if;
 if not public.has_org_role(v_inv.organization_id,array['company_admin','finance_officer','accountant']) then raise exception 'Finance approval required'; end if;
 if v_inv.status<>'matched' then raise exception 'Only matched invoices can be approved. Resolve exceptions first.'; end if;
 update public.ap_invoices set status='approved',reviewed_by=v_user,reviewed_at=now(),updated_at=now() where id=p_invoice_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_inv.organization_id,v_user,'ap_invoice.approved','ap_invoice',p_invoice_id::text,jsonb_build_object('note',p_note,'amount',v_inv.total));
end $$;


create or replace function public.record_ap_payment(p_invoice_id uuid,p_reference text,p_date date,p_amount numeric,p_method text,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_inv public.ap_invoices%rowtype; v_paid numeric; v_payment uuid;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 select * into v_inv from public.ap_invoices where id=p_invoice_id for update;
 if not found or not public.is_org_member(v_inv.organization_id) then raise exception 'Invoice not found or unauthorized'; end if;
 if not public.has_org_role(v_inv.organization_id,array['company_admin','finance_officer','accountant']) then raise exception 'Payment recording permission required'; end if;
 if v_inv.status not in ('approved','paid') then raise exception 'Invoice must be approved before payment'; end if;
 if coalesce(trim(p_reference),'')='' or p_amount<=0 then raise exception 'Payment reference and positive amount are required'; end if;
 select coalesce(sum(amount),0) into v_paid from public.ap_invoice_payments where invoice_id=p_invoice_id;
 if v_paid+p_amount>v_inv.total then raise exception 'Payment exceeds outstanding balance'; end if;
 insert into public.ap_invoice_payments(organization_id,invoice_id,payment_reference,payment_date,amount,method,notes,recorded_by)
 values(v_inv.organization_id,p_invoice_id,trim(p_reference),coalesce(p_date,current_date),p_amount,nullif(trim(p_method),''),nullif(trim(p_notes),''),v_user) returning id into v_payment;
 select coalesce(sum(amount),0) into v_paid from public.ap_invoice_payments where invoice_id=p_invoice_id;
 if v_paid>=v_inv.total then update public.ap_invoices set status='paid',updated_at=now() where id=p_invoice_id; end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_inv.organization_id,v_user,'ap_invoice.payment_recorded','ap_invoice',p_invoice_id::text,jsonb_build_object('reference',p_reference,'amount',p_amount,'total_paid',v_paid));
 return v_payment;
end $$;

revoke all on function public.create_ap_invoice(uuid,text,date,date,numeric,text,jsonb) from public;
revoke all on function public.approve_ap_invoice(uuid,text) from public;
revoke all on function public.record_ap_payment(uuid,text,date,numeric,text,text) from public;
grant execute on function public.create_ap_invoice(uuid,text,date,date,numeric,text,jsonb) to authenticated;
grant execute on function public.approve_ap_invoice(uuid,text) to authenticated;
grant execute on function public.record_ap_payment(uuid,text,date,numeric,text,text) to authenticated;
