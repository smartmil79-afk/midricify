import { createClient } from "@/lib/supabase/server";

export type WorkspaceContext = {
  user: { id: string; email: string | null; fullName: string | null };
  organization: { id: string; name: string; country_code: string; base_currency: string } | null;
  membership: { role: string; department_id: string | null } | null;
  departments: { id: string; name: string; code: string | null; is_active: boolean }[];
  memberCount: number;
};

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data: memberships } = await supabase
      .from("organization_memberships")
      .select("organization_id, role, department_id")
      .eq("user_id", auth.user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    const membership = memberships?.[0] ?? null;
    let organization = null;
    let departments: WorkspaceContext["departments"] = [];
    let memberCount = 0;
    if (membership) {
      const [{ data: org }, { data: deps }, { count }] = await Promise.all([
        supabase.from("organizations").select("id,name,country_code,base_currency").eq("id", membership.organization_id).maybeSingle(),
        supabase.from("departments").select("id,name,code,is_active").eq("organization_id", membership.organization_id).order("name"),
        supabase.from("organization_memberships").select("*", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "active")
      ]);
      organization = org;
      departments = deps ?? [];
      memberCount = count ?? 0;
    }
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
    return {
      user: { id: auth.user.id, email: auth.user.email ?? null, fullName: profile?.full_name ?? auth.user.user_metadata?.full_name ?? null },
      organization,
      membership: membership ? { role: membership.role, department_id: membership.department_id } : null,
      departments,
      memberCount
    };
  } catch {
    return null;
  }
}
