import Link from 'next/link';
import {createClient} from '@/lib/supabase/server';
import {getWorkspaceContext} from '@/lib/workspace';
import RequestForm from '@/app/requests/new/RequestForm';
export default async function EditDraftPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const ctx=await getWorkspaceContext();const supabase=await createClient();
 const {data:r}=await supabase.from('purchase_requests').select('id,title,justification,department_id,needed_by,currency_code,status,is_draft,organization_id,purchase_request_items(description,quantity,unit,estimated_unit_price)').eq('id',id).maybeSingle();
 if(!r||!ctx?.organization||r.organization_id!==ctx.organization.id||!r.is_draft)return <main className="p-10"><Link href="/procurement">← Procurement</Link><p className="mt-5">Draft not found.</p></main>;
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="max-w-3xl mx-auto"><Link href={`/procurement/${id}`} className="text-sm text-blue-700">← Request details</Link><h1 className="text-2xl font-bold mt-4">Edit draft {r.id.slice(0,8)}</h1><div className="bg-white border rounded-2xl p-5 mt-6"><RequestForm departments={ctx.departments} currency={r.currency_code} initial={{id:r.id,title:r.title,justification:r.justification,department_id:r.department_id,needed_by:r.needed_by,items:(r.purchase_request_items??[]).map((i:any)=>({description:i.description,quantity:Number(i.quantity),unit:i.unit,estimated_unit_price:Number(i.estimated_unit_price)}))}}/></div></div></main>
}
