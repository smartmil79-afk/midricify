'use client';
import { useState, useTransition } from 'react';
import { setRolePermission } from '@/app/actions/roles';
type Permission = { id: string; key: string; description: string };
type Role = { key: string; label: string; description: string };
export default function RolesMatrix({ roles, permissions, initial, isAdmin }: { roles: Role[]; permissions: Permission[]; initial: Record<string,string[]>; isAdmin: boolean }) {
  const [selected,setSelected] = useState(roles[0]?.key ?? 'requester');
  const [grants,setGrants] = useState(initial);
  const [pending,startTransition] = useTransition();
  const [notice,setNotice] = useState('');
  const toggle = (permissionId:string, enabled:boolean) => {
    const before = grants[selected] ?? [];
    setGrants(v=>({...v,[selected]:enabled?[...before,permissionId]:before.filter(x=>x!==permissionId)}));
    setNotice('');
    startTransition(async()=>{
      const result=await setRolePermission(selected,permissionId,enabled);
      if(result?.error){setGrants(v=>({...v,[selected]:before}));setNotice(result.error);}
      else setNotice('Permission updated.');
    });
  };
  const active=grants[selected]??[];
  return <div className="grid lg:grid-cols-[230px_1fr] gap-5 mt-6">
    <section className="bg-white border rounded-2xl p-3"><h2 className="font-semibold px-3 py-2">Workspace roles</h2>
      <button className={`w-full text-left rounded-xl p-3 mt-1 ${selected==='company_admin'?'bg-blue-50 text-blue-800':'hover:bg-slate-50'}`} onClick={()=>setSelected('company_admin')}><div className="font-semibold text-sm">Company Admin</div><div className="text-xs text-slate-500 mt-1">Full workspace control</div></button>
      {roles.map(r=><button key={r.key} onClick={()=>setSelected(r.key)} className={`w-full text-left rounded-xl p-3 mt-1 ${selected===r.key?'bg-blue-50 text-blue-800':'hover:bg-slate-50'}`}><div className="font-semibold text-sm">{r.label}</div><div className="text-xs text-slate-500 mt-1">{r.description}</div></button>)}
    </section>
    <section className="bg-white border rounded-2xl p-5">
      <div className="flex flex-wrap justify-between items-start gap-3"><div><h2 className="font-semibold">{selected==='company_admin'?'Company Admin':roles.find(r=>r.key===selected)?.label} permissions</h2><p className="text-sm text-slate-500 mt-1">Changes apply only to this workspace.</p></div><span className="text-xs rounded-full bg-slate-100 px-3 py-1">{selected==='company_admin'?'Protected role':active.length+' enabled'}</span></div>
      {selected==='company_admin' ? <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">Company Admin retains full administrative access and cannot be restricted from this screen.</div> :
      <div className="mt-5 divide-y">{permissions.map(p=><label key={p.id} className="flex items-center justify-between gap-4 py-3 cursor-pointer"><span><span className="block text-sm font-medium">{p.description}</span><span className="block text-xs font-mono text-slate-400 mt-1">{p.key}</span></span><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={active.includes(p.id)} disabled={!isAdmin||pending} onChange={e=>toggle(p.id,e.target.checked)}/></label>)}</div>}
      {!isAdmin&&<p className="mt-4 text-sm text-amber-700">You can view this matrix, but only a Company Admin can change it.</p>}
      {notice&&<p aria-live="polite" className="mt-4 text-sm text-slate-600">{notice}</p>}
      {pending&&<p className="mt-2 text-xs text-slate-500">Saving permission…</p>}
    </section>
  </div>;
}
