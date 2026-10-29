# Verified profiles and guest safety

Songs and games use anonymous guest accounts. Social introductions require a Supabase account with a confirmed email and `is_anonymous = false`, checked in `auth.users` by database functions. An inbox verification is not proof of identity.

## Setup

Apply migrations in filename order. The third migration deliberately hides old profiles and closes old invitations; users must opt in under the new verified account rules. It does not remove songs or game history.

In Supabase Authentication → Sign In / Providers, keep Confirm email enabled and enable Allow manual linking for anonymous-to-email upgrades. In Emails, include `{{ .Token }}` in Confirm sign up, Magic link or OTP, and Change email address templates. The app accepts codes and Supabase verification-link sessions. Set the Supabase Site URL to your deployed HTTPS origin for default email templates. Template editing on the current free project is locked until custom SMTP or an eligible plan is configured. Configure custom SMTP for public sign-in; Supabase's default mail service can restrict recipients and delivery volume. Keep authentication rate limits and configure CAPTCHA keys in both Supabase and the app before enabling CAPTCHA enforcement.

## Data and access

- `guest_profiles`: per-night name (2–50 characters), description (up to 240), opt-in and heartbeat. No email is returned in social responses.
- `profile_photos`: private JPEG bytes (up to 128 KB) with a revision ID. No public storage bucket, public image URLs or service-role key. `/api/profile-photo` verifies the bearer session and uses caller-scoped database functions. Authenticated image responses use no-store. Input photos are cropped and re-encoded by the browser to remove original metadata; JPEG/PNG/WebP under 5 MB accepted.
- `social_reports`: private reasons/details, accessible only through a venue-staff inbox function. Reporting also blocks the guest immediately. Reports do not automatically suspend users.
- `social_suspensions`: venue-session suspension controlled by assigned staff. Suspension hides profiles and revokes invitations. Restoring does not opt users back in.

The active directory includes verified, opted-in, unblocked members of the same active venue session with activity in the last two minutes. Heartbeats run every 45 seconds while the People section is visible. Leaving the section clears presence on a best-effort basis; the timeout covers abrupt disconnects. This indicates app activity, not physical location. A shared QR link can be used remotely; physical presence verification is not implemented.

Both people must opt in before introductions. Invitations are limited to ten per sender per session, only the recipient may accept, and either person can close them. Blocks are symmetric for visibility and introductions. Hiding revokes invitations. There is no private chat or phone/email sharing.

## Account lifecycle

New guests use `updateUser({email})` and `verifyOtp` with `email_change`; a confirmed upgrade preserves the UID and guest history. Existing accounts use `signInWithOtp` and `verifyOtp` with `email`. Switching accounts does not merge history. The room rejoins the QR session for the signed-in UID.

Account deletion requires recent sign-in (15 minutes), a typed confirmation, and is denied for staff accounts. It deletes the auth account, profile/photo, memberships, votes, game answers and introductions; song requests remain with a null requester. Report text is retained for moderation with deleted account references nulled. Staff removal must be handled by an administrator first. Existing viewed images cannot be recalled from another person's device.

## Local verification

`npm test` includes PGlite database tests against all migrations. These use synthetic auth rows only inside an isolated local test database. Never insert fake verified users into production. The new integration test covers anonymous access denial, private photo permissions, activity timeout, reporting/blocking, staff moderation and deletion. Live email delivery, actual inbox code entry, two real accounts, staff credentials and mobile photo upload need separate live verification.
