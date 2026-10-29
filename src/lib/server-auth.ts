import { createClient } from '@supabase/supabase-js';
export async function authenticated(req: Request) {
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) throw new Error('Service unavailable.');
 if(!token) throw new Error('Sign in required.');
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user) throw new Error('Sign in required.');
 return db;
}
