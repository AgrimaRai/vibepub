import { authenticated } from '@/lib/server-auth';
import { limitedJson, PayloadTooLarge } from '@/lib/limited-json';
import { z } from 'zod';
const schema=z.object({session:z.uuid(),jpeg:z.string().max(174764).nullable()});
export async function GET(req:Request){
 try{
  const db=await authenticated(req),url=new URL(req.url);
  const args=z.object({session:z.uuid(),user:z.uuid()}).parse(Object.fromEntries(url.searchParams));
  const {data,error}=await db.rpc('get_profile_photo',{p_session:args.session,p_user:args.user});
  if(error||!data) return new Response(null,{status:404});
  return new Response(Buffer.from(data,'base64'),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:401});}
}
export async function POST(req:Request){
 try{
  const db=await authenticated(req),body=schema.parse(await limitedJson(req,180000));
  const {error}=await db.rpc('set_profile_photo',{p_session:body.session,p_jpeg:body.jpeg});
  if(error) return Response.json({error:error.code==='P0001'?error.message:'Photo could not be saved.'},{status:400});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:'Check your sign-in and photo.'},{status:e instanceof PayloadTooLarge?413:400});}
}
