'use client';
import { useState } from 'react';
import { createDepartment } from '@/app/actions/workspace';
export default function DepartmentManager(){
 const [notice,setNotice]=useState('');
 return <form action={async(fd)=>{setNotice('');const result=await createDepartment(fd);setNotice(result.error??'Department created successfully.');if(!result.error)(document.getElementById('department-form') as HTMLFormElement)?.reset();}} id="department-form" className="flex flex-wrap gap-2">
 <input name="name" required minLength={2} placeholder="Department name" className="border rounded-lg p-2.5 text-sm"/>
 <input name="code" placeholder="Code (optional)" className="border rounded-lg p-2.5 text-sm w-36"/>
 <button className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold">Add department</button>
 {notice&&<p className="basis-full text-sm text-slate-600">{notice}</p>}
 </form>
}
