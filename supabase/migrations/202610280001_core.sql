create table public.venues (id uuid primary key default gen_random_uuid(), name text not null);
create table public.venue_tables (id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues, label text not null, qr_token uuid not null unique default gen_random_uuid());
create table public.sessions (id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues, name text not null, active boolean not null default true);
create unique index one_active_session on public.sessions(venue_id) where active;
create table public.memberships (user_id uuid not null references auth.users on delete cascade, session_id uuid not null references public.sessions, table_id uuid not null references public.venue_tables, primary key(user_id,session_id));
create table public.song_requests (id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sessions, title text not null check(length(trim(title)) between 1 and 100), artist text not null check(length(trim(artist)) between 1 and 100), requested_by uuid not null references auth.users, created_at timestamptz not null default now(), votes integer not null default 0 check(votes>=0));
create unique index unique_track on public.song_requests(session_id,lower(trim(title)),lower(trim(artist)));
create table public.votes (user_id uuid not null references auth.users on delete cascade, request_id uuid not null references public.song_requests on delete cascade, primary key(user_id,request_id));
create index on public.song_requests(session_id);
create index on public.votes(request_id);

create function public.is_member(p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.memberships where user_id=auth.uid() and session_id=p_session);
$$;
create function public.join_table(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.venue_tables; s public.sessions; v text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into t from public.venue_tables where qr_token=p_token;
 if not found then raise exception 'Invalid table link. Ask staff for a fresh QR code.'; end if;
 select * into s from public.sessions where venue_id=t.venue_id and active;
 if not found then raise exception 'No active session. Please ask your DJ.'; end if;
 insert into public.memberships values(auth.uid(),s.id,t.id) on conflict(user_id,session_id) do nothing;
 -- Keep the first table assignment for this session.
 select vt.label into v from public.memberships m join public.venue_tables vt on vt.id=m.table_id where m.user_id=auth.uid() and m.session_id=s.id;
 return jsonb_build_object('session',s.id,'name',s.name,'venue',(select name from public.venues where id=t.venue_id),'table',v);
end $$;
create function public.request_song(p_session uuid,p_title text,p_artist text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.is_member(p_session) then raise exception 'Scan a table QR code to join first.'; end if;
 -- Serialize each guest's requests to make the quota safe under concurrent calls.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 perform 1 from public.sessions where id=p_session and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 if p_title is null or p_artist is null or length(trim(p_title)) not between 1 and 100 or length(trim(p_artist)) not between 1 and 100 then raise exception 'Enter a title and artist of 1–100 characters.'; end if;
 if (select count(*) from public.song_requests where requested_by=auth.uid() and session_id=p_session)>=5 then raise exception 'You have used your five requests for tonight. Vote for a favorite instead.'; end if;
 insert into public.song_requests(session_id,title,artist,requested_by) values(p_session,trim(p_title),trim(p_artist),auth.uid()) returning id into result;
 return result;
exception when unique_violation then raise exception 'That track is already on the board. Give it a vote!';
end $$;
create function public.vote_song(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 select session_id into s from public.song_requests where id=p_request;
 if s is null or not public.is_member(s) then raise exception 'Join this session before voting.'; end if;
 perform 1 from public.sessions where id=s and active for share;
 if not found then raise exception 'This session has ended.'; end if;
 insert into public.votes values(auth.uid(),p_request) on conflict do nothing;
end $$;
create function public.update_vote_count() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then update public.song_requests set votes=votes+1 where id=NEW.request_id; return NEW;
 else update public.song_requests set votes=votes-1 where id=OLD.request_id; return OLD; end if;
end $$;
create trigger count_votes after insert or delete on public.votes for each row execute function public.update_vote_count();

alter table public.venues enable row level security;
alter table public.venue_tables enable row level security;
alter table public.sessions enable row level security;
alter table public.memberships enable row level security;
alter table public.song_requests enable row level security;
alter table public.votes enable row level security;
create policy own_memberships on public.memberships for select to authenticated using(user_id=auth.uid());
create policy member_sessions on public.sessions for select to authenticated using(public.is_member(id));
create policy member_requests on public.song_requests for select to authenticated using(public.is_member(session_id));
create policy own_votes on public.votes for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.song_requests r where r.id=request_id and public.is_member(r.session_id)));
revoke all on public.venues,public.venue_tables,public.sessions,public.memberships,public.song_requests,public.votes from anon,authenticated;
grant select on public.sessions,public.memberships,public.song_requests,public.votes to authenticated;
revoke all on function public.is_member(uuid),public.join_table(uuid),public.request_song(uuid,text,text),public.vote_song(uuid),public.update_vote_count() from public,anon,authenticated;
grant execute on function public.is_member(uuid),public.join_table(uuid),public.request_song(uuid,text,text),public.vote_song(uuid) to authenticated;
alter publication supabase_realtime add table public.song_requests;
