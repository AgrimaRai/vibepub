"use client";
import {useEffect,useState} from 'react';
import {browserDb} from '@/lib/supabase';
import {act} from '@/lib/actions';
type Report={id:string;name:string;reason:string;details:string;status:string;suspended:boolean};
export function Moderation({session}:{session:string}){
 const [reports,setReports]=useState<Report[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){const {data,error}=await browserDb().rpc('moderation_inbox',{p_session:session});if(error)setError('Unable to load reports.');else setReports(data||[]);}
 useEffect(()=>{void refresh();},[session]);
 async function decide(report:string,decision:'dismiss'|'suspend'|'restore'){setBusy(true);setError('');try{await act({action:'moderate',report,decision});await refresh();}catch(e){setError(e instanceof Error?e.message:'Please retry.');}finally{setBusy(false);}}
 return <section className="my-6 space-y-3 rounded-2xl border border-white/10 p-5"><h2 className="text-xl font-bold">Guest safety reports</h2><p className="text-sm text-zinc-400">Review reports for this venue session. Suspension hides the profile and closes introductions. Restoring access requires the guest to opt in again.</p><button onClick={()=>void refresh()} className="text-sm underline">Refresh reports</button>{error&&<p role="alert">{error}</p>}{!reports.length&&<p className="text-sm text-zinc-400">No reports.</p>}{reports.map(r=><article key={r.id} className="rounded-xl bg-white/5 p-4 space-y-2"><strong>{r.name||'Former guest'}</strong><p>{r.reason} · {r.status}{r.suspended?' · suspended':''}</p><p className="break-words text-sm text-zinc-400">{r.details}</p><div className="flex flex-wrap gap-4">{(['dismiss','suspend','restore'] as const).map(a=><button key={a} disabled={busy} className="text-sm underline" onClick={()=>void decide(r.id,a)}>{a}</button>)}</div></article>)}</section>;
}
