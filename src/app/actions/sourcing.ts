'use server';
import {createClient} from '@/lib/supabase/server';
import {getWorkspaceContext} from '@/lib/workspace';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';

const jsonArray=(v:FormDataEntryValue|null)=>{try{const x=JSON.parse(String(v??'[]'));return Array.isArray(x)?x:null;}catch{return null;}};
export async function createRfqAction(formData:FormData){
 const ctx=await getWorkspaceContext();if(!ctx?.organization)return {error:'Workspace not found.'};
 const sb=await createClient();const {data:u}=await sb.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const title=String(formData.get('title')??'').trim(),description=String(formData.get('description')??'').trim();
 const items=jsonArray(formData.get('items_json')),vendors=jsonArray(formData.get('vendors_json'));
 if(title.length<3||!items?.length||items.some((x:any)=>!String(x.description??'').trim()||Number(x.quantity)<=0)||!vendors?.length)return {error:'Enter a title, at least one valid item and one invited vendor.'};
 const {data:rfq,error}=await sb.from('rfqs').insert({organization_id:ctx.organization.id,rfq_number:'RFQ-'+Date.now().toString().slice(-8),title,description,currency_code:String(formData.get('currency_code')??ctx.organization.base_currency??'NGN'),response_due_date:String(formData.get('response_due_date')??'')||null,created_by:u.user.id,status:'issued'}).select('id').single();
 if(error)return {error:error.message};
 const {data:lineRows,error:lineError}=await sb.from('rfq_items').insert(items.map((x:any)=>({rfq_id:rfq.id,description:String(x.description).trim(),quantity:Number(x.quantity),unit:String(x.unit??'unit'),specifications:String(x.specifications??'').trim()||null}))).select('id');
 if(lineError){await sb.from('rfqs').delete().eq('id',rfq.id);return {error:lineError.message};}
 const {error:vendorError}=await sb.from('rfq_vendors').insert([...new Set(vendors.map((x:any)=>String(x)))].map(vendor_id=>({rfq_id:rfq.id,vendor_id})));
 if(vendorError){await sb.from('rfqs').delete().eq('id',rfq.id);return {error:vendorError.message};}
 revalidatePath('/sourcing');redirect('/sourcing/'+rfq.id);
}
export async function saveVendorQuotationAction(rfqId:string,formData:FormData){
 const ctx=await getWorkspaceContext();if(!ctx?.organization)return {error:'Workspace not found.'};
 const sb=await createClient();const {data:u}=await sb.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const items=jsonArray(formData.get('items_json'));if(!items?.length||items.some((x:any)=>!x.rfq_item_id||Number(x.quantity)<=0||Number(x.unit_price)<0))return {error:'Enter valid quoted prices for every RFQ item.'};
 const num=(key:string)=>Math.max(0,Number(formData.get(key)??0)||0);
 const {data:q,error}=await sb.from('vendor_quotations').upsert({organization_id:ctx.organization.id,rfq_id:rfqId,vendor_id:String(formData.get('vendor_id')??''),quotation_number:String(formData.get('quotation_number')??'').trim()||null,currency_code:String(formData.get('currency_code')??'NGN'),exchange_rate_to_base:Number(formData.get('exchange_rate_to_base')??1),quoted_at:String(formData.get('quoted_at')??'')||new Date().toISOString().slice(0,10),valid_until:String(formData.get('valid_until')??'')||null,delivery_days:Number(formData.get('delivery_days')??0)||null,payment_terms:String(formData.get('payment_terms')??'').trim()||null,warranty:String(formData.get('warranty')??'').trim()||null,notes:String(formData.get('notes')??'').trim()||null,discount_amount:num('discount_amount'),tax_amount:num('tax_amount'),freight_cost:num('freight_cost'),insurance_cost:num('insurance_cost'),customs_duty:num('customs_duty'),clearing_cost:num('clearing_cost'),handling_cost:num('handling_cost'),other_charges:num('other_charges'),status:'submitted',created_by:u.user.id},{onConflict:'rfq_id,vendor_id'}).select('id').single();
 if(error)return {error:error.message};
 const {error:itemError}=await sb.from('vendor_quotation_items').upsert(items.map((x:any)=>({quotation_id:q.id,rfq_item_id:String(x.rfq_item_id),quantity:Number(x.quantity),unit_price:Number(x.unit_price),specification_compliant:x.specification_compliant!==false,notes:String(x.notes??'').trim()||null})),{onConflict:'quotation_id,rfq_item_id'});
 if(itemError)return {error:itemError.message};
 await sb.from('rfq_vendors').update({invitation_status:'responded'}).eq('rfq_id',rfqId).eq('vendor_id',String(formData.get('vendor_id')??''));
 revalidatePath('/sourcing/'+rfqId);return {success:true};
}
export async function selectRecommendedVendorAction(rfqId:string,quotationId:string,vendorId:string){
 const ctx=await getWorkspaceContext();if(!ctx?.organization)return {error:'Workspace not found.'};
 const sb=await createClient();const {data:u}=await sb.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data:q,error}=await sb.from('vendor_quotations').select('id,vendor_id,rfq_id,organization_id').eq('id',quotationId).eq('rfq_id',rfqId).eq('organization_id',ctx.organization.id).maybeSingle();
 if(error||!q||q.vendor_id!==vendorId)return {error:'Quotation not found.'};
 const {error:updateError}=await sb.from('rfqs').update({awarded_vendor_id:vendorId,awarded_quotation_id:quotationId,status:'awarded'}).eq('id',rfqId).eq('organization_id',ctx.organization.id);
 if(updateError)return {error:updateError.message};
 await sb.from('vendor_quotations').update({status:'rejected'}).eq('rfq_id',rfqId).neq('id',quotationId);
 await sb.from('vendor_quotations').update({status:'selected'}).eq('id',quotationId);
 revalidatePath('/sourcing');revalidatePath('/sourcing/'+rfqId);return {success:true};
}
