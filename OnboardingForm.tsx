'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingForm(){
  const [name,setName]=useState('');
  const [country,setCountry]=useState('NG');
  const [currency,setCurrency]=useState('NGN');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [fullName,setFullName]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [signedIn,setSignedIn]=useState(false);
  useEffect(()=>{createClient().auth.getSession().then(({data})=>setSignedIn(!!data.session));},[]);

  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      const supabase=createClient();
      if(!signedIn){
        const {data,error:signupError}=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo:`${location.origin}/auth/callback`}});
        if(signupError)throw signupError;
        if(!data.session){setError('Account created. Confirm your email, then sign in to complete workspace setup.');return;}
      }
      const {error:rpcError}=await supabase.rpc('create_organization_for_current_user',{p_name:name,p_country_code:country,p_base_currency:currency});
      if(rpcError)throw rpcError;
      window.location.href='/';
    }catch(err){setError(err instanceof Error?err.message:'Workspace setup failed. Please try again.');}
    finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
    {!signedIn&&<><label className="text-sm font-medium sm:col-span-2">Your full name<input required value={fullName} onChange={e=>setFullName(e.target.value)} className="block w-full mt-1 border rounded-lg px-3 py-2" placeholder="Full name"/></label><label className="text-sm font-medium">Business email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="block w-full mt-1 border rounded-lg px-3 py-2" placeholder="admin@company.com"/></label><label className="text-sm font-medium">Password<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="block w-full mt-1 border rounded-lg px-3 py-2" placeholder="At least 8 characters"/></label></>}
    <label className="text-sm font-medium sm:col-span-2">Organization name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} className="block w-full mt-1 border rounded-lg px-3 py-2" placeholder="Company Limited"/></label>
    <label className="text-sm font-medium">Country<select value={country} onChange={e=>{setCountry(e.target.value);setCurrency(e.target.value==='NG'?'NGN':e.target.value==='GH'?'GHS':e.target.value==='KE'?'KES':e.target.value==='ZA'?'ZAR':e.target.value==='GB'?'GBP':'USD')}} className="block w-full mt-1 border rounded-lg px-3 py-2"><option value="NG">Nigeria</option><option value="GH">Ghana</option><option value="KE">Kenya</option><option value="ZA">South Africa</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="OT">Other</option></select></label>
    <label className="text-sm font-medium">Base currency<select value={currency} onChange={e=>setCurrency(e.target.value)} className="block w-full mt-1 border rounded-lg px-3 py-2"><option>NGN</option><option>USD</option><option>GHS</option><option>KES</option><option>ZAR</option><option>GBP</option></select></label>
    {error&&<p role="alert" className="sm:col-span-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
    <button disabled={busy} className="sm:col-span-2 bg-blue-600 disabled:opacity-60 text-white rounded-lg py-3 font-semibold">{busy?'Creating workspace…':'Create workspace'}</button>
  </form>;
}
