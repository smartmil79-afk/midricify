'use server';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

function parseItems(raw:string){
 try { const v=JSON.parse(raw); if(!Array.isArray(v)||!v.length) return null;
  return v.map((x:any)=>({description:String(x.description??'').trim(),quantity:Number(x.quantity),unit:String(x.unit??'unit').trim()||'unit',estimated_unit_price:Number(x.estimated_unit_price)}));
 } catch { return null; }
}
export async function submitPurchaseRequest(formData:FormData){
 const title=String(formData.get('title')??'').trim(), justification=String(formData.get('justification')??'').trim();
 const department=String(formData.get('department_id')??'')||null, neededBy=String(formData.get('needed_by')??'')||null;
 const currency=String(formData.get('currency_code')??'NGN'), items=parseItems(String(formData.get('items_json')??''));
 if(title.length<3||justification.length<5||!items||items.some(i=>i.description.length<2||!Number.isFinite(i.quantity)||i.quantity<=0||!Number.isFinite(i.estimated_unit_price)||i.estimated_unit_price<0)) return {error:'Please check request details and every line item.'};
 const supabase=await createClient(); const {data:auth}=await supabase.auth.getUser(); if(!auth.user)return {error:'Please sign in.'};
 const {data,error}=await supabase.rpc('submit_purchase_request',{p_title:title,p_justification:justification,p_department_id:department,p_needed_by:neededBy,p_currency_code:currency,p_items:items});
 if(error)return {error:error.message};
 redirect(`/procurement/${data}?result=request-submitted`);
}
export async function addRequestComment(formData:FormData){
 const requestId=String(formData.get('request_id')??''), comment=String(formData.get('comment')??'').trim();
 if(!requestId||comment.length<2)return {error:'Comment is required.'};
 const supabase=await createClient(); const {data:u}=await supabase.auth.getUser(); if(!u.user)return {error:'Sign in required.'};
 const {data:r}=await supabase.from('purchase_requests').select('organization_id').eq('id',requestId).maybeSingle(); if(!r)return {error:'Request not found.'};
 const {error}=await supabase.from('purchase_request_comments').insert({request_id:requestId,organization_id:r.organization_id,author_id:u.user.id,comment});
 if(error)return {error:error.message}; revalidatePath(`/procurement/${requestId}`); return {success:true};
}
export async function uploadRequestAttachment(formData:FormData){
 const requestId=String(formData.get('request_id')??''), file=formData.get('file');
 if(!requestId||!(file instanceof File)||!file.size)return {error:'Choose a file.'};
 if(file.size>10*1024*1024)return {error:'File exceeds 10 MB limit.'};
 const allowed=['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
 if(!allowed.includes(file.type))return {error:'This file type is not allowed.'};
 const supabase=await createClient(); const {data:u}=await supabase.auth.getUser(); if(!u.user)return {error:'Sign in required.'};
 const {data:r}=await supabase.from('purchase_requests').select('organization_id').eq('id',requestId).maybeSingle(); if(!r)return {error:'Request not found.'};
 const path=`${r.organization_id}/${requestId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
 const {error:up}=await supabase.storage.from('midricify-request-files').upload(path,file,{contentType:file.type,upsert:false});
 if(up)return {error:up.message};
 const {error:db}=await supabase.from('purchase_request_attachments').insert({request_id:requestId,organization_id:r.organization_id,uploaded_by:u.user.id,file_name:file.name,storage_path:path,mime_type:file.type,file_size:file.size});
 if(db){await supabase.storage.from('midricify-request-files').remove([path]);return {error:db.message};}
 revalidatePath(`/procurement/${requestId}`);return {success:true};
}

export async function savePurchaseRequestDraft(formData:FormData){
 const title=String(formData.get('title')??'').trim(),justification=String(formData.get('justification')??'').trim();
 const department=String(formData.get('department_id')??'')||null,neededBy=String(formData.get('needed_by')??'')||null,currency=String(formData.get('currency_code')??'NGN');
 const requestId=String(formData.get('request_id')??'')||null;
 const items=parseItems(String(formData.get('items_json')??''));
 if(title.length<3||justification.length<5||!items||items.some(i=>i.description.length<2||i.quantity<=0||i.estimated_unit_price<0||!Number.isFinite(i.quantity)||!Number.isFinite(i.estimated_unit_price)))return {error:'Check draft details and items.'};
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data,error}=await supabase.rpc('save_purchase_request_draft',{p_request_id:requestId,p_title:title,p_justification:justification,p_department_id:department,p_needed_by:neededBy,p_currency_code:currency,p_items:items});
 if(error)return {error:error.message};
 redirect(`/procurement/${data}?result=draft-saved`);
}

export async function submitSavedDraft(requestId:string){
 const supabase=await createClient();const {data,error}=await supabase.rpc('submit_saved_purchase_request',{p_request_id:requestId});
 if(error)return {error:error.message};redirect(`/procurement/${data}`);
}

export async function createVendor(formData:FormData){
 const name=String(formData.get('name')??'').trim(); if(name.length<2)return {error:'Vendor name is required.'};
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {getWorkspaceContext}=await import('@/lib/workspace');const workspace=await getWorkspaceContext();if(!workspace?.organization)return {error:'Organization workspace not found.'};
 const {error}=await supabase.from('vendors').insert({organization_id:workspace.organization.id,name,contact_name:String(formData.get('contact_name')??'').trim()||null,email:String(formData.get('email')??'').trim()||null,phone:String(formData.get('phone')??'').trim()||null,address:String(formData.get('address')??'').trim()||null,tax_id:String(formData.get('tax_id')??'').trim()||null,payment_terms:String(formData.get('payment_terms')??'Net 30').trim(),created_by:u.user.id});
 if(error)return {error:error.message};revalidatePath('/vendors');redirect('/vendors?result=vendor-created');
}
export async function createPurchaseOrder(formData:FormData){
 const requestId=String(formData.get('request_id')??''),vendorId=String(formData.get('vendor_id')??'');if(!requestId||!vendorId)return {error:'Select a vendor.'};
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data,error}=await supabase.rpc('create_purchase_order',{p_request_id:requestId,p_vendor_id:vendorId,p_delivery_address:String(formData.get('delivery_address')??'').trim()||null,p_delivery_date:String(formData.get('delivery_date')??'')||null,p_payment_terms:String(formData.get('payment_terms')??'').trim()||null,p_notes:String(formData.get('notes')??'').trim()||null});
 if(error)return {error:error.message};redirect(`/purchase-orders/${data}?result=po-created`);
}
export async function submitPurchaseOrderAction(poId:string){const supabase=await createClient();const {data,error}=await supabase.rpc('submit_purchase_order',{p_po_id:poId});if(error)return {error:error.message};revalidatePath(`/purchase-orders/${poId}`);return {success:true};}
export async function decidePurchaseOrderAction(poId:string,decision:'approved'|'rejected',note:string){const supabase=await createClient();const {data,error}=await supabase.rpc('decide_purchase_order',{p_po_id:poId,p_decision:decision,p_note:note});if(error)return {error:error.message};revalidatePath(`/purchase-orders/${poId}`);revalidatePath('/purchase-orders');return {success:true};}


export async function createGoodsReceiptAction(formData:FormData){
 const poId=String(formData.get('purchase_order_id')??''),receivedDate=String(formData.get('received_date')??''),deliveryNote=String(formData.get('delivery_note_number')??'').trim();
 let items:any[]=[];try{items=JSON.parse(String(formData.get('items_json')??'[]'));}catch{return {error:'Invalid item quantities.'};}
 if(!poId||!items.length||items.some(i=>!i.purchase_order_item_id||!Number.isFinite(Number(i.quantity_received))||Number(i.quantity_received)<=0))return {error:'Enter valid received quantities for at least one line.'};
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data,error}=await supabase.rpc('create_goods_receipt',{p_po_id:poId,p_received_date:receivedDate||null,p_delivery_note:deliveryNote||null,p_items:items});
 if(error)return {error:error.message};redirect(`/receiving/${data}?result=goods-received`);
}
export async function inspectGoodsReceiptAction(receiptId:string,decisions:any[],note:string){
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data,error}=await supabase.rpc('inspect_goods_receipt',{p_receipt_id:receiptId,p_decisions:decisions,p_note:note});
 if(error)return {error:error.message};revalidatePath(`/receiving/${receiptId}`);revalidatePath('/receiving');revalidatePath('/inventory');redirect(`/receiving/${receiptId}`);
}

export async function createApInvoiceAction(formData:FormData){
 const poId=String(formData.get('purchase_order_id')??''),number=String(formData.get('invoice_number')??'').trim(),date=String(formData.get('invoice_date')??''),due=String(formData.get('due_date')??'')||null,tax=Number(formData.get('tax_amount')??0),notes=String(formData.get('notes')??''),raw=String(formData.get('items_json')??'');
 let items:any[]=[];try{items=JSON.parse(raw);}catch{return {error:'Invoice line data invalid.'};}
 if(!poId||!number||!items.length||items.some(i=>Number(i.quantity)<=0||Number(i.unit_price)<0))return {error:'Complete invoice details and line items.'};
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data,error}=await supabase.rpc('create_ap_invoice',{p_po_id:poId,p_invoice_number:number,p_invoice_date:date||null,p_due_date:due,p_tax:tax,p_notes:notes,p_items:items});
 if(error)return {error:error.message};redirect(`/accounts-payable/${data}?result=invoice-created`);
}
export async function approveApInvoiceAction(invoiceId:string,note:string){
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {error}=await supabase.rpc('approve_ap_invoice',{p_invoice_id:invoiceId,p_note:note});if(error)return {error:error.message};revalidatePath(`/accounts-payable/${invoiceId}`);revalidatePath('/accounts-payable');return {success:true};
}
export async function recordApPaymentAction(invoiceId:string,formData:FormData){
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {error}=await supabase.rpc('record_ap_payment',{p_invoice_id:invoiceId,p_reference:String(formData.get('payment_reference')??''),p_date:String(formData.get('payment_date')??'')||null,p_amount:Number(formData.get('amount')??0),p_method:String(formData.get('method')??''),p_notes:String(formData.get('notes')??'')});
 if(error)return {error:error.message};revalidatePath(`/accounts-payable/${invoiceId}`);revalidatePath('/accounts-payable');return {success:true};
}

export async function createDepartmentBudgetAction(formData:FormData){
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data,error}=await supabase.rpc('create_department_budget',{p_department_id:String(formData.get('department_id')??'')||null,p_name:String(formData.get('name')??''),p_year:Number(formData.get('fiscal_year')),p_start:String(formData.get('period_start')??''),p_end:String(formData.get('period_end')??''),p_amount:Number(formData.get('allocated_amount')),p_currency:String(formData.get('currency_code')??'NGN')});
 if(error)return {error:error.message};revalidatePath('/budgets');return {success:true};
}
export async function requestBudgetTransferAction(formData:FormData){
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {error}=await supabase.rpc('request_budget_transfer',{p_from:String(formData.get('from_budget_id')),p_to:String(formData.get('to_budget_id')),p_amount:Number(formData.get('amount')),p_reason:String(formData.get('reason')??'')});
 if(error)return {error:error.message};revalidatePath('/budgets');return {success:true};
}
export async function decideBudgetTransferAction(id:string,decision:'approved'|'rejected'){
 const supabase=await createClient();const {data:u}=await supabase.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {error}=await supabase.rpc('decide_budget_transfer',{p_transfer_id:id,p_decision:decision,p_note:null});
 if(error)return {error:error.message};revalidatePath('/budgets');return {success:true};
}
