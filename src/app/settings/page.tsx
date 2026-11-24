import Link from "next/link";
import { Building2, Users, Shield, Settings2, UserCircle } from "lucide-react";
const items = [
  { href: "/settings/profile", title: "My profile", description: "Update your personal details, contact information, avatar, and unit.", icon: UserCircle },
  { href: "/settings/company", title: "Company profile", description: "Organization details, country, currency, and fiscal year.", icon: Building2 },
  { href: "/settings/departments", title: "Departments", description: "Manage department names, codes, and managers.", icon: Users },
  { href: "/settings/team", title: "Team & invitations", description: "Review members and prepare invitations.", icon: Users },
  { href: "/settings/roles", title: "Roles & permissions", description: "Review access levels and permission catalog.", icon: Shield },
];
export default function SettingsPage() {
  return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="max-w-5xl mx-auto">
    <Link href="/" className="text-sm text-blue-700">← Dashboard</Link><h1 className="text-3xl font-bold text-slate-900 mt-4">Workspace settings</h1><p className="text-slate-500 mt-2">Configure your organization and access.</p>
    <div className="grid md:grid-cols-2 gap-4 mt-8">{items.map(({href,title,description,icon:Icon})=><Link key={href} href={href} className="bg-white border rounded-2xl p-5 hover:border-blue-300 hover:shadow-sm transition"><div className="h-10 w-10 bg-blue-50 text-blue-700 rounded-xl grid place-items-center"><Icon size={20}/></div><h2 className="font-semibold mt-4">{title}</h2><p className="text-sm text-slate-500 mt-1">{description}</p></Link>)}</div>
  </div></main>
}
