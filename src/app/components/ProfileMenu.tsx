'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {UserCircle,ChevronDown,LogOut,Settings} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
import {signOut} from '@/app/actions/auth';

export function ProfileMenu(){
 const [open,setOpen]=useState(false);
 const [profile,setProfile]=useState<{name:string|null;avatar:string|null;email:string|null}>({name:null,avatar:null,email:null});
 const root=useRef<HTMLDivElement>(null);const pathname=usePathname();
 useEffect(()=>{let alive=true;const load=async()=>{try{const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data}=await supabase.from('profiles').select('full_name,avatar_url').eq('id',user.id).maybeSingle();if(alive)setProfile({name:data?.full_name??user.user_metadata?.full_name??null,avatar:data?.avatar_url??null,email:user.email??null});}catch{}};void load();return()=>{alive=false}},[]);
 useEffect(()=>{const close=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};document.addEventListener('mousedown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',key)}},[]);
 useEffect(()=>setOpen(false),[pathname]);
 const label=profile.name||profile.email||'My account';const initials=(profile.name||profile.email||'U').trim().slice(0,1).toUpperCase();
 return <div ref={root} className="fixed right-4 top-2 z-[60] md:right-6 md:top-4">
  <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label="Open profile menu" className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 p-1.5 pr-3 text-slate-800 shadow-md backdrop-blur hover:bg-white">
   <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-blue-100 text-sm font-bold text-blue-800">{profile.avatar?<img src={profile.avatar} alt="" className="h-full w-full object-cover"/>:profile.name||profile.email?<span>{initials}</span>:<UserCircle size={20}/>}</span>
   <span className="hidden max-w-36 truncate text-sm font-semibold sm:block">{profile.name||'My account'}</span><ChevronDown size={15}/>
  </button>
  {open&&<div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
   <div className="border-b p-4"><p className="truncate text-sm font-semibold text-slate-900">{label}</p><p className="mt-1 truncate text-xs text-slate-500">{profile.email}</p></div>
   <div className="p-2"><Link href="/settings/profile" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><UserCircle size={17}/>My profile</Link><Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Settings size={17}/>Settings</Link><form action={signOut}><button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"><LogOut size={17}/>Sign out</button></form></div>
  </div>}
 </div>;
}
