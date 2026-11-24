import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { InvoiceActions } from "./InvoiceActions";

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  const sb = await createClient();
  const { data: invoice } = await sb
    .from("ap_invoices")
    .select("*,vendors(name,email),purchase_orders(po_number),ap_invoice_items(*),ap_invoice_payments(*)")
    .eq("id", id)
    .single();

  if (!invoice || !ctx?.organization || invoice.organization_id !== ctx.organization.id) {
    return <main className="p-8">Invoice not found.</main>;
  }

  const payments = invoice.ap_invoice_payments ?? [];
  const paid = payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
  const outstanding = Number(invoice.total) - paid;
  const match = invoice.match_summary ?? {};
  const lines = match.lines ?? [];

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/accounts-payable" className="text-sm text-blue-700">← Accounts Payable</Link>
        <div className="mt-4 flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Invoice {invoice.invoice_number}</h1>
            <p className="text-slate-500">PO {invoice.purchase_orders?.po_number} · {invoice.vendors?.name}</p>
          </div>
          <span className="h-fit rounded-full bg-slate-100 px-3 py-1 capitalize">
            {String(invoice.status).replaceAll("_", " ")}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {[
            ["Invoice total", invoice.total],
            ["Paid", paid],
            ["Outstanding", outstanding],
            ["Tax", invoice.tax_amount],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border bg-white p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-semibold">
                {new Intl.NumberFormat("en-NG", { style: "currency", currency: invoice.currency_code }).format(Number(value))}
              </p>
            </div>
          ))}
        </div>

        <section className="mt-5 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Three-way match results</h2>
          <p className={`mt-1 text-sm ${match.matched ? "text-green-700" : "text-amber-700"}`}>
            {match.matched
              ? "Matched — quantities and prices align."
              : "Exception — review quantity or price variances before approval."}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left">Line</th>
                  <th className="p-2 text-right">PO Qty</th>
                  <th className="p-2 text-right">Accepted</th>
                  <th className="p-2 text-right">Invoice Qty</th>
                  <th className="p-2 text-right">PO Price</th>
                  <th className="p-2 text-right">Invoice Price</th>
                  <th className="p-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line: any) => (
                  <tr key={line.po_item_id} className="border-t">
                    <td className="p-2">{line.description}</td>
                    <td className="p-2 text-right">{line.ordered_qty}</td>
                    <td className="p-2 text-right">{line.accepted_qty}</td>
                    <td className="p-2 text-right">{line.invoiced_qty}</td>
                    <td className="p-2 text-right">{line.po_unit_price}</td>
                    <td className="p-2 text-right">{line.invoice_unit_price}</td>
                    <td className="p-2">
                      {line.quantity_match && line.price_match
                        ? "Matched"
                        : !line.quantity_match
                          ? "Quantity exception"
                          : "Price exception"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Invoice lines</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit price</th>
                  <th className="p-2 text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.ap_invoice_items ?? []).map((line: any) => (
                  <tr key={line.id} className="border-t">
                    <td className="p-2">{line.description}</td>
                    <td className="p-2 text-right">{line.quantity}</td>
                    <td className="p-2 text-right">{line.unit_price}</td>
                    <td className="p-2 text-right">{line.line_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Payments</h2>
          {payments.length > 0 ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Reference</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-left">Method</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment: any) => (
                  <tr className="border-t" key={payment.id}>
                    <td className="p-2">{payment.payment_reference}</td>
                    <td className="p-2">{payment.payment_date}</td>
                    <td className="p-2 text-right">{payment.amount}</td>
                    <td className="p-2">{payment.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No payments recorded.</p>
          )}
        </section>

        <div className="mt-5">
          <InvoiceActions invoiceId={invoice.id} status={invoice.status} outstanding={outstanding} />
        </div>
      </div>
    </main>
  );
}
