import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/lib/workspace';
import RolesMatrix from './RolesMatrix';
const roles=[
 {key:'requester',label:'Requester',description:'Create and track purchase requests'},
 {key:'department_head',label:'Department Head',description:'Review department requests'},
 {key:'procurement_officer',label:'Procurement Officer',description:'Manage sourcing and purchase orders'},
 {key:'auditor',label:'Auditor',description:'Read-only audit access'},
 {key:'finance_officer',label:'Finance Officer',description:'Budget and payment review'},
 {key:'accountant',label:'Accountant',description:'Accounting records and journals'},
 {key:'storekeeper',label:'Storekeeper',description:'Receiving and inventory'},
 {key:'executive_approver',label:'Executive Approver',description:'High-value approval authority'}
];
export default async function RolesPage(){
 const ctx=await getWorkspaceContext();
 const supabase=await createClient();
 const [{data:permissions},{data:assigned}] = await Promise.all([
  supabase.from('permissions').select('id,key,description').order('key'),
  ctx?.organization ? supabase.from('organization_role_permissions').select('role,permission_id').eq('organization_id',ctx.organization.id) : Promise.resolve({data:[] as {role:string;permission_id:string}[]})
 ]);
 const initial:Record<string,string[]>={};
 for(const row of assigned??[]) (initial[row.role]??=[]).push(row.permission_id);
 const isAdmin=ctx?.membership?.role==='company_admin';
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="max-w-6xl mx-auto">
  <Link href="/settings" className="text-sm text-blue-700">← Settings</Link>
  <h1 className="text-2xl font-bold mt-4">Roles & permissions</h1>
  <p className="text-slate-500 mt-1">Configure permission access for each role in {ctx?.organization?.name??'your workspace'}.</p>
  {!ctx?.organization ? <div className="bg-white border rounded-xl p-5 mt-6 text-sm text-amber-700">No active workspace membership was found.</div> :
   <RolesMatrix roles={roles} permissions={permissions??[]} initial={initial} isAdmin={isAdmin}/>}
  <p className="text-xs text-slate-400 mt-5">Permission assignments are stored per workspace. Company Admin is protected. Module actions must also enforce these permission keys before the matrix can be treated as complete access control.</p>
 </div></main>;
}
