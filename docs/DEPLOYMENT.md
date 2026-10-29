# Deploy VibePub

## Current public deployment

VibePub is live at https://vibepub-live-night.truekrill4096.chatgpt.site using Sites/Vinext on Cloudflare. Public access is enabled. The source checkout is `sites/vibepub-public`, Site ID `appgprj_6ae2d07adc788191a9b1be31aee8a86a`, version 1, commit `1157de70e32db1161d41dc1d79a913e22024ce6a`. Keep that Site identity for updates; do not create a new Site for each edit. The supplied Next.js/Vercel/Docker instructions below remain alternate hosting options, not the currently deployed path.

Use the Sites source helper to synchronize/push/package changed source and publish the resulting saved version. Preserve its Worker/build integration. The public Supabase URL, public key and default entrance token are configured in Sites runtime settings; local ignored environment values provide browser build-time substitution. Never put service-role keys or credentials in the hosting manifest.

Turnstile and permanent staff accounts remain separate operational setup. Physical phone camera scanning has not been tested here. Use `outputs/PUBLIC-LAUNCH.md` and the public QR PNGs for guest entry.

## 1. Supabase setup

Use a separate production Supabase project. Apply both migrations using the README's CLI steps, enable anonymous Auth, set your app's HTTPS site URL, and enable Turnstile in Supabase Auth with the secret corresponding to your public site key. Configure allowed hostnames in Turnstile. Keep the service-role key out of the browser and build arguments.

For a new venue, run this once as the database administrator in SQL Editor (change names as needed):

```sql
do $$
declare venue uuid;
begin
 insert into public.venues(name) values('The Midnight Social') returning id into venue;
 insert into public.venue_tables(venue_id,label) values(venue,'07'),(venue,'12'),(venue,'Pub floor');
 insert into public.sessions(venue_id,name) values(venue,'Tonight · DJ Nova');
end $$;
select id,name from public.venues;
```

Every table receives a fresh random admission token. Create a permanent staff Auth user with an email/password in Supabase's Auth dashboard. Then assign it to the actual venue UUID from the previous query:

```sql
insert into public.venue_staff(venue_id,user_id)
select 'REPLACE_WITH_ACTUAL_VENUE_UUID'::uuid,id
from auth.users where email='REPLACE_WITH_STAFF_EMAIL'
on conflict do nothing;
```

Verify exactly one expected user received the assignment. Never grant staff to anonymous guest accounts. Only the database administrator can write `venue_staff`.

For an existing venue lacking an entrance QR:

```sql
insert into public.venue_tables(venue_id,label)
select id,'Pub floor' from public.venues
where id='REPLACE_WITH_ACTUAL_VENUE_UUID'::uuid
and not exists(select 1 from public.venue_tables where venue_id=public.venues.id and label='Pub floor');
```

## 2. Build environment

Set these values on the host **before building**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY=YOUR_TURNSTILE_SITE_KEY
```

These values are public. The CAPTCHA secret is configured only in Supabase Auth. Changing a public value requires a rebuild. Never copy `.env.local` into a Docker build context or upload it into Git. Run `npm run deploy:check` locally with production `.env.local` to catch missing values and obvious secret-key mistakes; this is a shape check, not integration verification.

## 3A. Vercel

Push the project to your own Git repository, import it in Vercel, select Next.js and Node 22, and set the environment values above for production and preview as appropriate. Use `npm ci` to install, `npm run build:production` to build, and the project root as the root directory. Supabase remains the persistent backend; Vercel's filesystem is not used for user data. Configure a custom HTTPS domain, then update Supabase Auth/Turnstile allowed origins/hostnames and rebuild if environment values change. No credentials or hosted project are supplied by this repository, and no publishing action has been performed here.

## 3B. Docker or a Node container host

From a shell where the three public variables have been exported:

```sh
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="$NEXT_PUBLIC_TURNSTILE_SITE_KEY" \
  -t vibepub:latest .

docker run --name vibepub --restart unless-stopped -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY \
  -e NEXT_PUBLIC_TURNSTILE_SITE_KEY \
  vibepub:latest
```

The build refuses missing production settings via `build:production`. The image uses Next standalone output, runs as a non-root user, and has a local HTTP health check. Put an HTTPS reverse proxy/load balancer in front of port 3000. Runtime environment variables must match the build-time public values. `/api/health` reports `configured` or `preview` and explicitly says database connectivity is not probed; HTTP 200 only means the web process responds.

The Dockerfile is supplied but its container build/run has not been verified here because Docker socket access is unavailable. The equivalent Next production build is tested separately.

## 4. Operate a night

Sign in at `/host`, choose the assigned active session, and download the entrance and table QR codes. Print them at the bar/tables. The entrance code puts guests on the Pub floor team. Start a trivia round with 2–4 unique answers and one correct option, or start a crowd poll. Guests lock a single response. Close the round to reveal counts and award ten trivia points per correct guest response to their table. Only one round can be open at once. Polls do not award trivia points.

To close a night, use the SQL editor:

```sql
update public.sessions set active=false where id='REPLACE_WITH_SESSION_UUID'::uuid;
```

New requests, votes, game answers and introductions stop; social snapshots become unavailable. Close an open game round from the host dashboard **before** closing the night so guests can see final results. Reopen only deliberately, or insert a fresh session for the next night:

```sql
insert into public.sessions(venue_id,name)
values('REPLACE_WITH_VENUE_UUID'::uuid,'Friday night · DJ Nova');
```

Rotate admission links when necessary:

```sql
update public.venue_tables set qr_token=gen_random_uuid()
where id='REPLACE_WITH_TABLE_UUID'::uuid returning label,qr_token;
```

Print fresh codes afterward. Rotation prevents future joins with the old token; it does not revoke existing memberships.

## 5. Public pilot checks

Complete the live acceptance checks in `VERIFICATION.md` with two real devices and staff credentials. Confirm CAPTCHA enforcement on Supabase's Auth endpoint, not just widget appearance. Configure host/edge request limits and Supabase Auth limits; the app's per-identity quotas cannot stop someone creating new identities. Assign a staff contact for inappropriate introductions and consider whether to enable the introductions feature for your venue's audience. This build has guest blocking but no dedicated reporting queue; do not promise in-app report handling.

Use Supabase backups/PITR appropriate to the venue's needs and take a backup before migrations. Apply migrations to staging before production; they are additive, with no automatic rollback script. Rolling back only the UI leaves new schema/data intact. Set a retention policy for anonymous Auth accounts, memberships, profiles, blocks, invitations and game answers; respect foreign-key dependencies when deleting. Monitor Auth failures, database load and Realtime errors. Social refreshes are private per-guest RPC calls, so measure load as your venue grows.

## References

- [Next standalone output](https://nextjs.org/docs/app/api-reference/next-config-js/output)
- [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)
- [Supabase anonymous identities](https://supabase.com/docs/guides/auth/auth-anonymous)
