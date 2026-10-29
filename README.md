# VibePub

A mobile-first Next.js 16 / TypeScript / Tailwind / Supabase app for a pub's live soundtrack, games and opt-in introductions.

See [verified profile setup and privacy](docs/VERIFIED-PROFILES.md) and [release verification](docs/PROFILE-RELEASE-VERIFICATION.md).

## Included

- Table and pub entrance QR admission with persistent anonymous Supabase Auth.
- Song requests, one vote per guest/track, Realtime board, five requests per guest/night.
- Host-run trivia and crowd polls; locked answers, server-side scoring and table standings.
- Private answer keys; results revealed only after staff close a round.
- Verified email accounts for introductions, private profile photos, names/descriptions, opt-in active guests, private invitations, hide, block/report, staff moderation and account deletion.
- Staff password sign-in, venue-scoped game controls, downloadable join QR images.
- Optional Turnstile integration for guest and staff Auth; bounded/validated API payloads.
- RLS migrations, local seed, automated database tests, CI workflow, standalone Docker deployment and environment preflight.

## Public site and QR scanner

VibePub is published at https://vibepub-live-night.truekrill4096.chatgpt.site with public access (no ChatGPT account required). The built-in camera/image scanner is at `/scan`. The QR images in `outputs/VibePub-Public-QR-Codes.zip` point to this HTTPS deployment, not localhost.

The public deployment uses the Sites/Vinext Cloudflare adapter in `sites/vibepub-public`; the canonical Next.js project remains in `src`. Both use the existing Supabase backend. The adapter preserves Sites build/Worker integration and the app's guest JWT/RLS security. Environment values are managed in Sites runtime settings and local ignored build configuration, never in the hosting manifest. Changes to public build-time values require rebuilding and publishing.

The scanner uses on-device decoding, rear-camera preference, start/stop controls, permission/error handling, QR image upload and manual link entry. It stops camera tracks on navigation/backgrounding and never follows arbitrary QR hosts: valid tokens are routed to this app's own join page. Physical camera scanning still needs a real phone test. An ordinary phone Camera app can also open the printed QR directly.

See `outputs/PUBLIC-LAUNCH.md` for guest instructions and `docs/VERIFICATION.md` for exact tests and remaining setup.

## Preview

Requires Node 22+ and npm. From this folder:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. With no Supabase environment variables, this is a clearly labeled offline preview. Try **Pub games** (trivia, reveal result, then crowd poll) and **Meet the crowd** (opt in and send a simulated invitation). No real messages, multiplayer sync or persistent data exists in preview mode. Sample scores and guests are labeled. A real join URL never silently falls back to preview.

## Local Supabase

Install and start Docker Desktop first:

```sh
npx supabase start
npx supabase db reset
npx supabase status
cp .env.example .env.local
```

`db reset` destroys the disposable **local** database and recreates it with all three migrations and seed. Copy the local API URL and anon key from `supabase status` into `.env.local`. Leave the Turnstile key empty for local testing. Restart Next:

```sh
npm run dev
```

Seeded join links:

- Table 07: http://localhost:3000/join/70000000-0000-4000-8000-000000000007
- Table 12: http://localhost:3000/join/70000000-0000-4000-8000-000000000012
- Pub entrance / bar: http://localhost:3000/join/70000000-0000-4000-8000-000000000000

All three join the same night. Entrance guests belong to the **Pub floor** team. The first team assignment remains for that Auth user during the session. Use separate normal/private browser contexts to simulate guests.

## Connect a hosted project or upgrade an existing deployment

1. Create/select a Supabase project. Enable anonymous sign-ins and set Auth's site URL to the HTTPS app origin.
2. Apply migrations through the CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

For a database already created using the original migration in SQL Editor, first baseline that migration in the CLI history with `npx supabase migration repair 202610280001 --status applied`, **only if its schema already exists**, then push. Alternatively, apply only `supabase/migrations/202610290001_games_social.sql` in SQL Editor after the original migration. Never rerun the original table creation SQL over an existing schema.

3. Set the project's API URL and **public** publishable/anon key in `.env.local`. Never use a service-role/secret key in any `NEXT_PUBLIC_*` variable. Public variables are included in the browser at build time; rebuild when they change.
4. Configure Turnstile for a public launch: create a Cloudflare site key for your deployment hostname, put the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and configure the corresponding **secret in Supabase Auth's CAPTCHA settings**. The secret belongs in Supabase, not this app. Test both guest sign-in and staff password sign-in. The CAPTCHA widget appears before a new anonymous account is created; existing guest sessions can reconnect without a new challenge.
5. Create venue/table/session records and staff access as described in `docs/DEPLOYMENT.md`. Do not run development seed SQL on a real venue. If upgrading an existing venue, add a shared `Pub floor` table record with a fresh random token; the original fixed seed token is not used in production.
6. Restart the app, then follow `docs/VERIFICATION.md` to verify real Auth, games, privacy rules and Realtime delivery.

## Staff dashboard

Create a permanent staff user through the Supabase Auth admin dashboard and assign its `auth.users.id` to a venue in `public.venue_staff` as the database administrator. No guest can assign staff permissions. Setup SQL is in `docs/DEPLOYMENT.md`.

Visit `/host` and sign in with that account. If this browser already has a guest session, sign out on the host screen first. Staff sign-in replaces that browser's guest session; use a separate browser/profile for staff operations and QR guest testing. The dashboard lists assigned active sessions, launches/closes trivia or polls, and produces printable table/pub QR images. Only staff assigned to that venue can perform these operations, including through direct RPC calls.

## QR generator

```sh
npm run qr -- https://YOUR_APP_HOST ACTUAL_TABLE_OR_ENTRANCE_TOKEN
```

PNG output goes in `outputs/`. The host dashboard also downloads QR PNGs. A localhost QR cannot connect someone else's phone. Public guests need an HTTPS app URL and a network-reachable Supabase project. The app does not require guests to join the pub's Wi-Fi; cellular data works too.

## Verify and deploy

```sh
npm test
npm run typecheck
npm run build
npm start
```

```sh
npm run deploy:check
```

Use `npm run build:production` for a public deployment; it runs that preflight before the normal build. The environment preflight reads `.env.local` and checks public deployment values without printing credentials. It cannot verify Auth CAPTCHA settings or database connectivity. See `docs/DEPLOYMENT.md` for exact Vercel and Docker steps, migration/backup guidance, provisioning SQL and the public-pilot checklist.

## Structure

- `src/app`: guest/host routes, authenticated mutation endpoint, lightweight health endpoint.
- `src/components`: room, games, introductions, staff dashboard, QR join form and CAPTCHA.
- `src/lib`: validated payloads, shared authenticated actions, body limit and Supabase client.
- `supabase/migrations`: core RLS schema, games/scoring, staff and introductions.
- `tests`: validation, bounded HTTP bodies, PostgreSQL role/RLS and business-rule coverage.
- `docs`: architecture, deployment and verification status.
- `.github/workflows/ci.yml`: install, tests, typecheck and build on push/PR.

## Current limits

Anonymous identity is per browser, not proof of one human or physical presence. Anyone with a QR link can join remotely, and clearing browser storage creates a new identity. CAPTCHA, Supabase Auth rate limits, database quotas and venue moderation all matter for a public pilot.

Introductions are opt-in and scoped to an active night. Hiding revokes current invitations; blocking is symmetric and lasts for that session, with no unblock UI yet. An accepted introduction does not open private messaging or reveal contact information or table location. Profiles remain in the database until the administrator's retention process removes them, and clients may already have seen information voluntarily shared before it was hidden. Social lists refresh every eight seconds; they are not a live presence indicator.

Trivia and polls are hosted text-based rounds, not audio-identification games. Hosts manually close rounds; there is no timed-round engine. Games use Realtime round-change notifications plus an eight-second reconciliation refresh. Social snapshots use authenticated eight-second polling and are not broadcast publicly. Owner onboarding, billing, a full DJ moderation queue, reporting/moderation tooling for introductions, rewards and music playback are not implemented. The public Sites deployment is live; Vercel/Docker remain alternative deployment paths and their containers/accounts have not been deployed here.
