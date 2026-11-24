import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { InvoiceForm } from "./InvoiceForm";

export default async function NewInvoicePage() {
  const ctx = await getWorkspaceContext();
  const sb = await createClient();
  let orders: any[] = [];

  if (ctx?.organization) {
    const { data } = await sb
      .from("purchase_orders")
      .select("id,po_number,status,vendor_id,currency_code,vendors(name),purchase_order_items(id,description,quantity,unit,unit_price)")
      .eq("organization_id", ctx.organization.id)
      .in("status", ["approved", "sent", "acknowledged", "partially_received", "received"])
      .order("created_at", { ascending: false });

    orders = (data ?? []).map((order) => ({
      ...order,
      vendor: order.vendors,
      items: order.purchase_order_items ?? [],
    }));
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/accounts-payable" className="text-sm text-blue-700">← Accounts Payable</Link>
        <h1 className="mt-4 text-2xl font-bold">Record Supplier Invoice</h1>
        <p className="mb-5 text-slate-500">Capture an invoice and run automated three-way matching.</p>
        {orders.length > 0 ? (
          <InvoiceForm orders={orders} />
        ) : (
          <div className="rounded-xl border bg-white p-6">
            No approved Purchase Orders are available for invoicing.
          </div>
        )}
      </div>
    </main>
  );
}
