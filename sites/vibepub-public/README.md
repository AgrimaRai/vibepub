# VibePub public deployment

This is the Sites/Vinext Cloudflare deployment copy of the canonical Next.js app in the parent project. It uses the same Supabase backend and preserves the generated Sites build/worker integration.

Copy app/components/lib from the canonical src tree after changes, then build with the Sites helper and publish a new saved version. Public environment values live in Sites runtime settings; .env.local is ignored and is used only for local/build-time public-value substitution. Never add a service-role key.
