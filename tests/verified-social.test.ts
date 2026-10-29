import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('verified social access, private photos, expiry, reporting, moderation and deletion',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default true,last_sign_in_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const f of ['202610280001_core.sql','202610290001_games_social.sql','202610290002_verified_profiles.sql'])await db.exec((await readFile(`supabase/migrations/${f}`,'utf8')).replace(/^alter publication .*;$/gm,''));
 await db.exec(await readFile('supabase/seed.sql','utf8'));
 const a='30000000-0000-4000-8000-000000000001',b='30000000-0000-4000-8000-000000000002',h='30000000-0000-4000-8000-000000000003',s='20000000-0000-4000-8000-000000000001';
 await db.query('insert into auth.users(id) values($1),($2),($3)',[a,b,h]);
 const as=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 const profile=()=>db.query("select public.save_profile($1,'Alex','Quiz fan',true)",[s]);
 const board=async()=> (await db.query<{b:{people:unknown[]}}>('select public.social_board($1) b',[s])).rows[0].b;
 await as(a);await db.query("select public.join_table('70000000-0000-4000-8000-000000000007')");await assert.rejects(profile(),/Verify/);await assert.rejects(board(),/Verif/);
 await as(b);await db.query("select public.join_table('70000000-0000-4000-8000-000000000000')");
 await db.exec('reset role');await db.exec("update auth.users set email=id::text||'@example.test',email_confirmed_at=now(),is_anonymous=false,last_sign_in_at=now()");await db.query("insert into venue_staff values('10000000-0000-4000-8000-000000000001',$1)",[h]);
 await as(a);await profile();await as(b);await profile();assert.equal((await board()).people.length,1);
 await assert.rejects(db.query('select * from profile_photos'),/permission denied/);
 await assert.rejects(db.query("select public.set_profile_photo($1,'bm90LWltYWdl')",[s]),/JPEG|photo/i);
 await db.query("select public.set_profile_photo($1,'\/9j\/2Q==')",[s]);
 await as(a);assert.ok((await db.query<{p:string}>('select public.get_profile_photo($1,$2) p',[s,b])).rows[0].p);
 await db.exec('reset role');await db.query("update guest_profiles set last_seen_at=now()-interval '3 minutes' where user_id=$1",[b]);await as(a);assert.equal((await board()).people.length,0);await assert.rejects(db.query('select public.send_intro($1,$2)',[s,b]),/active|available/i);
 await as(b);await db.query('select public.touch_presence($1,true)',[s]);await as(a);await db.query('select public.send_intro($1,$2)',[s,b]);
 await db.query("select public.report_guest($1,$2,'harassment','Unwanted contact')",[s,b]);assert.equal((await board()).people.length,0);await assert.rejects(db.query('select public.moderation_inbox($1)',[s]),/Staff/);
 await as(h);const inbox=await db.query<{r:Array<{id:string}>}>('select public.moderation_inbox($1) r',[s]);await db.query("select public.moderate_report($1,'suspend')",[inbox.rows[0].r[0].id]);await as(b);await assert.rejects(profile(),/suspend|unavailable/i);
 await db.query('select public.delete_my_account()');await db.exec('reset role');assert.equal((await db.query('select id from auth.users where id=$1',[b])).rows.length,0);assert.equal((await db.query('select * from profile_photos where user_id=$1',[b])).rows.length,0);
 }finally{await db.close();}
});
