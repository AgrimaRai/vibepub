# Verification record

Updated 29 October 2026. The VibePub Supabase project is now connected. Both database migrations and a fresh venue/session were applied through the Supabase SQL Editor with user approval, and anonymous guest Auth was enabled. The web app has now been published at https://vibepub-live-night.truekrill4096.chatgpt.site with public access. A CAPTCHA provider is still unconfigured.

## Hosted Supabase integration verified

Live checks against the connected project passed for:

- Three distinct anonymous Auth sessions and JWT verification through the Next.js mutation API.
- Table and pub entrance admission into the same active session with correct team assignments.
- Authenticated Realtime request INSERT delivery to a separate joined guest, and an UPDATE event when a vote changed.
- Two guest votes, duplicate-vote idempotency, and persisted vote state read by a fresh authenticated client.
- RLS hiding requests from an unjoined guest and rejecting unauthorized voting, direct vote-count edits, answer-key reads and guest hosting.
- Social mutual opt-in, private invitation acceptance and removal of visibility/invitations on opt-out. Test profiles were hidden afterward.
- The browser joined the real venue, saw the persisted tracks, cast a real vote and displayed the authoritative count. Reloading restored the same guest and the saved voted state/count.

A subscription startup race was found during integration: channel join confirmation can precede the PostgreSQL feed acknowledgement. The app now refetches again when the PostgreSQL system acknowledgement arrives and only then displays “Live updates.” The repeated live INSERT test passed after waiting for that acknowledgement.

The SQL Editor setup does not populate Supabase CLI migration history. Before using CLI `db push` for this already-provisioned project, baseline **both** applied versions (`202610280001` and `202610290001`) with `supabase migration repair ... --status applied`; do not rerun either creation migration over existing tables.

## Executed successfully

- **31 automated tests passed, zero failures.** Tests cover the original song slice plus games, introductions, body-size enforcement and production-environment preflight behavior.
- Core PostgreSQL rules: invalid QR admission, first-team retention, foreign-venue isolation, denied direct writes, duplicate vote idempotency, authoritative vote counts, duplicate/empty tracks, five-request quota and ended sessions.
- Games: non-staff cannot host/close rounds or fetch QR tokens, guests cannot self-assign staff, answer keys are unreadable, only one round can be open, SQL validates options/correct answers, a response locks once, guests cannot read another guest's answer, open results/points stay hidden, closed results and table scores are correct, polls do not award trivia points, ended sessions reject new rounds.
- Introductions: hidden by default, both guests must opt in, profile text is bounded, social tables cannot be read directly, only the invitation recipient can accept, duplicate/reverse invitations are rejected, unrelated staff cannot see a guest social snapshot, opting out removes visibility and revokes accepted invitations, blocking filters both directions, and ending the session blocks snapshots/profile writes.
- API/validation: unauthenticated, malformed and invalid writes are rejected before database calls. The body limit checks actual bytes, including multi-byte UTF-8 and streamed bodies without a Content-Length header.
- Deployment preflight: missing configuration and obvious secret-key misuse are rejected; credentials are not echoed; valid-shaped public settings are explicitly reported as unverified integration configuration.
- `npm run typecheck`: strict TypeScript and generated Next route types passed.
- `npm run build`: production build and standalone asset-copy step passed.
- `npm start`: standalone production server started. The current local verification server used port 3001 because another project occupies port 3000; the public HTTPS URL is the primary guest entry point.
- HTTP smoke checks: `/api/health` returned HTTP 200 with `status: preview` and `databaseConnection: not-probed`; `/api/actions` returned setup-required HTTP 503 without Supabase configuration; `/host` returned HTTP 200.
- `npm run deploy:check` with no project settings failed as intended, identifying missing Supabase values and the Turnstile site key.
- Production browser preview: trivia answer locked, correct answer/result revealed, table received ten points, a crowd poll accepted a choice without removing trivia points. Introduction preferences started hidden, opt-in showed the labeled sample guest, an invitation appeared pending, hiding removed the directory, and blocking removed the sample guest/invitation.
- Responsive checks at 390px and 1280px: document width matched viewport width after fixing a checkbox layout issue. Current screenshots are `outputs/vibepub-games.jpg` and `outputs/vibepub-introductions.jpg`.
- The original local QR-generation command was executed successfully. Physical phone scanning has not been tested.

The automated database tests execute the actual migrations/seed in PGlite using PostgreSQL roles and RLS, mocking the Supabase `auth.users` table and `auth.uid()`. Logical replication statements are omitted because PGlite does not provide the Supabase Realtime service. These are database authorization/business-rule tests, not concurrency stress or hosted integration tests.

## Public deployment and scanner verification

- Sites version 1 was published successfully with public access at https://vibepub-live-night.truekrill4096.chatgpt.site. Published source SHA: `1157de70e32db1161d41dc1d79a913e22024ce6a`.
- Cookie-free HTTP requests to `/`, `/scan` and `/api/health` returned HTTP 200 on the public origin without redirecting to a login screen. Health reported `configured` and explicitly did not probe database connectivity.
- A fresh public-origin browser session joined the Pub floor team using real Supabase Auth and the hosted mutation API, loaded the saved leaderboard and successfully saved a vote.
- The local scanner decoded an uploaded table QR and navigated to the correct table. The hosted scanner decoded the new public entrance QR and navigated to the correct HTTPS venue route while preserving the saved vote.
- All three delivered public QR PNGs (entrance, table 07, table 12) were decoded programmatically and their exact destination URLs verified.
- Scanner tests reject unsupported/malformed QR payloads and confirm generated QR pixel decoding using the same library as the browser scanner. Decoded tokens always navigate within the app, not to the scanned URL's host.
- The deployed scanner's 390px layout had no horizontal overflow. Camera access remains a deliberate user action; no physical camera stream, iOS permission flow or Android hardware camera was tested here.
- Canonical Next.js tests/typecheck/build passed. Sites/Vinext build and local adapter guest admission also passed. The Sites preview server was stopped after publication.

## Remaining unverified integrations

No permanent staff credentials or CAPTCHA provider were configured. Staff password login and a real hosted host-to-guest game round remain unverified (database game authorization/scoring are covered by the automated PostgreSQL tests). Phone scanning, distinct physical devices, CAPTCHA enforcement, Docker image execution and GitHub Actions execution remain unverified. Docker socket access was unavailable; equivalent Next standalone build/start were executed. The generated Sites domain was published successfully; no custom domain was purchased or configured. The live checks used separate authenticated clients, not separate physical devices.

Historical local preview checks recorded above are separate from the hosted integration results above. The health endpoint now reports `configured`, not `preview`; it still does not probe database connectivity itself.

## Live acceptance after configuration

1. Apply both migrations, enable anonymous Auth and configure Turnstile in both the app and Supabase Auth. Confirm new guest admission and staff password login work, including after CAPTCHA expiry or a failed challenge. Confirm Supabase rejects missing/invalid CAPTCHA tokens on new sign-ins.
2. Provision a permanent staff account and a venue assignment. Verify `/host` lists only assigned venues and a guest/foreign staff account cannot launch or close rounds or list QR tokens, even through direct RPC.
3. Join table 07 on device A and the entrance/Pub floor on device B. Confirm different Auth user identities, correct team labels and the same active session.
4. Request a track on A, verify B sees it without reloading, vote from both and confirm two votes. Repeat one vote and confirm the count does not change. Reload both devices to verify persistence. Confirm duplicate tracks and a sixth request are rejected.
5. Start trivia in the staff dashboard. Both guests should see the round. Submit different answers, verify each is locked and cannot be read by the other guest. Confirm correct keys and results cannot be fetched while open. Close the round and check results/table scores. Run a poll and confirm it adds no points.
6. Leave both profiles hidden: neither should appear. Opt in on A alone: B remains unavailable. Opt in on B: both should appear. Invite A→B, verify only B can accept/decline and unrelated guests cannot see the invitation. Accept, then hide B and confirm A's next social snapshot loses the profile/invitation. Re-enable and test blocking symmetrically. Verify another venue cannot see either profile.
7. Disable/re-enable network and check song and game subscription recovery. End the night and confirm new songs/votes/answers/intros stop and social snapshots become unavailable. Previous members may read the final song/game board.
8. Download an entrance QR and table QR from the real staff dashboard. Scan on actual iOS and Android devices using the deployed HTTPS domain. Verify assets, route links, mobile layout, keyboard navigation and basic accessibility. Anyone with a shared QR can join remotely; this is not proof of physical presence.
9. Confirm operational ownership for moderation, IP/Auth rate limits, backups, retention, alerts and credential handling using `DEPLOYMENT.md`. Do not enable introductions for a public audience while promising report-handling tools that are not implemented.


## Verified profiles release

See PROFILE-RELEASE-VERIFICATION.md for the third migration, 32 passing tests, live email confirmation, saved profile/photo observation and remaining public email/staff setup. This supersedes the older anonymous introductions description above.
