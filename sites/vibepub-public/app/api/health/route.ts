export const dynamic = "force-dynamic";
export function GET() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return Response.json(
    {
      status: configured ? "configured" : "preview",
      databaseConnection: "not-probed",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
