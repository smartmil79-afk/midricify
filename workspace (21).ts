'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createDepartment(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  if (name.length < 2) return { error: 'Department name must be at least 2 characters.' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Please sign in first.' };
  const { data: membership } = await supabase.from('organization_memberships').select('organization_id,role').eq('user_id', auth.user.id).eq('status','active').limit(1).maybeSingle();
  if (!membership || membership.role !== 'company_admin') return { error: 'Only Company Admins can manage departments.' };
  const { error } = await supabase.from('departments').insert({ organization_id: membership.organization_id, name, code: code || null });
  if (error) return { error: error.message };
  revalidatePath('/settings/departments'); revalidatePath('/'); return { success: true };
}

export async function createInvitation(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? 'requester');
  if (!email || !email.includes('@')) return { error: 'Enter a valid email address.' };
  const allowed = ['requester','department_head','procurement_officer','auditor','finance_officer','accountant','storekeeper','executive_approver'];
  if (!allowed.includes(role)) return { error: 'Invalid role selected.' };
  const supabase = await createClient(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Please sign in first.' };
  const { data: membership } = await supabase.from('organization_memberships').select('organization_id,role').eq('user_id', auth.user.id).eq('status','active').limit(1).maybeSingle();
  if (!membership || membership.role !== 'company_admin') return { error: 'Only Company Admins can invite users.' };
  const { error } = await supabase.from('organization_invitations').upsert({ organization_id: membership.organization_id, email, role, invited_by: auth.user.id, status: 'pending' }, { onConflict: 'organization_id,email' });
  if (error) return { error: error.message };
  revalidatePath('/settings/team'); return { success: true, message: 'Invitation record created. Email delivery is not configured yet.' };
}
