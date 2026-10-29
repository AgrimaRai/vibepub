"use client";
import { useCallback, useEffect, useState } from "react";
import { Trophy, Brain, BarChart3, Check } from "lucide-react";
import { browserDb } from "@/lib/supabase";
import { act } from "@/lib/actions";
type Round = {
  id: string;
  kind: "trivia" | "poll";
  question: string;
  options: string[];
  state: "open" | "closed";
};
type Result = { correct: number | null; counts: number[] };
const sample: Round = {
  id: "demo-trivia",
  kind: "trivia",
  question: "Which band released “Bohemian Rhapsody”?",
  options: ["Queen", "ABBA", "The Beatles", "Pink Floyd"],
  state: "open",
};
export function Games({ session, demo }: { session: string; demo: boolean }) {
  const [rounds, setRounds] = useState<Round[]>(demo ? [sample] : []);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [scores, setScores] = useState<{ label: string; points: number }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const db = browserDb();
    const [r, a, s] = await Promise.all([
      db
        .from("game_rounds")
        .select("id,kind,question,options,state")
        .eq("session_id", session)
        .order("created_at", { ascending: false })
        .limit(12),
      db.from("game_answers").select("round_id,choice"),
      db.rpc("table_scores", { p_session: session }),
    ]);
    if (r.error || a.error || s.error)
      throw new Error("Could not load the games. Please retry.");
    const list = r.data as Round[];
    const closed = await Promise.all(
      list
        .filter((r) => r.state === "closed")
        .map(async (r) => {
          const result = await db.rpc("game_results", { p_round: r.id });
          if (result.error) throw new Error("Could not load results.");
          return [r.id, result.data] as const;
        }),
    );
    setRounds(list);
    setAnswers(
      Object.fromEntries((a.data || []).map((a) => [a.round_id, a.choice])),
    );
    setScores(s.data || []);
    setResults(Object.fromEntries(closed));
    setError("");
  }, [session]);
  useEffect(() => {
    if (demo) return;
    let active = true;
    const sync = () =>
      void refresh().catch((e) => {
        if (active) setError(e.message);
      });
    sync();
    const timer = setInterval(sync, 8000);
    const channel = browserDb()
      .channel(`games:${session}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_rounds",
          filter: `session_id=eq.${session}`,
        },
        sync,
      )
      .on("system", {}, (payload) => {
        if (payload.extension === "postgres_changes" && payload.status === "ok")
          sync();
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") sync();
      });
    return () => {
      active = false;
      clearInterval(timer);
      void browserDb().removeChannel(channel);
    };
  }, [demo, session, refresh]);
  async function answer(round: string, choice: number) {
    if (busy || answers[round] !== undefined) return;
    setBusy(true);
    setError("");
    try {
      if (demo) setAnswers((a) => ({ ...a, [round]: choice }));
      else {
        await act({ action: "answer", round, choice });
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send answer.");
    } finally {
      setBusy(false);
    }
  }
  function demoNext() {
    const r = rounds[0];
    if (r.state === "open") {
      setRounds([{ ...r, state: "closed" }]);
      setResults({
        [r.id]: {
          correct: r.kind === "trivia" ? 0 : null,
          counts: r.options.map((_, i) => (i === answers[r.id] ? 1 : 0)),
        },
      });
      if (r.kind === "trivia")
        setScores(answers[r.id] === 0 ? [{ label: "07", points: 10 }] : []);
    } else if (r.kind === "poll") {
      setRounds([sample]);
      setAnswers({});
      setResults({});
      setScores([]);
    } else
      setRounds([
        {
          id: "demo-poll",
          kind: "poll",
          question: "What should the DJ play next?",
          options: [
            "Disco classics",
            "Indie anthems",
            "House music",
            "Pop favorites",
          ],
          state: "open",
        },
      ]);
  }
  return (
    <section aria-label="Pub games" className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">A little friendly competition.</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Trivia earns 10 points per correct answer for your table. Crowd
            polls let everyone have a say.
          </p>
        </div>
        <Trophy className="shrink-0 text-[#c2ff65]" />
      </div>
      {demo && (
        <p className="text-sm text-amber-200">
          Local game preview · only your answers count here.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {!rounds.length && (
        <p className="rounded-2xl border border-white/10 p-8 text-zinc-400">
          No rounds yet. Your host can launch trivia or a crowd poll from the
          staff dashboard.
        </p>
      )}
      {rounds.map((r) => (
        <article
          key={r.id}
          className="rounded-2xl border border-white/10 bg-[#19191e] p-5 sm:p-7"
        >
          <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#c2ff65]">
            {r.kind === "trivia" ? (
              <Brain size={16} />
            ) : (
              <BarChart3 size={16} />
            )}{" "}
            {r.kind} · {r.state === "open" ? "Accepting answers" : "Results"}
          </p>
          <h3 className="mb-5 text-xl font-bold">{r.question}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {r.options.map((o, i) => (
              <button
                key={i}
                disabled={
                  busy || r.state === "closed" || answers[r.id] !== undefined
                }
                aria-pressed={answers[r.id] === i}
                onClick={() => answer(r.id, i)}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border p-4 text-left ${answers[r.id] === i ? "border-[#c2ff65] bg-[#c2ff65]/10" : "border-white/15"}`}
              >
                <span>
                  {o}
                  {results[r.id]?.correct === i && (
                    <span className="ml-2 text-xs text-[#c2ff65]">Correct</span>
                  )}
                </span>
                {results[r.id] ? (
                  <span className="text-sm text-zinc-400">
                    {results[r.id].counts[i]} votes
                  </span>
                ) : answers[r.id] === i ? (
                  <Check size={18} />
                ) : null}
              </button>
            ))}
          </div>
          {answers[r.id] !== undefined && r.state === "open" && (
            <p role="status" className="mt-4 text-sm text-[#c2ff65]">
              Answer locked in. Results appear when the host closes the round.
            </p>
          )}
        </article>
      ))}
      {demo && (
        <button
          className="rounded-xl border border-[#c2ff65]/40 px-5 py-3 text-sm text-[#c2ff65]"
          onClick={demoNext}
        >
          {rounds[0].state === "open"
            ? "Reveal demo results"
            : "Try another demo round"}
        </button>
      )}
      <aside className="rounded-2xl border border-white/10 p-5">
        <h3 className="font-bold">Table standings</h3>
        {!scores.length ? (
          <p className="mt-3 text-sm text-zinc-400">
            Points appear after a trivia round closes.
          </p>
        ) : (
          scores.map((s, i) => (
            <p key={s.label} className="mt-3 flex justify-between text-sm">
              <span>
                {i + 1}.{" "}
                {s.label === "Pub floor" ? "Pub floor" : `Table ${s.label}`}
              </span>
              <span className="text-[#c2ff65]">{s.points} pts</span>
            </p>
          ))
        )}
      </aside>
    </section>
  );
}
