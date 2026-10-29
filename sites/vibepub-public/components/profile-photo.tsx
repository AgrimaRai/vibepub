"use client";
import { useEffect,useState } from 'react';
import { browserDb } from '@/lib/supabase';
export async function photoRequest(session:string,jpeg:string|null){
 const {data:{session:auth}}=await browserDb().auth.getSession();
 const r=await fetch('/api/profile-photo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth?.access_token}`},body:JSON.stringify({session,jpeg})});
 const data=await r.json();if(!r.ok)throw new Error(data.error);
}
export async function preparePhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Choose a JPEG, PNG or WebP image under 5 MB.');
 const bitmap=await createImageBitmap(file);try{
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=320;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photo editing unavailable.');
 const side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,320,320);
 const jpeg=canvas.toDataURL('image/jpeg',0.8).split(',')[1];if(atob(jpeg).length>131072)throw new Error('Try a smaller image.');return jpeg;
 }finally{bitmap.close();}
}
export function ProfilePhoto({session,user,version,name}:{session:string;user:string;version?:string|null;name:string}){
 const [src,setSrc]=useState('');
 useEffect(()=>{let cancelled=false,object='';setSrc('');if(version)void(async()=>{const {data:{session:auth}}=await browserDb().auth.getSession();const r=await fetch(`/api/profile-photo?session=${session}&user=${user}`,{headers:{Authorization:`Bearer ${auth?.access_token}`},cache:'no-store'});if(r.ok){object=URL.createObjectURL(await r.blob());if(cancelled)URL.revokeObjectURL(object);else setSrc(object);}})().catch(()=>{});return()=>{cancelled=true;if(object)URL.revokeObjectURL(object);};},[session,user,version]);
 // Authenticated blob URLs are intentionally used instead of public image URLs.
 return src?<img src={src} alt={`${name}'s profile`} className="mb-3 size-20 rounded-2xl object-cover"/>:<div aria-hidden className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-white/10 text-xl">{name.slice(0,1).toUpperCase()}</div>;
}
