import {createClient} from '@/lib/supabase/server';
import {getWorkspaceContext} from '@/lib/workspace';
export async function hasAnyWorkspacePermission(keys:string[]){
 const ctx=await getWorkspaceContext();if(!ctx?.organization||!ctx.membership)return false;
 if(ctx.membership.role==='company_admin')return true;
 const sb=await createClient();
 const {data:permissions}=await sb.from('permissions').select('id').in('key',keys);
 const ids=(permissions??[]).map(p=>p.id);if(!ids.length)return false;
 const {data:grants}=await sb.from('organization_role_permissions').select('permission_id').eq('organization_id',ctx.organization.id).eq('role',ctx.membership.role).in('permission_id',ids).limit(1);
 return !!grants?.length;
}
export async function requireWorkspacePermission(keys:string[]){
 const ok=await hasAnyWorkspacePermission(keys);
 return ok?null:{error:'You do not have permission to perform this action. Contact your workspace administrator.'};
}
