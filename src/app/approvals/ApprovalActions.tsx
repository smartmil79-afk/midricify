'use client';
import {useState} from 'react';
import {decideApproval} from '@/app/actions/approvals';
import {showActionFeedback} from '@/app/components/ActionFeedback';
export default function ApprovalActions({requestId}:{requestId:string}){
 const [busy,setBusy]=useState(false);
 return <form action={async(fd)=>{setBusy(true);const decision=String(fd.get('decision'));const result=await decideApproval(fd);setBusy(false);if(result.error){showActionFeedback('Approval action was not completed',result.error,'error');return;}showActionFeedback(decision==='approved'?'Request approved successfully':'Request rejected',decision==='approved'?'The approval has been recorded and the requester can see the updated status.':'The rejection and its reason have been recorded for the requester.');}} className="space-y-2">
 <input type="hidden" name="request_id" value={requestId}/>
 <textarea name="note" rows={2} placeholder="Optional approval comment (required for rejection)" className="w-full border rounded-lg p-2 text-sm"/>
 <div className="flex gap-2"><button name="decision" value="approved" disabled={busy} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{busy?'Saving…':'Approve'}</button><button name="decision" value="rejected" disabled={busy} className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Reject</button></div>
 </form>
}