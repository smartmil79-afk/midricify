import Link from "next/link";
import { signOut } from "./actions/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import {
  ArrowUpRight, Bell, ChevronDown, ClipboardList, CreditCard, FileText, LayoutDashboard,
  Package, Settings, ShieldCheck, Users, Wallet, BarChart3, CircleDollarSign, Clock3, ShoppingCart
} from "lucide-react";

const stats = [
  { label: "Total spend this month", value: "₦18,420,500", delta: "+8.2% vs last month", icon: CircleDollarSign, tone: "blue" },
  { label: "Available budget", value: "₦42,680,000", delta: "71% remaining", icon: Wallet, tone: "green" },
  { label: "Pending approvals", value: "24", delta: "7 require your attention", icon: Clock3, tone: "amber" },
  { label: "Unpaid invoices", value: "₦6,350,000", delta: "12 invoices", icon: CreditCard, tone: "violet" }
];
const requests = [
  { id: "PR-2026-0048", title: "Production raw materials", department: "Production", amount: "₦2,450,000", status: "Pending Finance", date: "24 Nov 2026" },
  { id: "PR-2026-0047", title: "IT equipment refresh", department: "ICT", amount: "₦840,000", status: "Approved", date: "23 Nov 2026" },
  { id: "PR-2026-0046", title: "Vehicle maintenance", department: "Administration", amount: "₦365,000", status: "Under Review", date: "22 Nov 2026" },
  { id: "PR-2026-0045", title: "Laboratory supplies", department: "Quality Control", amount: "₦127,500", status: "Draft", date: "21 Nov 2026" }
];
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

function statusClass(status: string) {
  if (status === "Approved") return "bg-emerald-50 text-emerald-700";
  if (status === "Pending Finance") return "bg-amber-50 text-amber-700";
  if (status === "Under Review") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

export default async function Home() {
  const workspace = await getWorkspaceContext();
  const displayName = workspace?.user.fullName || workspace?.user.email?.split("@")[0] || "Workspace User";
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0,2).join("").toUpperCase();
  const workspaceName = workspace?.organization?.name || "Your Workspace";
  return (
    <main className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-64 md:flex-col bg-[#12233F] text-white px-5 py-6">
        <div className="flex items-center gap-3 mb-9">
          <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center font-black text-lg">M</div>
          <div><div className="font-bold tracking-wide">MIDRICIFY</div><div className="text-xs text-blue-200">Business Suite</div></div>
        </div>
        <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Workspace</div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const href = item.label === "Overview" ? "/" : item.label === "Procurement" ? "/procurement" : item.label === "Budgets" ? "/budgets" : item.label === "Vendors" ? "/vendors" : item.label === "Purchase Orders" ? "/purchase-orders" : item.label === "Goods Receiving" ? "/receiving" : item.label === "Invoices & Payables" ? "/accounts-payable" : item.label === "Accounting" ? "/accounting" : item.label === "Inventory" ? "/inventory" : "/reports";
            return <a key={item.label} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${item.active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"}`}><Icon size={18}/>{item.label}</a>;
          })}
        </nav>
        <div className="mt-auto">
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Administration</div>
          <a href="/settings/team" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={18}/>Users & permissions</a>
          <a href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"><Settings size={18}/>Settings</a>
          <form action={signOut} className="mt-2"><button className="w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5">Sign out</button></form>
          <div className="mt-5 border-t border-white/10 pt-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-300 text-[#12233F] flex items-center justify-center text-sm font-bold">{initials}</div>
            <div className="min-w-0"><div className="text-sm font-medium">{displayName}</div><div className="text-xs text-slate-400">{workspace?.membership?.role?.replaceAll("_"," ") ?? "Workspace member"}</div></div>
            <ChevronDown size={15} className="ml-auto"/>
          </div>
        </div>
      </aside>
      <section className="flex-1 min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8">
          <div className="md:hidden flex items-center gap-2 font-bold text-[#12233F]"><div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">M</div>MIDRICIFY</div>
          <div className="hidden md:flex text-sm text-slate-500">{workspaceName} <span className="mx-2">/</span> Overview</div>
          <div className="flex items-center gap-4"><button className="relative text-slate-500"><Bell size={20}/><span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500"/></button><div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">{initials}</div><span className="hidden sm:block text-sm font-medium">{displayName}</span></div></div>
        </header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
            <div><h1 className="text-2xl md:text-3xl font-bold text-slate-900">Good morning 👋</h1><p className="text-slate-500 mt-1">Here&apos;s what&apos;s happening across your organization.</p></div>
            <Link href="/requests/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-blue-700">+ New purchase request</Link>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-wide text-slate-400">Connected workspace</div><div className="font-semibold text-slate-900 mt-1">{workspaceName}</div><div className="text-xs text-slate-500 mt-1">{workspace?.organization ? `${workspace.organization.country_code} · ${workspace.organization.base_currency} · ${workspace.memberCount} active member(s)` : "Workspace details are not available."}</div></div><Link href="/settings" className="text-sm text-blue-600 font-medium">Workspace settings →</Link></div>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3">Dashboard financial figures and request rows below are demo placeholders until procurement and finance modules are connected.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {stats.map((s) => { const Icon = s.icon; return <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{s.label}</span><span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon size={18}/></span></div><div className="text-2xl font-bold text-slate-900 mt-3">{s.value}</div><div className="text-xs text-slate-500 mt-2">{s.delta}</div></div>; })}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
            <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5"><div><h2 className="font-semibold text-slate-900">Recent purchase requests</h2><p className="text-sm text-slate-500 mt-1">Latest activity from your teams</p></div><button className="text-sm text-blue-600 font-medium">View all <ArrowUpRight size={14} className="inline"/></button></div>
              <div className="overflow-x-auto"><table className="w-full text-sm text-left min-w-[680px]"><thead><tr className="text-xs uppercase tracking-wide text-slate-400 border-b"><th className="pb-3 font-medium">Request</th><th className="pb-3 font-medium">Department</th><th className="pb-3 font-medium">Amount</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Date</th></tr></thead><tbody>{requests.map(r=><tr key={r.id} className="border-b last:border-0"><td className="py-4"><div className="font-medium text-slate-800">{r.title}</div><div className="text-xs text-slate-400 mt-1">{r.id}</div></td><td className="py-4 text-slate-600">{r.department}</td><td className="py-4 font-medium">{r.amount}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(r.status)}`}>{r.status}</span></td><td className="py-4 text-slate-500">{r.date}</td></tr>)}</tbody></table></div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Budget utilization</h2><p className="text-sm text-slate-500 mt-1">Current fiscal year</p>
              <div className="mt-6"><div className="flex justify-between text-sm mb-2"><span className="text-slate-600">Committed + actual</span><strong>58%</strong></div><div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full w-[58%] rounded-full bg-blue-600"/></div><div className="flex justify-between text-xs text-slate-400 mt-2"><span>₦34.8M used</span><span>₦60M budget</span></div></div>
              <div className="space-y-4 mt-7">{[["Production","72%","bg-blue-600"],["Administration","41%","bg-emerald-500"],["ICT","64%","bg-violet-500"],["Quality Control","29%","bg-amber-500"]].map(([name,percent,color])=><div key={name}><div className="flex justify-between text-sm mb-1.5"><span className="text-slate-600">{name}</span><span className="font-medium">{percent}</span></div><div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${color} rounded-full`} style={{width:percent}}/></div></div>)}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="font-semibold">Action required</h2><div className="mt-4 space-y-3"><div className="flex items-center justify-between p-3 rounded-lg bg-amber-50"><div><div className="text-sm font-medium">Approval queue</div><div className="text-xs text-slate-500 mt-1">7 requests awaiting your review</div></div><span className="text-amber-700 font-semibold text-sm">7</span></div><div className="flex items-center justify-between p-3 rounded-lg bg-blue-50"><div><div className="text-sm font-medium">Invoices due soon</div><div className="text-xs text-slate-500 mt-1">4 invoices due within 7 days</div></div><span className="text-blue-700 font-semibold text-sm">4</span></div></div></div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm"><h2 className="font-semibold">Quick access</h2><div className="grid grid-cols-2 gap-3 mt-4">{[["Purchase requests","/procurement",ClipboardList],["Vendor directory","/vendors",Users],["Purchase orders","/purchase-orders",ShoppingCart],["Invoices","/invoices",FileText]].map(([label,href,Icon]:any)=><Link key={label} href={href} className="border border-slate-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50 transition"><Icon size={18} className="text-blue-600"/><div className="text-sm font-medium mt-2">{label}</div></Link>)}</div></div>
          </div>
          <div className="text-xs text-slate-400 text-center py-8">MIDRICIFY Phase 1 Foundation • Demo dashboard data</div>
        </div>
      </section>
    </main>
  );
}
