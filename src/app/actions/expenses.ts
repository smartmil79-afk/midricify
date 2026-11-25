'use server';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {requireWorkspacePermission} from '@/lib/permissions';
export async function createExpenseRequestAction(formData:FormData){
 const denied=await requireWorkspacePermission(['finance.manage']);if(denied)return denied;
 const title=String(formData.get('title')??'').trim(),description=String(formData.get('description')??'').trim(),amount=Number(formData.get('amount'));
 if(title.length<3||description.length<5||!Number.isFinite(amount)||amount<=0)return {error:'Enter a valid title, description and amount.'};
 const sb=await createClient();const {data:u}=await sb.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {data,error}=await sb.rpc('create_expense_request',{p_department_id:String(formData.get('department_id')??'')||null,p_budget_id:String(formData.get('budget_id')??'')||null,p_category:String(formData.get('category')??'operating'),p_title:title,p_description:description,p_supplier_name:String(formData.get('supplier_name')??''),p_amount:amount,p_currency_code:String(formData.get('currency_code')??'NGN'),p_expense_date:String(formData.get('expense_date')??'')||null,p_receipt_url:String(formData.get('receipt_url')??'')});
 if(error)return {error:error.message};revalidatePath('/expenses');return {success:true,id:data};
}
export async function decideExpenseRequestAction(id:string,decision:'approved'|'rejected',note:string){
 const denied=await requireWorkspacePermission(['finance.manage']);if(denied)return denied;
 const sb=await createClient();const {data:u}=await sb.auth.getUser();if(!u.user)return {error:'Sign in required.'};
 const {error}=await sb.rpc('decide_expense_request',{p_expense_id:id,p_decision:decision,p_note:note});
 if(error)return {error:error.message};revalidatePath('/expenses');return {success:true};
}
