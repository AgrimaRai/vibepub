import { authenticated } from '@/lib/server-auth';
export async function DELETE(req:Request){
 try{
  const db=await authenticated(req);
  const {error}=await db.rpc('delete_my_account');
  if(error) return Response.json({error:error.code==='P0001'?error.message:'Account could not be deleted.'},{status:400});
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Sign in required.'},{status:401});}
}
