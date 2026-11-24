'use client';
import {useState} from 'react';
import {decideApproval} from '@/app/actions/approvals';
export default function ApprovalActions({requestId}:{requestId:string}){
 const [msg,setMsg]=useState('');
 const [busy,setBusy]=useState(false);
 return <form action={async(fd)=>{setBusy(true);setMsg('');const result=await decideApproval(fd);setMsg(result.error??'Decision recorded.');setBusy(false);}} className="space-y-2">
 <input type="hidden" name="request_id" value={requestId}/>
 <textarea name="note" rows={2} placeholder="Optional approval comment (required for rejection)" className="w-full border rounded-lg p-2 text-sm"/>
 <div className="flex gap-2"><button name="decision" value="approved" disabled={busy} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Approve</button><button name="decision" value="rejected" disabled={busy} className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Reject</button></div>
 {msg&&<p className="text-xs text-slate-600">{msg}</p>}
 </form>
}
