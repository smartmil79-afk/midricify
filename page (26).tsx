import Link from 'next/link';
import { getWorkspaceContext } from '@/lib/workspace';
import DepartmentManager from './DepartmentManager';
export default async function DepartmentsPage(){
 const ctx=await getWorkspaceContext(); const departments=ctx?.departments??[]; const isAdmin=ctx?.membership?.role==='company_admin';
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="max-w-4xl mx-auto"><Link href="/settings" className="text-sm text-blue-700">← Settings</Link><h1 className="text-2xl font-bold mt-4">Departments</h1><p className="text-slate-500 mt-1">Organize requests and approval workflows by department.</p>
 {isAdmin&&<section className="bg-white border rounded-2xl p-5 mt-6"><h2 className="font-semibold mb-3">Add department</h2><DepartmentManager/></section>}
 <div className="bg-white border rounded-2xl mt-6 overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">Department</th><th className="text-left p-3">Code</th><th className="text-left p-3">Status</th></tr></thead><tbody>{departments.map(d=><tr key={d.id} className="border-t"><td className="p-3 font-medium">{d.name}</td><td className="p-3">{d.code??'—'}</td><td className="p-3"><span className={d.is_active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}>{d.is_active?'Active':'Inactive'}</span></td></tr>)}{!departments.length&&<tr><td colSpan={3} className="p-6 text-center text-slate-500">{ctx?.organization?'No departments found. Add your first department.':'Sign in and create or join a workspace to view departments.'}</td></tr>}</tbody></table></div></div></main>
}
