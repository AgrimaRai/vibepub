"use client";
import { useEffect, useState } from 'react';
import { browserDb } from '@/lib/supabase';
import { Captcha } from './captcha';
export function Account({onVerified}:{onVerified:(value:boolean)=>void}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[mode,setMode]=useState<'upgrade'|'login'>('upgrade'),[sent,setSent]=useState(false),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[captcha,setCaptcha]=useState(''),[confirmation,setConfirmation]=useState('');
 useEffect(()=>{
  let active=true;
  const check=async()=>{const {data,error}=await browserDb().rpc('my_account_verified');if(active){const ok=!error&&data===true;setVerified(ok);onVerified(ok);}};
  void check();
  const {data:{subscription}}=browserDb().auth.onAuthStateChange(()=>{setTimeout(()=>void check(),0);});
  return()=>{active=false;subscription.unsubscribe();};
 },[onVerified]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage('');try{
  const auth=browserDb().auth;
  if(!sent){
   const {data:{user}}=await auth.getUser();
   const result=mode==='upgrade'&&user?.is_anonymous ? await auth.updateUser({email}) : await auth.signInWithOtp({email,options:{shouldCreateUser:mode==='upgrade',captchaToken:captcha||undefined}});
   if(result.error)throw result.error;setSent(true);setMessage('Check your inbox. Open the verification link, or enter the code if your email includes one. Do not share links or codes.');
  }else{
   const {data:{user}}=await auth.getUser();
   const {error}=await auth.verifyOtp({email,token:code,type:mode==='upgrade'&&user?.is_anonymous?'email_change':'email'});
   if(error)throw error;
   const check=await browserDb().rpc('my_account_verified');if(check.error||!check.data)throw new Error('Your email is not yet verified. Please retry.');
   setVerified(true);onVerified(true);setSent(false);setCode('');setMessage('Email verified. You can now create your introduction.');
  }
 }catch(e){setMessage(e instanceof Error?e.message:'Please retry.');}finally{setBusy(false);}}
 async function remove(){setBusy(true);try{
  const {data:{session}}=await browserDb().auth.getSession();
  const r=await fetch('/api/account',{method:'DELETE',headers:{Authorization:`Bearer ${session?.access_token}`}}),body=await r.json();if(!r.ok)throw new Error(body.error);
  await browserDb().auth.signOut();window.location.reload();
 }catch(e){setMessage(e instanceof Error?e.message:'Unable to delete.');}finally{setBusy(false);}}
 return <div className="rounded-2xl border border-white/10 bg-[#19191e] p-5 space-y-4">
 <h3 className="font-bold">{verified?'Your verified account':'Verify your email to meet people'}</h3>
 <p className="text-sm leading-6 text-zinc-400">Your email stays private. Verification confirms access to an inbox; it does not verify someone’s identity. Songs and games remain available as a guest.</p>
 {!verified&&<form onSubmit={submit} className="space-y-3">
 {!sent&&<><label className="block text-sm">Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2"/></label><label className="block text-sm">Account option<select className="mt-2 w-full rounded-xl bg-zinc-800 p-3" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="upgrade">Create account and keep this guest session</option><option value="login">Sign in to an existing account</option></select></label>{mode==='login'&&<p className="text-xs text-amber-200">Signing in switches accounts. Your current guest votes are not merged.</p>}<Captcha onToken={setCaptcha}/></>}
 {sent&&<label className="block text-sm">Verification code (if included)<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.trim())} className="mt-2"/></label>}
 <button disabled={busy} className="rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black">{busy?'Please wait…':sent?'Verify code':'Send verification email'}</button>{sent&&<button type="button" onClick={()=>{setSent(false);setCode('');}} className="ml-4 text-sm underline">Change email / resend</button>}
 </form>}
 {message&&<p role="status" className="text-sm text-amber-200">{message}</p>}
 {verified&&<details><summary className="cursor-pointer text-sm text-zinc-400">Account settings</summary><p className="my-3 text-xs leading-5 text-zinc-400">Delete removes your account, profile, photo, votes and game answers. Song requests remain without your identity. Moderation reports may be retained. You must have signed in within 15 minutes; otherwise sign out and sign in with a new email code.</p><input placeholder="Type DELETE to confirm" aria-label="Confirm account deletion" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/><button disabled={busy||confirmation!=='DELETE'} onClick={()=>void remove()} className="mt-3 rounded-lg border border-red-400/50 p-3 text-red-300">Delete my account</button><button disabled={busy} onClick={()=>void browserDb().auth.signOut().then(()=>window.location.reload())} className="ml-4 text-sm underline">Sign out</button></details>}
 </div>;
}
