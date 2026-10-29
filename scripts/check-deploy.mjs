const issues = [];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
try {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    ["localhost", "127.0.0.1"].includes(u.hostname)
  )
    issues.push("Use a reachable HTTPS Supabase URL for public deployment.");
} catch {
  issues.push(
    "NEXT_PUBLIC_SUPABASE_URL must be set to your Supabase project URL.",
  );
}
if (!key || key === "replace-with-local-anon-key")
  issues.push("Set your Supabase public anon/publishable key.");
if (key?.startsWith("sb_secret_"))
  issues.push("A secret Supabase key must never be used as a public key.");
if (key?.split(".").length === 3) {
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (payload.role !== "anon")
      issues.push("Use an anon/public key, never a service-role key.");
  } catch {
    issues.push("Malformed JWT-format public key.");
  }
}
if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  issues.push(
    "Set a Turnstile site key and enable its matching secret in Supabase Auth before public guest sign-ins.",
  );
if (issues.length) {
  for (const issue of issues) console.error(issue);
  process.exitCode = 1;
} else
  console.log(
    "Deployment environment shape checked. This does not verify Auth CAPTCHA settings, migrations, database connectivity, or Realtime. Run the live acceptance checklist too.",
  );
