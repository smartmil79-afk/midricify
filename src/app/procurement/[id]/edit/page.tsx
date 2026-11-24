import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {getWorkspaceContext} from '@/lib/workspace';
import RequestForm from '@/app/requests/new/RequestForm';
export default async function EditDraftPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const ctx=await getWorkspaceContext();const supabase=await createClient();
 const [{data:r},{data:user},{data:hod}]=await Promise.all([
  supabase.from('purchase_requests').select('id,title,justification,department_id,needed_by,currency_code,status,is_draft,organization_id,requester_id,purchase_request_items(description,quantity,unit,estimated_unit_price)').eq('id',id).maybeSingle(),
  supabase.auth.getUser(),
  supabase.from('purchase_request_approvals').select('status').eq('request_id',id).eq('step_number',1).eq('approver_role','department_head').maybeSingle()
 ]);
 const isDraft=!!r?.is_draft;
 const canEditSubmitted=!!r&&r.status==='submitted'&&r.requester_id===user.user?.id&&hod?.status==='pending';
 if(!r||!ctx?.organization||r.organization_id!==ctx.organization.id||(!isDraft&&!canEditSubmitted))return <main className="p-10"><Link href={`/procurement/${id}`}>← Request details</Link><p className="mt-5">This request can no longer be edited. Editing is locked once HOD approval starts.</p></main>;
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="max-w-3xl mx-auto"><Link href={`/procurement/${id}`} className="text-sm text-blue-700">← Request details</Link><h1 className="text-2xl font-bold mt-4">{isDraft?'Edit draft':'Edit submitted request'}</h1>{canEditSubmitted&&<p className="text-sm text-amber-700 mt-2">You can revise this request until the HOD records a decision. Editing will be locked when the approval process moves forward.</p>}<div className="bg-white border rounded-2xl p-5 mt-6"><RequestForm departments={ctx.departments} currency={r.currency_code} editMode={canEditSubmitted?'submitted':undefined} initial={{id:r.id,title:r.title,justification:r.justification,department_id:r.department_id,needed_by:r.needed_by,items:(r.purchase_request_items??[]).map((i:any)=>({description:i.description,quantity:Number(i.quantity),unit:i.unit,estimated_unit_price:Number(i.estimated_unit_price)}))}}/></div></div></main>
}
