import Link from "next/link";
import { signOut } from "./actions/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import {
  ArrowUpRight, Bell, ChevronDown, ClipboardList, CreditCard, FileText, LayoutDashboard,
  Package, Settings, ShieldCheck, Users, Wallet, BarChart3, CircleDollarSign, Clock3, ShoppingCart
} from "lucide-react";

const nav = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Procurement", icon: ClipboardList },
  { label: "Budgets", icon: Wallet },
  { label: "Vendors", icon: Users },
  { label: "Purchase Orders", icon: ShoppingCart },
  { label: "Goods Receiving", icon: Package },
  { label: "Invoices & Payables", icon: FileText },
  { label: "Accounting", icon: CircleDollarSign },
  { label: "Inventory", icon: Package },
  { label: "Reports", icon: BarChart3 }
];

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
}
function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "approved" || normalized === "paid" || normalized === "completed") return "bg-emerald-50 text-emerald-700";
  if (normalized.includes("pending") || normalized.includes("submitted")) return "bg-amber-50 text-amber-700";
  if (normalized.includes("reject") || normalized.includes("cancel")) return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}
function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function Home() {
  const workspace = await getWorkspaceContext();
  const displayName = workspace?.user.fullName || workspace?.user.email?.split("@")[0] || "Workspace User";
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const workspaceName = workspace?.organization?.name || "Your Workspace";
  const currency = workspace?.organization?.base_currency || "NGN";

  let requests: any[] = [];
  let totalSpend = 0;
  let unpaidTotal = 0;
  let unpaidCount = 0;
  let pendingApprovals = 0;
  let allocatedBudget = 0;
  let committedAndActual = 0;
  let budgetRows: any[] = [];
  let budgetSummaryRows: any[] = [];
  let dataWarning = "";

  if (workspace?.organization?.id) {
    try {
      const supabase = await createClient();
      const orgId = workspace.organization.id;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartDate = monthStart.toISOString().slice(0, 10);

      const [paymentsRes, invoicesRes, approvalsRes, requestsRes, budgetsRes, summaryRes] = await Promise.all([
        supabase.from("ap_invoice_payments").select("amount").eq("organization_id", orgId).gte("payment_date", monthStartDate),
        supabase.from("ap_invoices").select("total,status").eq("organization_id", orgId),
        supabase.from("purchase_request_approvals").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "pending"),
        supabase.from("purchase_requests").select("id,request_number,title,department_id,subtotal,currency_code,status,created_at,is_draft").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5),
        supabase.from("department_budgets").select("id,department_id,name,allocated_amount,currency_code,status").eq("organization_id", orgId).eq("status", "active"),
        supabase.from("budget_commitment_summary").select("budget_id,committed_amount,actual_spend").eq("organization_id", orgId)
      ]);

      const errors = [paymentsRes.error, invoicesRes.error, approvalsRes.error, requestsRes.error, budgetsRes.error, summaryRes.error].filter(Boolean);
      if (errors.length) dataWarning = "Some dashboard figures could not be loaded. Please check workspace data access.";
      totalSpend = (paymentsRes.data ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const unpaid = (invoicesRes.data ?? []).filter((row) => row.status !== "paid" && row.status !== "cancelled");
      unpaidTotal = unpaid.reduce((sum, row) => sum + Number(row.total || 0), 0);
      unpaidCount = unpaid.length;
      pendingApprovals = approvalsRes.count ?? 0;
      requests = requestsRes.data ?? [];
      budgetRows = budgetsRes.data ?? [];
      budgetSummaryRows = summaryRes.data ?? [];
      const summaries = new Map((summaryRes.data ?? []).map((row) => [row.budget_id, row]));
      allocatedBudget = budgetRows.reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0);
      committedAndActual = budgetRows.reduce((sum, row) => {
        const summary: any = summaries.get(row.id);
        return sum + Number(summary?.committed_amount || 0) + Number(summary?.actual_spend || 0);
      }, 0);
    } catch {
      dataWarning = "Dashboard data is temporarily unavailable. Please refresh or contact your workspace administrator.";
    }
  }

  const availableBudget = Math.max(allocatedBudget - committedAndActual, 0);
  const utilization = allocatedBudget > 0 ? Math.min(Math.round((committedAndActual / allocatedBudget) * 100), 100) : 0;
  const departments = workspace?.departments ?? [];
  const departmentSpend = departments.map((department) => {
    const ids = budgetRows.filter((row) => row.department_id === department.id);
    const amount = ids.reduce((sum, budget) => {
      return sum + Number(budget.allocated_amount || 0);
    }, 0);
    const used = ids.reduce((sum, budget) => {
      const summary: any = budgetSummaryRows.find((row) => row.budget_id === budget.id);
      return sum + Number(summary?.committed_amount || 0) + Number(summary?.actual_spend || 0);
    }, 0);
    return { name: department.name, amount, used };
  }).filter((item) => item.amount > 0).slice(0, 4);
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const statCards = [
    { label: "Payments this month", value: money(totalSpend, currency), detail: "Recorded payments since month start", icon: CircleDollarSign },
    { label: "Available budget", value: money(availableBudget, currency), detail: allocatedBudget ? `${utilization}% utilized` : "No active budgets recorded", icon: Wallet },
    { label: "Pending approvals", value: String(pendingApprovals), detail: "Approval steps awaiting a decision", icon: Clock3 },
    { label: "Unpaid invoices", value: money(unpaidTotal, currency), detail: `${unpaidCount} unpaid invoice(s)`, icon: CreditCard }
  ];

  return (
    <main className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-64 md:flex-col bg-[#12233F] text-white px-5 py-6">
        <div className="flex items-center gap-3 mb-9"><div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center font-black text-lg">M</div><div><div className="font-bold tracking-wide">MIDRICIFY</div><div className="text-xs text-blue-200">Business Suite</div></div></div>
        <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Workspace</div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const href = item.label === "Overview" ? "/" : item.label === "Procurement" ? "/procurement" : item.label === "Budgets" ? "/budgets" : item.label === "Vendors" ? "/vendors" : item.label === "Purchase Orders" ? "/purchase-orders" : item.label === "Goods Receiving" ? "/receiving" : item.label === "Invoices & Payables" ? "/accounts-payable" : item.label === "Accounting" ? "/accounting" : item.label === "Inventory" ? "/inventory" : "/reports";
            return <Link key={item.label} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${item.active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"}`}><Icon size={18}/>{item.label}</Link>;
          })}
        </nav>
        <div className="mt-auto">
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Administration</div>
          <Link href="/settings/team" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={18}/>Users & permissions</Link>
          <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"><Settings size={18}/>Settings</Link>
          <form action={signOut} className="mt-2"><button className="w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5">Sign out</button></form>
          <div className="mt-5 border-t border-white/10 pt-4 flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-blue-300 text-[#12233F] flex items-center justify-center text-sm font-bold">{initials}</div><div className="min-w-0"><div className="text-sm font-medium">{displayName}</div><div className="text-xs text-slate-400">{workspace?.membership?.role?.replaceAll("_", " ") ?? "Workspace member"}</div></div><ChevronDown size={15} className="ml-auto"/></div>
        </div>
      </aside>
      <section className="flex-1 min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8"><div className="md:hidden flex items-center gap-2 font-bold text-[#12233F]"><div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">M</div>MIDRICIFY</div><div className="hidden md:flex text-sm text-slate-500">{workspaceName} <span className="mx-2">/</span> Overview</div><div className="flex items-center gap-4"><button className="relative text-slate-500" aria-label="Notifications"><Bell size={20}/></button><div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">{initials}</div><span className="hidden sm:block text-sm font-medium">{displayName}</span></div></div></header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7"><div><h1 className="text-2xl md:text-3xl font-bold text-slate-900">Good morning 👋</h1><p className="text-slate-500 mt-1">Here&apos;s what&apos;s happening across your organization.</p></div><Link href="/requests/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-blue-700">+ New purchase request</Link></div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-wide text-slate-400">Connected workspace</div><div className="font-semibold text-slate-900 mt-1">{workspaceName}</div><div className="text-xs text-slate-500 mt-1">{workspace?.organization ? `${workspace.organization.country_code} · ${currency} · ${workspace.memberCount} active member(s)` : "Workspace details are not available."}</div></div><Link href="/settings" className="text-sm text-blue-600 font-medium">Workspace settings →</Link></div>
          {dataWarning && <div role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">{dataWarning}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{statCards.map((stat) => { const Icon = stat.icon; return <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{stat.label}</span><span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon size={18}/></span></div><div className="text-2xl font-bold text-slate-900 mt-3">{stat.value}</div><div className="text-xs text-slate-500 mt-2">{stat.detail}</div></div>; })}</div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
            <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><div className="flex items-center justify-between mb-5"><div><h2 className="font-semibold text-slate-900">Recent purchase requests</h2><p className="text-sm text-slate-500 mt-1">Latest records from your workspace</p></div><Link href="/procurement" className="text-sm text-blue-600 font-medium">View all <ArrowUpRight size={14} className="inline"/></Link></div>
              <div className="overflow-x-auto"><table className="w-full text-sm text-left min-w-[680px]"><thead><tr className="text-xs uppercase tracking-wide text-slate-400 border-b"><th className="pb-3 font-medium">Request</th><th className="pb-3 font-medium">Department</th><th className="pb-3 font-medium">Amount</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Date</th></tr></thead><tbody>{requests.length ? requests.map((request) => <tr key={request.id} className="border-b last:border-0"><td className="py-4"><div className="font-medium text-slate-800">{request.title}</div><div className="text-xs text-slate-400 mt-1">{request.request_number}</div></td><td className="py-4 text-slate-600">{departmentNames.get(request.department_id) || "—"}</td><td className="py-4 font-medium">{money(Number(request.subtotal || 0), request.currency_code || currency)}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(request.is_draft ? "draft" : request.status)}`}>{request.is_draft ? "Draft" : titleCase(request.status || "unknown")}</span></td><td className="py-4 text-slate-500">{request.created_at ? new Date(request.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td></tr>) : <tr><td colSpan={5} className="py-8 text-center text-slate-500">No purchase requests recorded yet.</td></tr>}</tbody></table></div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Budget utilization</h2><p className="text-sm text-slate-500 mt-1">Active department budgets</p><div className="mt-6"><div className="flex justify-between text-sm mb-2"><span className="text-slate-600">Committed + actual</span><strong>{utilization}%</strong></div><div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-blue-600" style={{ width: `${utilization}%` }}/></div><div className="flex justify-between text-xs text-slate-400 mt-2"><span>{money(committedAndActual, currency)} used</span><span>{money(allocatedBudget, currency)} total</span></div></div>
              <div className="space-y-4 mt-7">{departmentSpend.length ? departmentSpend.map((item) => { const percent = item.amount ? Math.min(Math.round((item.used / item.amount) * 100), 100) : 0; return <div key={item.name}><div className="flex justify-between text-sm mb-1.5"><span className="text-slate-600">{item.name}</span><span className="font-medium">{percent}%</span></div><div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${percent}%` }}/></div></div>; }) : <p className="text-sm text-slate-500">No active department budgets recorded.</p>}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="font-semibold">Action required</h2><div className="mt-4 space-y-3"><Link href="/procurement" className="flex items-center justify-between p-3 rounded-lg bg-amber-50"><div><div className="text-sm font-medium">Approval queue</div><div className="text-xs text-slate-500 mt-1">Approval steps awaiting a decision</div></div><span className="text-amber-700 font-semibold text-sm">{pendingApprovals}</span></Link><Link href="/accounts-payable" className="flex items-center justify-between p-3 rounded-lg bg-blue-50"><div><div className="text-sm font-medium">Unpaid invoices</div><div className="text-xs text-slate-500 mt-1">Invoices not yet fully paid</div></div><span className="text-blue-700 font-semibold text-sm">{unpaidCount}</span></Link></div></div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="font-semibold">Quick access</h2><div className="grid grid-cols-2 gap-3 mt-4">{[["Purchase requests","/procurement",ClipboardList],["Vendor directory","/vendors",Users],["Purchase orders","/purchase-orders",ShoppingCart],["Invoices","/accounts-payable",FileText]].map(([label,href,Icon]: any) => <Link key={label} href={href} className="border border-slate-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50 transition"><Icon size={18} className="text-blue-600"/><div className="text-sm font-medium mt-2">{label}</div></Link>)}</div></div>
          </div>
          <div className="text-xs text-slate-400 text-center py-8">MIDRICIFY • Live workspace data</div>
        </div>
      </section>
    </main>
  );
}
