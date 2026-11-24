'use client';
import {useState} from 'react';
import {submitPurchaseOrderAction,decidePurchaseOrderAction} from '@/app/actions/procurement';
import {showActionFeedback} from '@/app/components/ActionFeedback';
export function POActions({id,status}:{id:string,status:string}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false);
 async function submit(){setBusy(true);const r=await submitPurchaseOrderAction(id);setBusy(false);if(r?.error){showActionFeedback('Purchase order was not submitted',r.error,'error');return;}showActionFeedback('Purchase order submitted successfully','The purchase order has been sent to the authorized approver.');}
 async function decide(d:'approved'|'rejected'){if(d==='rejected'&&!note.trim()){showActionFeedback('Reason required','Please enter a decision note before rejecting this purchase order.','error');return;}setBusy(true);const r=await decidePurchaseOrderAction(id,d,note);setBusy(false);if(r?.error){showActionFeedback(`Purchase order ${d} failed`,r.error,'error');return;}showActionFeedback(d==='approved'?'Purchase order approved successfully':'Purchase order rejected',d==='approved'?'The approval decision has been recorded. The requester can now proceed with the next step.':'The rejection decision has been recorded and the requester has been informed through the updated order status.');}
 return <div className="flex flex-wrap gap-2 print:hidden">
 {status==='draft'&&<button disabled={busy} onClick={submit} className="bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold">{busy?'Processing…':'Submit for approval'}</button>}
 {status==='pending_approval'&&<><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Decision note (required for rejection)" className="border rounded-lg p-2 text-sm"/><button disabled={busy} onClick={()=>decide('approved')} className="bg-emerald-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm">{busy?'Processing…':'Approve'}</button><button disabled={busy} onClick={()=>decide('rejected')} className="bg-red-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm">Reject</button></>}
 {status==='approved'&&<button onClick={()=>window.print()} className="border px-4 py-2 rounded-lg text-sm">Print / Save as PDF</button>}
 </div>
}