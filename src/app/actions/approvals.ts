'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';\nimport {requireWorkspacePermission} from '@/lib/permissions';
export async function decideApproval(formData:FormData){
 const requestId=String(formData.get('request_id')??'');
 const decision=String(formData.get('decision')??'');
 const note=String(formData.get('note')??'').trim();
 if(!requestId||!['approved','rejected'].includes(decision)) return {error:'Invalid approval decision.'};
 if(decision==='rejected'&&note.length<3) return {error:'Please provide a reason when rejecting.'};\n const denied=await requireWorkspacePermission(['procurement.request.approve','requests.approve']);if(denied)return denied;
 const supabase=await createClient();
 const {data,error}=await supabase.rpc('decide_purchase_request',{p_request_id:requestId,p_decision:decision,p_note:note||null});
 if(error)return {error:error.message};
 revalidatePath('/approvals'); revalidatePath('/procurement'); revalidatePath(`/procurement/${requestId}`);
 return {success:true,data};
}
