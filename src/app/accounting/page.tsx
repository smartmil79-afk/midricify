import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {getWorkspaceContext} from "@/lib/workspace";

function money(value:number,currency:string){try{return new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:2}).format(value||0)}catch{return (currency||"NGN")+" "+(value||0).toLocaleString("en-NG")}}
function Card({label,value,detail,href}:{label:string;value:string;detail:string;href:string}){return <Link href={href} className="rounded-2xl border bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Link>}
export default async function AccountingPage(){
 const ctx=await getWorkspaceContext();const sb=await createClient();
 if(!ctx?.organization)return <main className="min-h-screen bg-slate-50 p-6"><section className="mx-auto max-w-5xl rounded-2xl border bg-white p-8"><h1 className="text-2xl font-bold">Accounting</h1><p className="mt-2 text-slate-600">Sign in to a workspace to view financial activity.</p></section></main>;
 const org=ctx.organization.id;const currency=ctx.organization.base_currency||"NGN";
 const [invRes,payRes,expenseRes,poRes]=await Promise.all([
  sb.from("ap_invoices").select("id,invoice_number,invoice_date,due_date,total,currency_code,status,vendors(name)").eq("organization_id",org).order("invoice_date",{ascending:false}).limit(100),
  sb.from("ap_invoice_payments").select("id,amount,payment_date,method,payment_reference,invoice_id").eq("organization_id",org).order("payment_date",{ascending:false}).limit(100),
  sb.from("expense_requests").select("id,expense_number,title,category,amount,currency_code,expense_date,status,departments(name)").eq("organization_id",org).eq("status","approved").order("expense_date",{ascending:false}).limit(100),
  sb.from("purchase_orders").select("id,po_number,total,currency_code,status,created_at,vendors(name)").eq("organization_id",org).order("created_at",{ascending:false}).limit(100)
 ]);
 const invoices=invRes.data??[];const payments=payRes.data??[];const expenses=expenseRes.data??[];const orders=poRes.data??[];
 const paidByInvoice=new Map<string,number>();for(const p of payments)paidByInvoice.set(p.invoice_id,(paidByInvoice.get(p.invoice_id)||0)+Number(p.amount||0));
 const outstanding=invoices.reduce((sum,i)=>sum+Math.max(Number(i.total||0)-(paidByInvoice.get(i.id)||0),0),0);
 const paidTotal=payments.reduce((sum,p)=>sum+Number(p.amount||0),0);
 const approvedExpenses=expenses.reduce((sum,e)=>sum+Number(e.amount||0),0);
 const committed=orders.filter(o=>["approved","sent","partially_received","received"].includes(o.status)).reduce((sum,o)=>sum+Number(o.total||0),0);
 const now=new Date();const monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
 const monthPayments=payments.filter(p=>p.payment_date>=monthStart).reduce((sum,p)=>sum+Number(p.amount||0),0);
 const monthExpenses=expenses.filter(e=>e.expense_date>=monthStart).reduce((sum,e)=>sum+Number(e.amount||0),0);
 const today=new Date().toISOString().slice(0,10);
 const overdue=invoices.filter(i=>i.due_date&&i.due_date<today&&i.status!=="rejected"&&Number(i.total||0)>(paidByInvoice.get(i.id)||0)).length;
 const recentPayments=payments.slice(0,6);
 const recentExpenses=expenses.slice(0,6);
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="mx-auto max-w-7xl">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-900">Accounting</h1><p className="mt-2 text-slate-500">Financial activity and cash outflow overview for {ctx.organization.name}.</p></div><div className="rounded-xl border bg-white px-4 py-2 text-sm text-slate-600">Reporting currency: <strong className="text-slate-900">{currency}</strong></div></div>
  <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <Card label="Accounts payable outstanding" value={money(outstanding,currency)} detail={invoices.length+" supplier invoices recorded"} href="/accounts-payable"/>
   <Card label="Payments recorded" value={money(paidTotal,currency)} detail={payments.length+" payment transactions"} href="/accounts-payable"/>
   <Card label="Approved expenses" value={money(approvedExpenses,currency)} detail={expenses.length+" approved expense requests"} href="/expenses"/>
   <Card label="Approved PO commitments" value={money(committed,currency)} detail={orders.length+" purchase orders in view"} href="/purchase-orders"/>
  </div>
  <section className="mt-6 grid gap-4 md:grid-cols-3">
   <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Payments this month</p><p className="mt-2 text-xl font-bold">{money(monthPayments,currency)}</p></div>
   <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Approved expenses this month</p><p className="mt-2 text-xl font-bold">{money(monthExpenses,currency)}</p></div>
   <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">Overdue supplier invoices</p><p className="mt-2 text-xl font-bold">{overdue}</p><p className="mt-1 text-xs text-slate-500">Invoices with a remaining balance past due</p></div>
  </section>
  <div className="mt-7 grid gap-6 xl:grid-cols-2">
   <section className="overflow-hidden rounded-2xl border bg-white"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-semibold text-slate-900">Recent payments</h2><p className="mt-1 text-xs text-slate-500">Supplier payments recorded in Accounts Payable</p></div><Link href="/accounts-payable" className="text-sm font-medium text-blue-700">View invoices</Link></div>
    {recentPayments.length?<div className="divide-y">{recentPayments.map(p=><div key={p.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium text-slate-800">{p.payment_reference||"Supplier payment"}</p><p className="mt-1 text-xs text-slate-500">{p.payment_date?new Date(p.payment_date+"T00:00:00").toLocaleDateString("en-NG"):"Date not set"} · {p.method||"Method not specified"}</p></div><p className="text-sm font-semibold text-slate-900">{money(Number(p.amount),currency)}</p></div>)}</div>:<p className="p-8 text-center text-sm text-slate-500">No supplier payments have been recorded yet.</p>}
   </section>
   <section className="overflow-hidden rounded-2xl border bg-white"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-semibold text-slate-900">Approved expenses</h2><p className="mt-1 text-xs text-slate-500">Latest approved expense requests</p></div><Link href="/expenses" className="text-sm font-medium text-blue-700">View expenses</Link></div>
    {recentExpenses.length?<div className="divide-y">{recentExpenses.map(e=><div key={e.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium text-slate-800">{e.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{e.expense_number} · {String(e.category).replaceAll("_"," ")} · {e.expense_date?new Date(e.expense_date+"T00:00:00").toLocaleDateString("en-NG"):""}</p></div><p className="text-sm font-semibold text-slate-900">{money(Number(e.amount),e.currency_code||currency)}</p></div>)}</div>:<p className="p-8 text-center text-sm text-slate-500">No approved expenses recorded yet.</p>}
   </section>
  </div>
  <section className="mt-7 rounded-2xl border border-blue-200 bg-blue-50/70 p-5"><h2 className="font-semibold text-slate-900">Accounting scope</h2><p className="mt-2 text-sm leading-6 text-slate-700">This page currently summarizes live procurement, Accounts Payable, payment and approved-expense records. It is not yet a double-entry general ledger: chart of accounts, journal entries, trial balance, bank reconciliation and financial statements are not available yet.</p><div className="mt-4 flex flex-wrap gap-3 text-sm font-medium"><Link href="/accounts-payable" className="rounded-lg bg-white px-3 py-2 text-blue-700">Accounts Payable</Link><Link href="/expenses" className="rounded-lg bg-white px-3 py-2 text-blue-700">Expenses</Link><Link href="/budgets" className="rounded-lg bg-white px-3 py-2 text-blue-700">Budgets</Link><Link href="/purchase-orders" className="rounded-lg bg-white px-3 py-2 text-blue-700">Purchase Orders</Link></div></section>
 </div></main>;
}
