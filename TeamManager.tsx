'use client';
import { useState } from 'react';
import { createInvitation } from '@/app/actions/workspace';
export default function TeamManager(){ const [message,setMessage]=useState(''); return <form action={async(fd)=>{setMessage('');const result=await createInvitation(fd);setMessage(result.error??result.message??'Invitation record created.');}} className="grid md:grid-cols-3 gap-3 mt-4">
 <input name="email" type="email" required placeholder="Work email" className="border rounded-lg p-2.5"/>
 <select name="role" className="border rounded-lg p-2.5"><option value="requester">Requester</option><option value="department_head">Department Head</option><option value="procurement_officer">Procurement Officer</option><option value="auditor">Auditor</option><option value="finance_officer">Finance Officer</option><option value="accountant">Accountant</option><option value="storekeeper">Storekeeper</option><option value="executive_approver">Executive Approver</option></select>
 <button className="bg-blue-600 text-white rounded-lg px-4 py-2">Create invitation</button>{message&&<p className="md:col-span-3 text-sm text-slate-600">{message}</p>}</form> }
