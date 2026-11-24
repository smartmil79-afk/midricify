'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {decideExpenseRequestAction} from '@/app/actions/expenses';
export function ExpenseDecision({id}:{id:string}){const [busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');const router=useRouter();
 async function decide(decision:'approved'|'rejected'){if(busy)return;if(decision==='rejected'&&note.trim().length<3){setError('Enter a rejection reason (at least 3 characters).');return;}setBusy(true);setError('');const r=await decideExpenseRequestAction(id,decision,note);if(r?.error){setError(r.error);setBusy(false);return;}router.refresh();}
 return <div className="min-w-44 space-y-1"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Decision note (required to reject)" className="w-48 rounded border px-2 py-1 text-xs"/><div className="flex gap-2"><button disabled={busy} onClick={()=>decide('approved')} className="rounded bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-50">{busy?'Working…':'Approve'}</button><button disabled={busy} onClick={()=>decide('rejected')} className="rounded bg-rose-700 px-2 py-1 text-xs text-white disabled:opacity-50">Reject</button></div>{error&&<p className="text-xs text-rose-600">{error}</p>}</div>}
