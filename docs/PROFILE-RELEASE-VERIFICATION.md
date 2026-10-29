# Verified profile release — 29 October 2026

Implemented: email upgrade/sign-in, optional private profile photo, display name and description, explicit discoverability, two-minute activity directory, reports with immediate blocking, venue staff moderation, close introduction, recent-sign-in account deletion.

Verified:
- `npm test`: 32 tests passed, including isolated PostgreSQL tests loading all three migrations and exercising verified social access, private photo permissions, activity expiry, reporting, staff suspension and deletion.
- `npm run typecheck`: passed.
- `npm run build`: canonical Next.js standalone build passed.
- Sites/Vinext adapter build passed, source pushed at `c070410eb77ccc0de367d47e7db1cb4a95ea378d`.
- Public Sites version 2 deployed successfully at https://vibepub-live-night.truekrill4096.chatgpt.site.
- Third migration applied to live Supabase with a successful SQL Editor result after explicit user approval.
- Manual linking enabled, Confirm email retained, Site URL set to the public HTTPS origin after explicit user approval.
- Browser verified live venue admission, persisted leaderboard, and new verified-only account gate.
- User-authorized test verification email request accepted by Supabase. The user confirmed receiving and opening the email. Supabase verification flags were confirmed: email verified, non-anonymous account, no pending email change. The original guest browser recognised the verified account and displayed its saved name, description, uploaded photo and opted-in active directory. The profile data was entered by the user, not fabricated by the agent.

Remaining live acceptance: two independently verified users see each other, invitation/report interaction and assigned staff moderation. Actual user-saved profile/photo display and email verification have been observed. Account deletion was tested only in an isolated local database. No real account was deleted. No staff account or custom SMTP provider was provisioned. Public email delivery remains limited by the Supabase default email service; connect custom SMTP for broader public sign-in. The current free project's dashboard locks custom email templates until custom SMTP or an eligible plan is configured, so default verification links remain supported alongside optional code entry. CAPTCHA provider is not configured.

Existing source PDFs predate this profile release; see VERIFIED-PROFILES.md for the current design and behavior.
