"use client";
import { Moderation } from "./moderation";
import { useCallback, useEffect, useState } from "react";
import { browserDb, configured } from "@/lib/supabase";
import { act } from "@/lib/actions";
import { Captcha } from "./captcha";
import QRCode from "qrcode";
type Night = { id: string; name: string };
type LiveRound = { id: string; question: string; kind: string };
function LinkCard({ label, token }: { label: string; token: string }) {
  const [image, setImage] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const link = new URL(`/join/${token}`, window.location.origin).href;
    setUrl(link);
    void QRCode.toDataURL(link, { width: 300, margin: 3 }).then(setImage);
  }, [token]);
  return (
    <article className="rounded-xl border border-white/10 p-4">
      <h3 className="mb-3 font-bold">
        {label === "Pub floor" ? "Pub entrance / bar" : `Table ${label}`}
      </h3>
      {image && (
        <a href={image} download={`vibepub-${label}.png`}>
          <img
            src={image}
            alt={`Download QR code for ${label}`}
            className="mb-3 size-40 rounded-lg"
          />
        </a>
      )}
      <a href={url} className="break-all text-xs text-[#c2ff65] underline">
        {url}
      </a>
      <p className="mt-2 text-xs text-zinc-400">
        Tap the QR image to download and print.
      </p>
    </article>
  );
}
export function Host() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState("");
  const [nights, setNights] = useState<Night[]>([]);
  const [session, setSession] = useState("");
  const [round, setRound] = useState<LiveRound | null>(null);
  const [links, setLinks] = useState<{ label: string; token: string }[]>([]);
  const [kind, setKind] = useState<"trivia" | "poll">("trivia");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const load = useCallback(async () => {
    const db = browserDb();
    const {
      data: { session },
    } = await db.auth.getSession();
    setAccount(session?.user.email || (session ? "Anonymous guest" : ""));
    if (!session) {
      setNights([]);
      return;
    }
    const { data, error } = await db
      .from("sessions")
      .select("id,name")
      .eq("active", true);
    if (error) throw new Error("Could not load venues.");
    const permitted = await Promise.all(
      (data || []).map(async (n) => {
        const s = await db.rpc("is_staff", { p_session: n.id });
        if (s.error)
          throw new Error(
            "Staff configuration unavailable. Apply the latest migration.",
          );
        return s.data ? n : null;
      }),
    );
    const list = permitted.filter((n): n is Night => n !== null);
    setNights(list);
    setSession((s) => (list.some((n) => n.id === s) ? s : list[0]?.id || ""));
  }, []);
  useEffect(() => {
    if (configured) void load().catch((e) => setError(e.message));
  }, [load]);
  const refresh = useCallback(async () => {
    if (!session) return;
    const db = browserDb();
    const [r, l] = await Promise.all([
      db
        .from("game_rounds")
        .select("id,question,kind")
        .eq("session_id", session)
        .eq("state", "open")
        .maybeSingle(),
      db.rpc("venue_links", { p_session: session }),
    ]);
    if (r.error || l.error) throw new Error("Could not load this session.");
    setRound(r.data);
    setLinks(l.data || []);
  }, [session]);
  useEffect(() => {
    if (!session) {
      setRound(null);
      setLinks([]);
      return;
    }
    let active = true;
    const sync = () =>
      void refresh().catch((e) => {
        if (active) setError(e.message);
      });
    sync();
    const timer = setInterval(sync, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session, refresh]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await browserDb().auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: captchaToken || undefined },
      });
      if (error)
        throw new Error("Sign-in failed. Check your credentials and CAPTCHA.");
      setPassword("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const clean = options.map((o) => o.trim()).filter(Boolean);
      if (
        kind === "trivia" &&
        (!options[correct].trim() ||
          options.slice(0, correct).some((o) => !o.trim()))
      )
        throw new Error(
          "Fill options in order and choose a non-empty correct answer.",
        );
      await act({
        action: "host",
        session,
        kind,
        question,
        options: clean,
        correct: kind === "trivia" ? correct : null,
      });
      setQuestion("");
      setOptions(["", "", "", ""]);
      setCorrect(0);
      await refresh();
      setNotice("Round is open for your guests.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start round.");
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (!round) return;
    setBusy(true);
    setError("");
    try {
      await act({ action: "close", round: round.id });
      await refresh();
      setNotice(
        "Round closed. Guests can see the results and updated table scores.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to close round.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <a href="/" className="font-black text-[#c2ff65]">
          ← VibePub
        </a>
        <span className="text-sm text-zinc-400">Venue staff</span>
      </header>
      <h1 className="text-4xl font-black">Host the night.</h1>
      <p className="mt-3 text-zinc-400">
        Run trivia, launch crowd polls, and share your pub’s join codes.
      </p>
      {!configured ? (
        <div className="my-8 rounded-2xl border border-white/10 p-6">
          <h2 className="font-bold">
            Connect Supabase to manage a real venue.
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Staff sign-in requires a permanent account and a venue assignment.
            The home page has interactive game and introduction previews.
          </p>
          <a href="/" className="mt-5 inline-block text-[#c2ff65] underline">
            Back to preview
          </a>
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="mt-5 text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-5 text-[#c2ff65]">
              {notice}
            </p>
          )}
          {account ? (
            <div className="my-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
              <span className="text-sm">Signed in as {account}</span>
              <button
                disabled={busy}
                className="text-sm underline"
                onClick={async () => {
                  const { error } = await browserDb().auth.signOut();
                  if (error) {
                    setError("Sign out failed.");
                    return;
                  }
                  setAccount("");
                  setNights([]);
                  setSession("");
                  setRound(null);
                  setLinks([]);
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <form
              onSubmit={login}
              className="my-8 max-w-md space-y-4 rounded-2xl border border-white/10 p-5"
            >
              <label className="block text-sm">
                Staff email
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2"
                />
              </label>
              <label className="block text-sm">
                Password
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2"
                />
              </label>
              <Captcha onToken={setCaptchaToken} />
              <button
                disabled={busy}
                className="rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black"
              >
                Sign in
              </button>
            </form>
          )}
          {account && !nights.length && (
            <p className="my-6 text-sm text-zinc-400">
              No active staff sessions found. Use your staff account, and ask
              the venue administrator to assign it in venue_staff and open a
              session.
            </p>
          )}
          {!!nights.length && (
            <>
              <label className="my-6 block text-sm">
                Active venue session
                <select
                  value={session}
                  onChange={(e) => {
                    setRound(null);
                    setLinks([]);
                    setSession(e.target.value);
                  }}
                  className="mt-2 block w-full rounded-xl border border-white/20 bg-[#19191e] p-4"
                >
                  {nights.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>
              {round ? (
                <section className="rounded-2xl border border-[#c2ff65]/30 bg-[#19191e] p-6">
                  <p className="text-sm text-[#c2ff65]">LIVE · {round.kind}</p>
                  <h2 className="mt-3 text-2xl font-bold">{round.question}</h2>
                  <button
                    disabled={busy}
                    onClick={close}
                    className="mt-5 rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black"
                  >
                    Close round & reveal results
                  </button>
                </section>
              ) : (
                <form
                  onSubmit={start}
                  className="space-y-4 rounded-2xl border border-white/10 bg-[#19191e] p-5"
                >
                  <h2 className="text-xl font-bold">Start a round</h2>
                  <label className="block text-sm">
                    Game
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as typeof kind)}
                      className="ml-3 rounded-lg border border-white/20 bg-[#19191e] p-3"
                    >
                      <option value="trivia">Trivia</option>
                      <option value="poll">Crowd poll</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    Question
                    <input
                      required
                      maxLength={200}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      className="mt-2"
                    />
                  </label>
                  {options.map((o, i) => (
                    <label key={i} className="block text-sm">
                      Option {i + 1}
                      {i > 1 ? " (optional)" : ""}
                      <input
                        required={i < 2}
                        maxLength={80}
                        value={o}
                        onChange={(e) =>
                          setOptions((v) =>
                            v.map((x, j) => (i === j ? e.target.value : x)),
                          )
                        }
                        className="mt-2"
                      />
                    </label>
                  ))}
                  {kind === "trivia" && (
                    <label className="block text-sm">
                      Correct answer
                      <select
                        value={correct}
                        onChange={(e) => setCorrect(Number(e.target.value))}
                        className="ml-3 rounded-lg border border-white/20 bg-[#19191e] p-3"
                      >
                        {options.map((_, i) => (
                          <option key={i} value={i}>
                            Option {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    disabled={busy}
                    className="rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black"
                  >
                    Launch round
                  </button>
                  <p className="text-xs text-zinc-400">
                    One open round per venue session. Guests lock one answer
                    each; closing reveals results.
                  </p>
                </form>
              )}
              <section className="mt-8">
                <h2 className="mb-4 text-2xl font-bold">
                  Get everyone connected.
                </h2>
                <p className="mb-4 text-sm text-zinc-400">
                  Put the entrance QR at the bar for guests without a table.
                  Table QRs keep trivia scores with their teams. Both join the
                  same night.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {links.map((l) => (
                    <LinkCard key={l.token} {...l} />
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    {session && <Moderation session={session}/>}
</main>
  );
}
