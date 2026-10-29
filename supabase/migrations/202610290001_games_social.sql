-- Staff assignments are provisioned only by the database administrator.
create table public.venue_staff (venue_id uuid references public.venues not null, user_id uuid references auth.users not null, primary key(venue_id,user_id));
alter table public.venue_staff enable row level security;
create function public.is_staff(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sessions s join public.venue_staff v on v.venue_id=s.venue_id where s.id=p_session and v.user_id=auth.uid());
$$;
create policy staff_sessions on public.sessions for select to authenticated using(public.is_staff(id));

create table public.game_rounds (
 id uuid primary key default gen_random_uuid(), session_id uuid references public.sessions not null,
 kind text not null check(kind in ('trivia','poll')), question text not null check(length(trim(question)) between 1 and 200),
 options text[] not null check(cardinality(options) between 2 and 4),
 state text not null default 'open' check(state in ('open','closed')),
 created_at timestamptz not null default now()
);
create unique index one_open_round on public.game_rounds(session_id) where state='open';
create table public.game_keys (round_id uuid primary key references public.game_rounds, correct_option integer not null check(correct_option between 0 and 3));
create table public.game_answers (round_id uuid references public.game_rounds not null, user_id uuid references auth.users not null, choice integer not null check(choice between 0 and 3), primary key(round_id,user_id));
alter table public.game_rounds enable row level security;
alter table public.game_keys enable row level security;
alter table public.game_answers enable row level security;
create policy member_rounds on public.game_rounds for select to authenticated using(public.is_member(session_id) or public.is_staff(session_id));
create policy own_answers on public.game_answers for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.game_rounds r where r.id=round_id and public.is_member(r.session_id)));
grant select on public.game_rounds,public.game_answers to authenticated;

create function public.host_round(p_session uuid,p_kind text,p_question text,p_options text[],p_correct integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.is_staff(p_session) then raise exception 'Staff access required.'; end if;
 perform 1 from public.sessions where id=p_session and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 if p_kind is null or p_kind not in ('trivia','poll') or p_question is null or length(trim(p_question)) not between 1 and 200 or p_options is null or cardinality(p_options) not between 2 and 4
 or exists(select 1 from unnest(p_options) o where o is null or length(trim(o)) not between 1 and 80)
 or (select count(distinct lower(trim(o))) from unnest(p_options) o)<>cardinality(p_options)
 or array_lower(p_options,1)<>1 or array_ndims(p_options)<>1 then raise exception 'Enter a question and 2–4 different options of 1–80 characters.'; end if;
 if p_kind='trivia' and (p_correct is null or p_correct<0 or p_correct>=cardinality(p_options)) then raise exception 'Choose a valid correct answer.'; end if;
 insert into public.game_rounds(session_id,kind,question,options) values(p_session,p_kind,trim(p_question),p_options) returning id into result;
 if p_kind='trivia' then insert into public.game_keys values(result,p_correct); end if;
 return result;
exception when unique_violation then raise exception 'Close the current round before starting another.';
end $$;
create function public.close_round(p_round uuid) returns void language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 select session_id into s from public.game_rounds where id=p_round;
 if s is null or not public.is_staff(s) then raise exception 'Staff access required.'; end if;
 update public.game_rounds set state='closed' where id=p_round;
end $$;
create function public.answer_round(p_round uuid,p_choice integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.game_rounds;
begin
 -- Lock order is session then round, matching the session-close boundary.
 perform 1 from public.sessions s join public.game_rounds g on g.session_id=s.id where g.id=p_round and s.active for share of s;
 if not found then raise exception 'This session has ended.'; end if;
 select * into r from public.game_rounds where id=p_round for share;
 if not public.is_member(r.session_id) then raise exception 'Join this pub first.'; end if;
 if r.state<>'open' then raise exception 'This round has closed.'; end if;
 if p_choice is null or p_choice<0 or p_choice>=cardinality(r.options) then raise exception 'Choose a valid answer.'; end if;
 insert into public.game_answers values(p_round,auth.uid(),p_choice) on conflict do nothing;
end $$;
create function public.game_results(p_round uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.game_rounds;
begin
 select * into r from public.game_rounds where id=p_round;
 if r.id is null or not(public.is_member(r.session_id) or public.is_staff(r.session_id)) then raise exception 'Join this pub first.'; end if;
 if r.state<>'closed' then return null; end if;
 return jsonb_build_object('correct',(select correct_option from public.game_keys where round_id=p_round),
 'counts',(select jsonb_agg(n order by i) from (select i,(select count(*) from public.game_answers where round_id=p_round and choice=i) n from generate_series(0,cardinality(r.options)-1) i) q));
end $$;
create function public.table_scores(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not(public.is_member(p_session) or public.is_staff(p_session)) then raise exception 'Join this pub first.'; end if;
 return coalesce((select jsonb_agg(x order by points desc,label) from (
 select t.label,count(*)*10 as points from public.game_answers a
 join public.game_rounds r on r.id=a.round_id and r.state='closed' and r.kind='trivia'
 join public.game_keys k on k.round_id=r.id and k.correct_option=a.choice
 join public.memberships m on m.user_id=a.user_id and m.session_id=r.session_id
 join public.venue_tables t on t.id=m.table_id where r.session_id=p_session group by t.id,t.label
 ) x),'[]'::jsonb);
end $$;

create table public.guest_profiles (
 session_id uuid references public.sessions not null, user_id uuid references auth.users not null,
 nickname text not null check(length(trim(nickname)) between 2 and 24),
 intro text not null default '' check(length(intro)<=120), discoverable boolean not null default false,
 primary key(session_id,user_id), foreign key(user_id,session_id) references public.memberships(user_id,session_id)
);
create table public.introductions (
 id uuid primary key default gen_random_uuid(), session_id uuid references public.sessions not null,
 sender uuid references auth.users not null, recipient uuid references auth.users not null,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 check(sender<>recipient), unique(session_id,sender,recipient)
);
create index introductions_recipient on public.introductions(session_id,recipient);
create table public.guest_blocks (
 session_id uuid references public.sessions not null, blocker uuid references auth.users not null, blocked uuid references auth.users not null,
 primary key(session_id,blocker,blocked), check(blocker<>blocked)
);
alter table public.guest_profiles enable row level security;
alter table public.introductions enable row level security;
alter table public.guest_blocks enable row level security;
-- No direct guest SELECT or writes; social snapshots apply opt-in, block and session rules.
create function public.social_allowed(p_session uuid,p_other uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_other<>auth.uid() and
 (select count(*)=2 from public.guest_profiles where session_id=p_session and user_id in (auth.uid(),p_other) and discoverable)
 and not exists(select 1 from public.guest_blocks where session_id=p_session and ((blocker=auth.uid() and blocked=p_other) or (blocker=p_other and blocked=auth.uid())));
$$;
create function public.save_profile(p_session uuid,p_nickname text,p_intro text,p_visible boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(p_session) then raise exception 'Join this pub first.'; end if;
 perform 1 from public.sessions where id=p_session and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 if p_nickname is null or length(trim(p_nickname)) not between 2 and 24 or p_intro is null or length(p_intro)>120 or p_visible is null then raise exception 'Enter a nickname of 2–24 characters and introduction up to 120 characters.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 insert into public.guest_profiles values(p_session,auth.uid(),trim(p_nickname),trim(p_intro),p_visible)
 on conflict(session_id,user_id) do update set nickname=excluded.nickname,intro=excluded.intro,discoverable=excluded.discoverable;
 if not p_visible then update public.introductions set status='declined' where session_id=p_session and (sender=auth.uid() or recipient=auth.uid()); end if;
end $$;
create function public.send_intro(p_session uuid,p_other uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(p_session) then raise exception 'Join this pub first.'; end if;
 perform 1 from public.sessions where id=p_session and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 if not public.social_allowed(p_session,p_other) then raise exception 'This guest is not available for introductions.'; end if;
 if (select count(*) from public.introductions where session_id=p_session and sender=auth.uid())>=10 then raise exception 'You have reached tonight’s ten invitation limit.'; end if;
 if exists(select 1 from public.introductions where session_id=p_session and ((sender=auth.uid() and recipient=p_other) or(sender=p_other and recipient=auth.uid()))) then raise exception 'An invitation already exists between you.'; end if;
 insert into public.introductions(session_id,sender,recipient) values(p_session,auth.uid(),p_other);
end $$;
create function public.respond_intro(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare i public.introductions;
begin
 select * into i from public.introductions where id=p_id;
 if i.id is null or i.recipient<>auth.uid() then raise exception 'Invitation not available.'; end if;
 perform 1 from public.sessions where id=i.session_id and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(i.session_id::text,1));
 if not public.social_allowed(i.session_id,i.sender) or p_accept is null then raise exception 'Invitation not available.'; end if;
 update public.introductions set status=case when p_accept then 'accepted' else 'declined' end where id=p_id and status='pending';
end $$;
create function public.block_guest(p_session uuid,p_other uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_member(p_session) or p_other=auth.uid() or not exists(select 1 from public.memberships where session_id=p_session and user_id=p_other) then raise exception 'Guest not available.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_session::text,1));
 insert into public.guest_blocks values(p_session,auth.uid(),p_other) on conflict do nothing;
 update public.introductions set status='declined' where session_id=p_session and ((sender=auth.uid() and recipient=p_other) or(sender=p_other and recipient=auth.uid()));
end $$;
create function public.social_board(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_member(p_session) or not exists(select 1 from public.sessions where id=p_session and active) then raise exception 'Join an active pub session first.'; end if;
 return jsonb_build_object(
 'me',(select jsonb_build_object('nickname',nickname,'intro',intro,'visible',discoverable) from public.guest_profiles where session_id=p_session and user_id=auth.uid()),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'nickname',nickname,'intro',intro) order by nickname,user_id) from public.guest_profiles where session_id=p_session and public.social_allowed(p_session,user_id)),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'incoming',i.recipient=auth.uid(),'other',p.user_id,'nickname',p.nickname,'status',i.status))
 from public.introductions i join public.guest_profiles p on p.session_id=i.session_id and p.user_id=case when i.sender=auth.uid() then i.recipient else i.sender end
 where i.session_id=p_session and (i.sender=auth.uid() or i.recipient=auth.uid()) and public.social_allowed(p_session,p.user_id)),'[]'::jsonb));
end $$;

-- Explicit privileges: direct write and secret-key reads are never granted.
revoke all on public.venue_staff,public.game_rounds,public.game_keys,public.game_answers,public.guest_profiles,public.introductions,public.guest_blocks from anon,authenticated;
grant select on public.game_rounds,public.game_answers to authenticated;
revoke all on function public.is_staff(uuid),public.host_round(uuid,text,text,text[],integer),public.close_round(uuid),public.answer_round(uuid,integer),public.game_results(uuid),public.table_scores(uuid),public.social_allowed(uuid,uuid),public.save_profile(uuid,text,text,boolean),public.send_intro(uuid,uuid),public.respond_intro(uuid,boolean),public.block_guest(uuid,uuid),public.social_board(uuid) from public,anon,authenticated;
grant execute on function public.is_staff(uuid),public.host_round(uuid,text,text,text[],integer),public.close_round(uuid),public.answer_round(uuid,integer),public.game_results(uuid),public.table_scores(uuid),public.save_profile(uuid,text,text,boolean),public.send_intro(uuid,uuid),public.respond_intro(uuid,boolean),public.block_guest(uuid,uuid),public.social_board(uuid) to authenticated;
alter publication supabase_realtime add table public.game_rounds;
create function public.venue_links(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_staff(p_session) then raise exception 'Staff access required.'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('label',t.label,'token',t.qr_token) order by t.label),'[]'::jsonb) from public.venue_tables t join public.sessions s on s.venue_id=t.venue_id where s.id=p_session);
end $$;
revoke all on function public.venue_links(uuid) from public,anon,authenticated;
grant execute on function public.venue_links(uuid) to authenticated;
