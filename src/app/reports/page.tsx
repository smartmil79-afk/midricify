import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {getWorkspaceContext} from "@/lib/workspace";
function money(n:number,c:string){try{return new Intl.NumberFormat("en-NG",{style:"currency",currency:c,maximumFractionDigits:2}).format(n||0)}catch{return c+" "+(n||0).toLocaleString()}}
export default async function ReportsPage(){
 const ctx=await getWorkspaceContext();const sb=await createClient();
 if(!ctx?.organization)return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-6xl rounded-2xl border bg-white p-8"><h1 className="text-2xl font-bold">Reports</h1><p className="mt-2 text-slate-500">Sign in to a workspace to view reports.</p></div></main>;
 const org=ctx.organization.id,currency=ctx.organization.base_currency||"NGN";
 const [budgetRes,expenseRes,invoiceRes,paymentRes,requestRes]=await Promise.all([
  sb.from("department_budgets").select("id,name,department_id,period_start,period_end,currency_code,allocated_amount,departments(name)").eq("organization_id",org).order("name"),
  sb.from("expense_requests").select("id,expense_number,title,amount,status,expense_date,department_id,departments(name)").eq("organization_id",org).order("expense_date",{ascending:false}).limit(500),
  sb.from("ap_invoices").select("id,total,status,due_date,invoice_date").eq("organization_id",org).limit(500),
  sb.from("ap_invoice_payments").select("amount,payment_date").eq("organization_id",org).limit(500),
  sb.from("purchase_requests").select("id,subtotal,status,created_at,department_id,departments(name)").eq("organization_id",org).eq("is_draft",false).limit(500)
 ]);
 const budgets=budgetRes.data??[],expenses=expenseRes.data??[],invoices=invoiceRes.data??[],payments=paymentRes.data??[],requests=requestRes.data??[];
 const {data:summary}=budgets.length?await sb.from("budget_commitment_summary").select("budget_id,committed_amount,actual_spend").in("budget_id",budgets.map(b=>b.id)):{data:[]};
 const summaryMap=new Map((summary??[]).map((s:any)=>[s.budget_id,s]));
 const budgetRows=budgets.map(b=>{const s:any=summaryMap.get(b.id)||{};const allocated=Number(b.allocated_amount||0),committed=Number(s.committed_amount||0),actual=Number(s.actual_spend||0);return {...b,allocated,committed,actual,available:allocated-committed-actual}});
 const totalAllocated=budgetRows.reduce((n,b)=>n+b.allocated,0),totalCommitted=budgetRows.reduce((n,b)=>n+b.committed,0),totalActual=budgetRows.reduce((n,b)=>n+b.actual,0);
 const approvedExpenses=expenses.filter(e=>e.status==="approved").reduce((n,e)=>n+Number(e.amount||0),0);
 const pendingExpenses=expenses.filter(e=>e.status==="submitted").reduce((n,e)=>n+Number(e.amount||0),0);
 const paid=payments.reduce((n,p)=>n+Number(p.amount||0),0);
 const outstanding=invoices.reduce((n,i)=>n+Math.max(Number(i.total||0),0),0)-paid;
 const byDepartment=new Map<string,{name:string;approved:number;pending:number;count:number}>();
 for(const e of expenses){const name=(Array.isArray((e as any).departments)?(e as any).departments[0]?.name:(e as any).departments?.name)||"Unassigned";const item=byDepartment.get(name)||{name,approved:0,pending:0,count:0};if(e.status==="approved")item.approved+=Number(e.amount||0);if(e.status==="submitted")item.pending+=Number(e.amount||0);item.count++;byDepartment.set(name,item);}
 const deptRows=[...byDepartment.values()].sort((a,b)=>b.approved-a.approved);
 const requestCounts=["submitted","approved","rejected"].map(status=>({status,count:requests.filter(r=>r.status===status).length,amount:requests.filter(r=>r.status===status).reduce((n,r)=>n+Number(r.subtotal||0),0)}));
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="mx-auto max-w-7xl">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold text-slate-900">Reports & Analytics</h1><p className="mt-2 text-slate-500">Live operational and financial summaries for {ctx.organization.name}.</p></div><span className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-600">Currency: {currency}</span></div>
  <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   {[["Total budget allocation",money(totalAllocated,currency)],["Budget commitments",money(totalCommitted,currency)],["Actual supplier payments",money(totalActual,currency)],["Approved expenses",money(approvedExpenses,currency)]].map(([label,value])=><div key={label} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></div>)}
  </div>
  <div className="mt-4 grid gap-4 sm:grid-cols-3">
   {[["Pending expense approvals",money(pendingExpenses,currency)],["AP outstanding (gross less recorded payments)",money(Math.max(outstanding,0),currency)],["Purchase requests",String(requests.length)]].map(([label,value])=><div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>)}
  </div>
  <section className="mt-7 overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Department budget performance</h2><p className="mt-1 text-xs text-slate-500">Approved expenses are included in commitments; payments against supplier invoices are shown separately as actual spend.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="bg-slate-50"><tr>{["Department / Budget","Allocation","Committed","Actual paid","Available"].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>{budgetRows.map(b=><tr key={b.id} className="border-t"><td className="p-3 font-medium">{(Array.isArray((b as any).departments)?(b as any).departments[0]?.name:(b as any).departments?.name)||"Corporate"}<div className="text-xs font-normal text-slate-500">{b.name} · {b.period_start} to {b.period_end}</div></td><td className="p-3">{money(b.allocated,b.currency_code||currency)}</td><td className="p-3">{money(b.committed,b.currency_code||currency)}</td><td className="p-3">{money(b.actual,b.currency_code||currency)}</td><td className={`p-3 font-semibold ${b.available<0?"text-red-700":"text-emerald-700"}`}>{money(b.available,b.currency_code||currency)}</td></tr>)}{!budgetRows.length&&<tr><td colSpan={5} className="p-8 text-center text-slate-500">No budget allocations yet. Create departmental budgets to populate this report.</td></tr>}</tbody></table></div></section>
  <div className="mt-7 grid gap-6 xl:grid-cols-2">
   <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Expense report by department</h2><p className="mt-1 text-xs text-slate-500">Approved and awaiting-approval expense requests.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Department</th><th className="p-3 text-right">Approved</th><th className="p-3 text-right">Pending</th><th className="p-3 text-right">Requests</th></tr></thead><tbody>{deptRows.map(r=><tr key={r.name} className="border-t"><td className="p-3">{r.name}</td><td className="p-3 text-right">{money(r.approved,currency)}</td><td className="p-3 text-right">{money(r.pending,currency)}</td><td className="p-3 text-right">{r.count}</td></tr>)}{!deptRows.length&&<tr><td colSpan={4} className="p-6 text-center text-slate-500">No expense records available.</td></tr>}</tbody></table></div></section>
   <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Purchase request pipeline</h2><p className="mt-1 text-xs text-slate-500">Request counts and values by current status.</p></div><div className="divide-y">{requestCounts.map(r=><div key={r.status} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium capitalize">{r.status}</p><p className="mt-1 text-xs text-slate-500">{r.count} requests</p></div><p className="text-sm font-semibold">{money(r.amount,currency)}</p></div>)}</div></section>
  </div>
  <div className="mt-7 flex flex-wrap gap-3 text-sm"><Link href="/budgets" className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white">Manage budgets</Link><Link href="/expenses" className="rounded-lg border bg-white px-4 py-2.5 font-semibold text-slate-700">Expense management</Link><Link href="/accounts-payable" className="rounded-lg border bg-white px-4 py-2.5 font-semibold text-slate-700">Accounts payable</Link></div>
 </div></main>;
}
