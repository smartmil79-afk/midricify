-- Phase 2.6.1: release paid amounts from commitments to prevent budget double-counting.
-- A purchase order's unpaid balance remains committed; payments are counted as actual spend.
create or replace view public.budget_commitment_summary
with (security_invoker = true) as
select
  b.id as budget_id,
  b.organization_id,
  coalesce((
    select sum(pr.subtotal)
    from public.purchase_requests pr
    where pr.organization_id = b.organization_id
      and pr.department_id is not distinct from b.department_id
      and pr.status = 'approved'
      and pr.created_at::date between b.period_start and b.period_end
      and not exists (
        select 1
        from public.purchase_orders po
        where po.purchase_request_id = pr.id
      )
  ), 0)
  + coalesce((
    select sum(greatest(
      po.total - coalesce((
        select sum(pay.amount)
        from public.ap_invoices inv
        join public.ap_invoice_payments pay on pay.invoice_id = inv.id
        where inv.purchase_order_id = po.id
          and pay.organization_id = b.organization_id
      ), 0),
      0
    ))
    from public.purchase_orders po
    join public.purchase_requests pr on pr.id = po.purchase_request_id
    where po.organization_id = b.organization_id
      and pr.department_id is not distinct from b.department_id
      and po.status not in ('cancelled', 'draft', 'rejected')
      and po.created_at::date between b.period_start and b.period_end
  ), 0) as committed_amount,
  coalesce((
    select sum(pay.amount)
    from public.ap_invoice_payments pay
    join public.ap_invoices inv on inv.id = pay.invoice_id
    join public.purchase_orders po on po.id = inv.purchase_order_id
    join public.purchase_requests pr on pr.id = po.purchase_request_id
    where pay.organization_id = b.organization_id
      and pr.department_id is not distinct from b.department_id
      and pay.payment_date between b.period_start and b.period_end
  ), 0) as actual_spend
from public.department_budgets b;
