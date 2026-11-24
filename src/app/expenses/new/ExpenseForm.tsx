'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {createExpenseRequestAction} from '@/app/actions/expenses';
export function ExpenseForm({departments,budgets,currency}:{departments:any[];budgets:any[];currency:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError('');const fd=new FormData(e.currentTarget);const r=await createExpenseRequestAction(fd);if(r?.error){setError(r.error);setBusy(false);return;}if(r?.success)router.push('/expenses');else{setError('The expense could not be submitted.');setBusy(false);}}
 return <form onSubmit={submit} className="bg-white border rounded-2xl p-5 md:p-7 space-y-4"><div className="grid md:grid-cols-2 gap-4">
 <label className="text-sm font-medium">Expense title<input required minLength={3} name="title" placeholder="e.g. Microsoft 365 licences" className="mt-1 w-full rounded-lg border p-2.5"/></label>
 <label className="text-sm font-medium">Category<select name="category" className="mt-1 w-full rounded-lg border p-2.5"><option value="operating">Operating expense</option><option value="software_subscription">Software & subscriptions</option><option value="services">Services</option><option value="travel">Travel</option><option value="utilities">Utilities</option><option value="other">Other</option></select></label>
 <label className="text-sm font-medium">Department<select name="department_id" className="mt-1 w-full rounded-lg border p-2.5"><option value="">Unassigned</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
 <label className="text-sm font-medium">Budget (optional)<select name="budget_id" className="mt-1 w-full rounded-lg border p-2.5"><option value="">No budget selected</option>{budgets.map(b=><option key={b.id} value={b.id}>{b.name} · {b.fiscal_year}</option>)}</select></label>
 <label className="text-sm font-medium">Supplier / service provider<input name="supplier_name" className="mt-1 w-full rounded-lg border p-2.5" placeholder="Optional"/></label>
 <label className="text-sm font-medium">Amount ({currency})<input required name="amount" type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-lg border p-2.5"/></label>
 <label className="text-sm font-medium">Expense date<input required name="expense_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} className="mt-1 w-full rounded-lg border p-2.5"/></label>
 <label className="text-sm font-medium">Receipt / quotation link<input name="receipt_url" type="url" placeholder="https://" className="mt-1 w-full rounded-lg border p-2.5"/></label>
 </div><label className="block text-sm font-medium">Description / business purpose<textarea required minLength={5} name="description" rows={3} className="mt-1 w-full rounded-lg border p-2.5" placeholder="Explain what the expense is for and why it is needed."/></label>
 {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy?'Submitting expense…':'Submit expense request'}</button><p className="text-xs text-slate-500">Submitting creates an expense record and audit entry. Approval is handled separately by authorised workspace approvers.</p></form>
}
