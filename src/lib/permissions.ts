import {createClient} from '@/lib/supabase/server';
import {getWorkspaceContext} from '@/lib/workspace';
export async function hasAnyWorkspacePermission(keys:string[]):Promise<boolean>{
 if(!keys.length)return false;
 const ctx=await getWorkspaceContext();if(!ctx?.organization||!ctx.membership)return false;
 if(ctx.membership.role==='company_admin')return true;
 const sb=await createClient();
 const {data:permissions,error:permissionError}=await sb.from('permissions').select('id').in('key',keys);
 if(permissionError)return false;
 const ids=(permissions??[]).map(p=>p.id);if(!ids.length)return false;
 const {data:grants,error:grantError}=await sb.from('organization_role_permissions').select('permission_id').eq('organization_id',ctx.organization.id).eq('role',ctx.membership.role).in('permission_id',ids).limit(1);
 return !grantError && !!grants?.length;
}
export async function requireWorkspacePermission(keys:string[]):Promise<{error?:string;success?:boolean;data?:unknown;id?:string}|null>{
 const ok=await hasAnyWorkspacePermission(keys);
 return ok?null:{error:'You do not have permission to perform this action. Contact your workspace administrator.'};
}
