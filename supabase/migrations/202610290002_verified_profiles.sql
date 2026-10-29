-- Verified-email social access, private photos, bounded presence, reports and deletion.
alter table public.guest_profiles drop constraint guest_profiles_nickname_check;
alter table public.guest_profiles add check(length(trim(nickname)) between 2 and 50);
alter table public.guest_profiles drop constraint guest_profiles_intro_check;
alter table public.guest_profiles add check(length(intro)<=240);
alter table public.guest_profiles add column last_seen_at timestamptz;
-- Existing guest opt-ins are not carried into the verified-account directory.
update public.guest_profiles set discoverable=false,last_seen_at=null;
update public.introductions set status='declined' where status in ('pending','accepted');
alter table public.song_requests alter column requested_by drop not null;

create table public.profile_photos (
 user_id uuid primary key references auth.users on delete cascade,
 jpeg bytea not null check(octet_length(jpeg) between 4 and 131072),
 version uuid not null default gen_random_uuid(), updated_at timestamptz not null default now()
);
create table public.social_reports (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sessions,
 reporter uuid references auth.users on delete set null, subject uuid references auth.users on delete set null,
 reason text not null check(reason in ('harassment','spam','unsafe_content','impersonation','other')),
 details text not null default '' check(length(details)<=1000),
 status text not null default 'open' check(status in ('open','resolved')), created_at timestamptz not null default now(),
 unique(session_id,reporter,subject), check(reporter<>subject)
);
create table public.social_suspensions (
 session_id uuid references public.sessions not null,user_id uuid references auth.users on delete cascade not null,
 moderator uuid references auth.users on delete set null,active boolean not null default true,
 primary key(session_id,user_id)
);
alter table public.profile_photos enable row level security;
alter table public.social_reports enable row level security;
alter table public.social_suspensions enable row level security;
revoke all on public.profile_photos,public.social_reports,public.social_suspensions from anon,authenticated;

create function public.verified_account(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_user and email is not null and email_confirmed_at is not null and not coalesce(is_anonymous,true));
$$;
create function public.social_enabled(p_session uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.verified_account(p_user) and exists(select 1 from public.memberships where session_id=p_session and user_id=p_user)
 and not exists(select 1 from public.social_suspensions where session_id=p_session and user_id=p_user and active);
$$;
-- Old RPC names remain, but all old clients now meet the verified-account boundary.
create or replace function public.social_allowed(p_session uuid,p_other uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_other<>auth.uid() and public.social_enabled(p_session,auth.uid()) and public.social_enabled(p_session,p_other)
 and (select count(*)=2 from public.guest_profiles where session_id=p_session and user_id in (auth.uid(),p_other) and discoverable)
 and not exists(select 1 from public.guest_blocks where session_id=p_session and ((blocker=auth.uid() and blocked=p_other) or(blocker=p_other and blocked=auth.uid())));
$$;
create or replace function public.save_profile(p_session uuid,p_nickname text,p_intro text,p_visible boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.verified_account() then raise exception 'Verify your email account before using introductions.'; end if;
 if not public.is_member(p_session) then raise exception 'Join this pub first.'; end if;
 perform 1 from public.sessions where id=p_session and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 if p_nickname is null or length(trim(p_nickname)) not between 2 and 50 or p_intro is null or length(p_intro)>240 or p_visible is null then raise exception 'Enter a name of 2–50 characters and description up to 240 characters.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 if p_visible and not public.social_enabled(p_session,auth.uid()) then raise exception 'Introductions are suspended for this session. Contact venue staff.'; end if;
 insert into public.guest_profiles(session_id,user_id,nickname,intro,discoverable,last_seen_at)
 values(p_session,auth.uid(),trim(p_nickname),trim(p_intro),p_visible,case when p_visible then now() else null end)
 on conflict(session_id,user_id) do update set nickname=excluded.nickname,intro=excluded.intro,discoverable=excluded.discoverable,last_seen_at=excluded.last_seen_at;
 if not p_visible then update public.introductions set status='declined' where session_id=p_session and (sender=auth.uid() or recipient=auth.uid()); end if;
end $$;
create function public.touch_presence(p_session uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.verified_account() or not public.is_member(p_session) then raise exception 'Verified pub membership required.'; end if;
 if p_active and (not public.social_enabled(p_session,auth.uid()) or not exists(select 1 from public.sessions where id=p_session and active)) then raise exception 'Introductions are unavailable.'; end if;
 update public.guest_profiles set last_seen_at=case when p_active and discoverable then now() else null end where session_id=p_session and user_id=auth.uid();
end $$;
create or replace function public.send_intro(p_session uuid,p_other uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.verified_account() then raise exception 'Verify your email account before using introductions.'; end if;
 if not public.is_member(p_session) then raise exception 'Join this pub first.'; end if;
 perform 1 from public.sessions where id=p_session and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 if not public.social_allowed(p_session,p_other) or not exists(select 1 from public.guest_profiles where session_id=p_session and user_id=p_other and last_seen_at>now()-interval '2 minutes') then raise exception 'This guest is not available for introductions.'; end if;
 if (select count(*) from public.introductions where session_id=p_session and sender=auth.uid())>=10 then raise exception 'You have reached tonight’s ten invitation limit.'; end if;
 if exists(select 1 from public.introductions where session_id=p_session and ((sender=auth.uid() and recipient=p_other) or(sender=p_other and recipient=auth.uid()))) then raise exception 'An invitation already exists between you.'; end if;
 insert into public.introductions(session_id,sender,recipient) values(p_session,auth.uid(),p_other);
end $$;
create or replace function public.respond_intro(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare i public.introductions;
begin
 if not public.verified_account() then raise exception 'Verify your email account before using introductions.'; end if;
 select * into i from public.introductions where id=p_id;
 if i.id is null or i.recipient<>auth.uid() then raise exception 'Invitation not available.'; end if;
 perform 1 from public.sessions where id=i.session_id and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(i.session_id::text,1));
 if not public.social_allowed(i.session_id,i.sender) or p_accept is null then raise exception 'Invitation not available.'; end if;
 update public.introductions set status=case when p_accept then 'accepted' else 'declined' end where id=p_id and status='pending';
end $$;
create or replace function public.block_guest(p_session uuid,p_other uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.verified_account() then raise exception 'Verify your email account before using introductions.'; end if;
 if not public.is_member(p_session) or p_other=auth.uid() or not exists(select 1 from public.memberships where session_id=p_session and user_id=p_other) then raise exception 'Guest not available.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 insert into public.guest_blocks values(p_session,auth.uid(),p_other) on conflict do nothing;
 update public.introductions set status='declined' where session_id=p_session and ((sender=auth.uid() and recipient=p_other) or(sender=p_other and recipient=auth.uid()));
end $$;
create or replace function public.social_board(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.verified_account() then raise exception 'Verify your email account before using introductions.'; end if;
 if not public.is_member(p_session) or not exists(select 1 from public.sessions where id=p_session and active) then raise exception 'Join an active pub session first.'; end if;
 return jsonb_build_object('verified',true,'suspended',not public.social_enabled(p_session,auth.uid()),
 'me',(select jsonb_build_object('nickname',g.nickname,'intro',g.intro,'visible',g.discoverable,'photo_version',p.version) from public.guest_profiles g left join public.profile_photos p on p.user_id=g.user_id where g.session_id=p_session and g.user_id=auth.uid()),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',g.user_id,'nickname',g.nickname,'intro',g.intro,'photo_version',p.version) order by g.nickname,g.user_id)
 from public.guest_profiles g left join public.profile_photos p on p.user_id=g.user_id where g.session_id=p_session and g.last_seen_at>now()-interval '2 minutes' and public.social_allowed(p_session,g.user_id)),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'incoming',i.recipient=auth.uid(),'other',p.user_id,'nickname',p.nickname,'status',i.status))
 from public.introductions i join public.guest_profiles p on p.session_id=i.session_id and p.user_id=case when i.sender=auth.uid() then i.recipient else i.sender end
 where i.session_id=p_session and (i.sender=auth.uid() or i.recipient=auth.uid()) and public.social_allowed(p_session,p.user_id)),'[]'::jsonb));
end $$;
create function public.set_profile_photo(p_session uuid,p_jpeg text) returns void language plpgsql security definer set search_path='' as $$
declare image bytea;
begin
 if not public.verified_account() or not public.is_member(p_session) then raise exception 'Verified pub membership required.'; end if;
 if not exists(select 1 from public.sessions where id=p_session and active) then raise exception 'This session has ended.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 if p_jpeg is null then delete from public.profile_photos where user_id=auth.uid(); return; end if;
 if length(p_jpeg)>174764 or p_jpeg !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'Use a JPEG photo smaller than 128 KB.'; end if;
 image=decode(p_jpeg,'base64');
 if octet_length(image) not between 4 and 131072 or encode(substring(image from 1 for 3),'hex')<>'ffd8ff' or encode(substring(image from octet_length(image)-1 for 2),'hex')<>'ffd9' then raise exception 'Use a valid JPEG photo.'; end if;
 if exists(select 1 from public.profile_photos where user_id=auth.uid() and updated_at>now()-interval '10 seconds') then raise exception 'Wait a few seconds before changing your photo again.'; end if;
 insert into public.profile_photos values(auth.uid(),image,gen_random_uuid(),now()) on conflict(user_id) do update set jpeg=excluded.jpeg,version=excluded.version,updated_at=excluded.updated_at;
end $$;
create function public.get_profile_photo(p_session uuid,p_user uuid) returns text language plpgsql stable security definer set search_path='' as $$
begin
 if not public.verified_account() or not public.is_member(p_session) or not exists(select 1 from public.sessions where id=p_session and active) then raise exception 'Verified active membership required.'; end if;
 if p_user<>auth.uid() and (not public.social_allowed(p_session,p_user) or not exists(select 1 from public.guest_profiles where session_id=p_session and user_id=p_user and last_seen_at>now()-interval '2 minutes')) then raise exception 'Photo not available.'; end if;
 return (select replace(encode(jpeg,'base64'),E'\n','') from public.profile_photos where user_id=p_user);
end $$;
create function public.report_guest(p_session uuid,p_other uuid,p_reason text,p_details text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.verified_account() or not public.is_member(p_session) then raise exception 'Verified pub membership required.'; end if;
 if p_other=auth.uid() or not exists(select 1 from public.memberships where session_id=p_session and user_id=p_other) then raise exception 'Guest not available.'; end if;
 if p_reason is null or p_reason not in ('harassment','spam','unsafe_content','impersonation','other') or p_details is null or length(p_details)>1000 then raise exception 'Choose a report reason and details up to 1000 characters.'; end if;
 perform 1 from public.sessions where id=p_session and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 insert into public.social_reports(session_id,reporter,subject,reason,details) values(p_session,auth.uid(),p_other,p_reason,trim(p_details)) on conflict(session_id,reporter,subject) do nothing;
 insert into public.guest_blocks values(p_session,auth.uid(),p_other) on conflict do nothing;
 update public.introductions set status='declined' where session_id=p_session and ((sender=auth.uid() and recipient=p_other) or(sender=p_other and recipient=auth.uid()));
end $$;
create function public.moderation_inbox(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_staff(p_session) then raise exception 'Staff access required.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'subject',r.subject,'name',coalesce(p.nickname,'Former guest'),'reason',r.reason,'details',r.details,'status',r.status,'created_at',r.created_at,'suspended',coalesce(s.active,false)) order by r.created_at desc)
 from public.social_reports r left join public.guest_profiles p on p.session_id=r.session_id and p.user_id=r.subject left join public.social_suspensions s on s.session_id=r.session_id and s.user_id=r.subject where r.session_id=p_session),'[]'::jsonb);
end $$;
create function public.moderate_report(p_report uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare r public.social_reports;
begin
 select * into r from public.social_reports where id=p_report;
 if r.id is null or not public.is_staff(r.session_id) then raise exception 'Staff access required.'; end if;
 if p_action is null or p_action not in ('dismiss','suspend','restore') then raise exception 'Invalid moderation action.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.session_id::text,1));
 if p_action in ('suspend','restore') and r.subject is not null then
  insert into public.social_suspensions values(r.session_id,r.subject,auth.uid(),p_action='suspend') on conflict(session_id,user_id) do update set active=excluded.active,moderator=excluded.moderator;
  if p_action='suspend' then
   update public.guest_profiles set discoverable=false,last_seen_at=null where session_id=r.session_id and user_id=r.subject;
   update public.introductions set status='declined' where session_id=r.session_id and (sender=r.subject or recipient=r.subject);
  end if;
 end if;
 update public.social_reports set status='resolved' where id=p_report;
end $$;
create function public.cancel_intro(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.verified_account() then raise exception 'Verified account required.'; end if;
 update public.introductions set status='declined' where id=p_id and (sender=auth.uid() or recipient=auth.uid());
end $$;
create function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$
declare u uuid=auth.uid();
begin
 if u is null or not public.verified_account() then raise exception 'Verified account required.'; end if;
 if not exists(select 1 from auth.users where id=u and last_sign_in_at>now()-interval '15 minutes') then raise exception 'Sign in again with an email code before deleting your account.'; end if;
 if exists(select 1 from public.venue_staff where user_id=u) then raise exception 'Staff accounts must be removed by the venue administrator.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,2));
 delete from public.guest_profiles where user_id=u;
 delete from public.introductions where sender=u or recipient=u;
 delete from public.guest_blocks where blocker=u or blocked=u;
 delete from public.game_answers where user_id=u;
 update public.song_requests set requested_by=null where requested_by=u;
 delete from public.votes where user_id=u;
 delete from public.memberships where user_id=u;
 delete from auth.users where id=u;
end $$;
revoke all on function public.verified_account(uuid),public.social_enabled(uuid,uuid),public.touch_presence(uuid,boolean),public.set_profile_photo(uuid,text),public.get_profile_photo(uuid,uuid),public.report_guest(uuid,uuid,text,text),public.moderation_inbox(uuid),public.moderate_report(uuid,text),public.cancel_intro(uuid),public.delete_my_account() from public,anon,authenticated;
-- Only the caller's verification status is exposed, never another account's email.
create function public.my_account_verified() returns boolean language sql stable security definer set search_path='' as $$ select public.verified_account(); $$;
revoke all on function public.my_account_verified() from public,anon,authenticated;
grant execute on function public.my_account_verified(),public.touch_presence(uuid,boolean),public.set_profile_photo(uuid,text),public.get_profile_photo(uuid,uuid),public.report_guest(uuid,uuid,text,text),public.moderation_inbox(uuid),public.moderate_report(uuid,text),public.cancel_intro(uuid),public.delete_my_account() to authenticated;
