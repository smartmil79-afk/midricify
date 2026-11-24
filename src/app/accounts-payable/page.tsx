import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export default async function AccountsPayablePage() {
  const ctx = await getWorkspaceContext();
  const sb = await createClient();
  let rows: any[] = [];

  if (ctx?.organization) {
    const { data } = await sb
      .from("ap_invoices")
      .select("id,invoice_number,invoice_date,due_date,total,currency_code,status,vendors(name),purchase_orders(po_number)")
      .eq("organization_id", ctx.organization.id)
      .order("invoice_date", { ascending: false });
    rows = data ?? [];
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-blue-700">← Dashboard</Link>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Accounts Payable</h1>
            <p className="text-slate-500">Supplier invoices, matching exceptions and payment tracking.</p>
          </div>
          <Link href="/accounts-payable/new" className="rounded-lg bg-blue-700 px-4 py-2 text-white">
            + Record Invoice
          </Link>
        </div>
        <div className="mt-6 overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left">Invoice</th>
                <th className="p-3 text-left">Vendor</th>
                <th className="p-3 text-left">PO</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-left">Due</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr className="border-t" key={invoice.id}>
                  <td className="p-3">
                    <Link className="font-medium text-blue-700" href={`/accounts-payable/${invoice.id}`}>
                      {invoice.invoice_number}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {new Date(invoice.invoice_date).toLocaleDateString("en-NG")}
                    </div>
                  </td>
                  <td className="p-3">{invoice.vendors?.name ?? "—"}</td>
                  <td className="p-3">{invoice.purchase_orders?.po_number ?? "—"}</td>
                  <td className="p-3 text-right">
                    {new Intl.NumberFormat("en-NG", { style: "currency", currency: invoice.currency_code }).format(invoice.total)}
                  </td>
                  <td className="p-3">
                    {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-NG") : "—"}
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-slate-100 px-2 py-1 capitalize">
                      {String(invoice.status).replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No supplier invoices recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
