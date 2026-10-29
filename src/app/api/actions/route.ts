import { createClient } from "@supabase/supabase-js";
import { actionSchema } from "@/lib/validation";
import { limitedJson, PayloadTooLarge } from "@/lib/limited-json";
export async function POST(req: Request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return Response.json(
      { error: "Configure Supabase first." },
      { status: 503 },
    );
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  let body;
  try {
    body = actionSchema.safeParse(await limitedJson(req));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof PayloadTooLarge
            ? "Body too large."
            : "Invalid JSON body.",
      },
      { status: error instanceof PayloadTooLarge ? 413 : 400 },
    );
  }
  if (!body.success)
    return Response.json(
      { error: "Check your input. A required field is missing or invalid." },
      { status: 400 },
    );
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: user, error: authError } = await db.auth.getUser(token);
  if (authError || !user.user)
    return Response.json(
      { error: "Your session expired. Reload to reconnect." },
      { status: 401 },
    );
  const a = body.data;
  const result = await (() => {
    switch (a.action) {
      case "join":
        return db.rpc("join_table", { p_token: a.token });
      case "request":
        return db.rpc("request_song", {
          p_session: a.session,
          p_title: a.title,
          p_artist: a.artist,
        });
      case "vote":
        return db.rpc("vote_song", { p_request: a.request });
      case "host":
        return db.rpc("host_round", {
          p_session: a.session,
          p_kind: a.kind,
          p_question: a.question,
          p_options: a.options,
          p_correct: a.correct,
        });
      case "close":
        return db.rpc("close_round", { p_round: a.round });
      case "answer":
        return db.rpc("answer_round", { p_round: a.round, p_choice: a.choice });
      case "profile":
        return db.rpc("save_profile", {
          p_session: a.session,
          p_nickname: a.nickname,
          p_intro: a.intro,
          p_visible: a.visible,
        });
      case "introduce":
        return db.rpc("send_intro", { p_session: a.session, p_other: a.other });
      case "respond":
        return db.rpc("respond_intro", {
          p_id: a.invitation,
          p_accept: a.accept,
        });
      case "presence": return db.rpc("touch_presence", {p_session:a.session,p_active:a.active});
      case "cancel": return db.rpc("cancel_intro",{p_id:a.invitation});
      case "report": return db.rpc("report_guest",{p_session:a.session,p_other:a.other,p_reason:a.reason,p_details:a.details});
      case "moderate": return db.rpc("moderate_report",{p_report:a.report,p_action:a.decision});
      case "block":
        return db.rpc("block_guest", {
          p_session: a.session,
          p_other: a.other,
        });
    }
  })();
  if (result.error)
    return Response.json(
      {
        error:
          result.error.code === "P0001"
            ? result.error.message
            : "Unable to complete this action. Reconnect and try again.",
      },
      { status: 400 },
    );
  return Response.json(
    { data: result.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
