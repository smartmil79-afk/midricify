import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export default async function ProfileSettingsPage({searchParams}:{searchParams:Promise<{status?:string}>}) {
 const ctx=await getWorkspaceContext();
 if(!ctx) redirect("/login");
 const supabase=await createClient();
 const [{data:profile},{data:membership}] = await Promise.all([
  supabase.from("profiles").select("full_name,avatar_url,phone,unit_section").eq("id",ctx.user.id).maybeSingle(),
  supabase.from("organization_memberships").select("department_id,departments(name)").eq("user_id",ctx.user.id).eq("status","active").order("created_at",{ascending:true}).limit(1).maybeSingle()
 ]);
 const department=(membership?.departments as any)?.name ?? ctx.departments.find(d=>d.id===membership?.department_id)?.name ?? "Not assigned";
 const params=await searchParams;
 async function saveProfile(formData:FormData){
  "use server";
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user) redirect("/login");
  const full_name=String(formData.get("full_name")??"").trim();
  const phone=String(formData.get("phone")??"").trim();
  const avatar_url=String(formData.get("avatar_url")??"").trim();
  const unit_section=String(formData.get("unit_section")??"").trim();
  const email=String(formData.get("email")??"").trim().toLowerCase();
  if(!full_name){redirect("/settings/profile?status=name-required");}
  const {error}=await db.from("profiles").upsert({id:user.id,full_name,phone:phone||null,avatar_url:avatar_url||null,unit_section:unit_section||null,updated_at:new Date().toISOString()});
  if(error) redirect("/settings/profile?status=save-error");
  if(email && email!==user.email?.toLowerCase()){
   const {error:emailError}=await db.auth.updateUser({email});
   if(emailError) redirect("/settings/profile?status=email-error");
   redirect("/settings/profile?status=email-verification");
  }
  revalidatePath("/settings/profile");revalidatePath("/settings");
  redirect("/settings/profile?status=saved");
 }
 const statusText:Record<string,string>={saved:"Your profile has been updated.", "email-verification":"Check your new email inbox to confirm the email change.", "name-required":"Full name is required.", "save-error":"We could not save your profile. Please try again.", "email-error":"Profile saved, but the email change could not be requested."};
 return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="mx-auto max-w-3xl">
  <Link href="/settings" className="text-sm text-blue-700">← Settings</Link>
  <h1 className="mt-4 text-3xl font-bold text-slate-900">My profile</h1><p className="mt-2 text-slate-500">Manage the personal details shown in your MIDRICIFY workspace.</p>
  {params.status&&statusText[params.status]&&<div role="status" className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{statusText[params.status]}</div>}
  <form action={saveProfile} className="mt-7 space-y-6 rounded-2xl border bg-white p-5 md:p-8">
   <div className="flex items-center gap-4 border-b pb-6">
    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-slate-100 text-xl font-bold text-slate-500">{profile?.avatar_url?<img src={profile.avatar_url} alt="Profile avatar" className="h-full w-full object-cover"/>:(profile?.full_name||ctx.user.email||"U").slice(0,1).toUpperCase()}</div>
    <div><div className="font-semibold text-slate-900">Profile photo</div><p className="text-xs text-slate-500">Add a publicly accessible image URL below.</p></div>
   </div>
   <div className="grid gap-5 md:grid-cols-2">
    <label className="text-sm font-medium text-slate-700">Full name<input name="full_name" required defaultValue={profile?.full_name??ctx.user.fullName??""} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" placeholder="Your full name"/></label>
    <label className="text-sm font-medium text-slate-700">Phone number<input name="phone" type="tel" defaultValue={profile?.phone??""} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" placeholder="+234..."/></label>
    <label className="text-sm font-medium text-slate-700 md:col-span-2">Avatar image URL<input name="avatar_url" type="url" defaultValue={profile?.avatar_url??""} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" placeholder="https://..."/></label>
    <label className="text-sm font-medium text-slate-700">Email address<input name="email" type="email" defaultValue={ctx.user.email??""} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" required/><span className="mt-1 block text-xs font-normal text-slate-500">Changing your email requires confirmation from the new inbox.</span></label>
    <label className="text-sm font-medium text-slate-700">Department<input value={department} readOnly className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-normal text-slate-600"/><span className="mt-1 block text-xs font-normal text-slate-500">Your department is assigned by a workspace administrator.</span></label>
    <label className="text-sm font-medium text-slate-700 md:col-span-2">Unit / Section<input name="unit_section" defaultValue={profile?.unit_section??""} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" placeholder="e.g. Procurement, Accounts, Operations"/></label>
   </div>
   <div className="flex justify-end border-t pt-5"><button type="submit" className="rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">Save profile</button></div>
  </form>
 </div></main>;
}
