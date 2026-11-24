'use server';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceContext } from '@/lib/workspace';
import { revalidatePath } from 'next/cache';

export async function setRolePermission(role: string, permissionId: string, enabled: boolean) {
  const ctx = await getWorkspaceContext();
  if (!ctx?.organization || ctx.membership?.role !== 'company_admin') return { error: 'Only a workspace administrator can manage permissions.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_organization_role_permission', {
    p_organization_id: ctx.organization.id,
    p_role: role,
    p_permission_id: permissionId,
    p_enabled: enabled
  });
  if (error) return { error: error.message };
  revalidatePath('/settings/roles');
  return { success: true };
}
