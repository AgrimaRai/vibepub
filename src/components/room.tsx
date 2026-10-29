"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Music2,
  Radio,
  Disc3,
  Plus,
  Check,
  QrCode,
  Headphones,
  X,
} from "lucide-react";
import { browserDb, configured } from "@/lib/supabase";
import { act } from "@/lib/actions";
import { Games } from "./games";
import { Social } from "./social";
import { JoinForm } from "./join-form";
import { Captcha, captchaSiteKey } from "./captcha";
type Track = {
  id: string;
  title: string;
  artist: string;
  votes: number;
  created_at: string;
};
type RoomInfo = { session: string; name: string; venue: string; table: string };
const samples: Track[] = [
  {
    id: "demo-1",
    title: "One More Time",
    artist: "Daft Punk",
    votes: 24,
    created_at: "1",
  },
  {
    id: "demo-2",
    title: "Blinding Lights",
    artist: "The Weeknd",
    votes: 19,
    created_at: "2",
  },
  {
    id: "demo-3",
    title: "Levitating",
    artist: "Dua Lipa",
    votes: 16,
    created_at: "3",
  },
  {
    id: "demo-4",
    title: "Midnight City",
    artist: "M83",
    votes: 12,
    created_at: "4",
  },
];
export function Room({ token }: { token?: string }) {
  const demo = !configured && !token;
  const [tracks, setTracks] = useState<Track[]>(demo ? samples : []);
  const [voted, setVoted] = useState<string[]>([]);
  const [info, setInfo] = useState<RoomInfo | null>(
    demo
      ? {
          session: "demo",
          venue: "The Midnight Social",
          table: "07",
          name: "After hours · DJ Nova",
        }
      : null,
  );
  const [status, setStatus] = useState(demo ? "Offline preview" : "Connecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [tab, setTab] = useState<"music" | "games" | "people">("music");
  const [captchaToken, setCaptchaToken] = useState("");
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const [authRevision,setAuthRevision]=useState(0);
  useEffect(()=>{if(demo||!configured)return;let id:string|undefined;const {data:{subscription}}=browserDb().auth.onAuthStateChange((_event,s)=>{if(s?.user.id!==id){id=s?.user.id;setAuthRevision(v=>v+1);}});return()=>subscription.unsubscribe();},[demo]);
  const demoRequests = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);
  const refresh = useCallback(async (session: string) => {
    const db = browserDb();
    const [songs, votes] = await Promise.all([
      db
        .from("song_requests")
        .select("id,title,artist,votes,created_at")
        .eq("session_id", session),
      db.from("votes").select("request_id"),
    ]);
    if (songs.error || votes.error)
      throw new Error("Could not load the board. Check your connection.");
    setTracks(songs.data || []);
    setVoted((votes.data || []).map((v) => v.request_id));
  }, []);
  useEffect(() => {
    if (demo) return;
    if (!configured) {
      setError(
        "Connect Supabase to use table links. Visit the home page for an offline preview.",
      );
      setStatus("Setup required");
      return;
    }
    if (!token) {
      setStatus("Scan to join");
      return;
    }
    let cancelled = false;
    let channel:
      ReturnType<ReturnType<typeof browserDb>["channel"]> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const run = async () => {
      try {
        const db = browserDb();
        const { data, error } = await db.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          if (captchaSiteKey && !captchaToken) {
            setNeedsCaptcha(true);
            setStatus("Complete the check to join");
            return;
          }
          const { error } = await db.auth.signInAnonymously({
            options: { captchaToken: captchaToken || undefined },
          });
          setNeedsCaptcha(false);
          if (error)
            throw new Error(
              "Guest sign-in failed. Check anonymous Auth settings and try again.",
            );
        }
        const room: RoomInfo = await act({ action: "join", token });
        if (cancelled) return;
        setInfo(room);
        const sync = () => {
          void refresh(room.session).catch((e) => {
            if (!cancelled) setError(e.message);
          });
        };
        channel = db
          .channel(`board:${room.session}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "song_requests",
              filter: `session_id=eq.${room.session}`,
            },
            sync,
          )
          .on("system", {}, (payload) => {
            if (cancelled || payload.extension !== "postgres_changes") return;
            setStatus(
              payload.status === "ok" ? "Live updates" : "Reconnecting",
            );
            if (payload.status === "ok") sync();
          })
          .subscribe((s) => {
            if (cancelled) return;
            setStatus(
              s === "SUBSCRIBED" ? "Starting live updates" : "Reconnecting",
            );
            if (s === "SUBSCRIBED") sync();
          });
        await refresh(room.session);
        // Polling also reconciles events missed while mobile connections sleep.
        timer = setInterval(sync, 15000);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unable to join.");
          setStatus("Disconnected");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (channel) void browserDb().removeChannel(channel);
    };
  }, [demo, token, refresh, captchaToken,authRevision]);
  async function vote(id: string) {
    if (busy || voted.includes(id)) return;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        setTracks((t) =>
          t.map((s) => (s.id === id ? { ...s, votes: s.votes + 1 } : s)),
        );
        setVoted((v) => [...v, id]);
      } else {
        await act({ action: "vote", request: id });
        await refresh(info!.session);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed");
    } finally {
      setBusy(false);
    }
  }
  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (demo) {
        if (demoRequests.current >= 5)
          throw new Error("You have used your five requests for tonight.");
        if (
          tracks.some(
            (t) =>
              t.title.toLowerCase() === title.trim().toLowerCase() &&
              t.artist.toLowerCase() === artist.trim().toLowerCase(),
          )
        )
          throw new Error("That track is already on the board.");
        demoRequests.current += 1;
        setTracks((t) => [
          ...t,
          {
            id: crypto.randomUUID(),
            title: title.trim(),
            artist: artist.trim(),
            votes: 0,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        await act({ action: "request", session: info!.session, title, artist });
        await refresh(info!.session);
      }
      setOpen(false);
      setTitle("");
      setArtist("");
      setNotice("Your track is on the board. Let the crowd decide.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const sorted = [...tracks].sort(
    (a, b) =>
      b.votes - a.votes ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
  return (
    <main className="mx-auto max-w-6xl px-5 pb-12 sm:px-10">
      <header className="flex items-center justify-between border-b border-white/10 py-6">
        <a
          href="/"
          className="flex items-center gap-2 text-xl font-black tracking-tight"
        >
          <span className="rounded-lg bg-[#c2ff65] p-2 text-black">
            <Music2 size={20} />
          </span>
          vibe<span className="text-[#c2ff65] -ml-2">pub</span>
          <span className="ml-2 hidden text-xs font-normal text-zinc-500 sm:block">
            GOOD TIMES. ON REQUEST.
          </span>
        </a>
        <span className="rounded-full border border-white/15 px-3 py-2 text-xs text-zinc-300">
          {info
            ? info.table === "Pub floor"
              ? "PUB FLOOR"
              : `TABLE ${info.table}`
            : "WELCOME IN"}
        </span>
      </header>
      <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
        <span className="size-2 rounded-full bg-[#c2ff65]" />
        {info?.venue || "Your night starts here"}
        <span className="text-zinc-600">/</span>
        <span>{status}</span>
      </div>
      {demo && (
        <div className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/5 p-3 text-sm text-amber-200">
          Interactive offline preview · sample crowd votes · changes reset on
          reload. Connect Supabase for real guests and live updates.
        </div>
      )}
      <section className="grid gap-8 py-10 md:grid-cols-[1.6fr_1fr] md:py-14">
        <div>
          <p className="mb-4 text-xs font-bold tracking-[.25em] text-[#c2ff65]">
            THE NIGHT IS YOURS
          </p>
          <h1 className="text-5xl font-black leading-[1.05] tracking-[-.05em] sm:text-7xl">
            Your table.
            <br />
            Your <span className="text-[#c2ff65]">soundtrack.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-zinc-400">
            Hear something you love. Discover something new.
            <br className="hidden sm:block" /> Request a track and send your
            favorites to the top.
          </p>
          <button
            disabled={!info}
            onClick={() => {
              setError("");
              setNotice("");
              setOpen(true);
            }}
            className="mt-7 flex min-h-12 items-center gap-2 rounded-xl bg-[#c2ff65] px-6 py-3 font-bold text-[#171b12]"
          >
            <Plus size={20} /> Request a song
          </button>
        </div>
        <aside className="relative flex min-h-56 flex-col justify-end overflow-hidden rounded-3xl border border-white/10 bg-[#202023] p-7">
          <Disc3
            className="absolute -right-8 -top-10 size-60 rotate-12 text-[#c2ff65]/15"
            strokeWidth={0.6}
          />
          <span className="relative mb-8 w-fit rounded-full bg-black/30 px-3 py-2 text-xs text-[#c2ff65]">
            <Headphones size={13} className="mr-2 inline" /> IN THE BOOTH
          </span>
          <h2 className="relative text-2xl font-bold">
            {info?.name || "Find your crowd"}
          </h2>
          <p className="relative mt-2 text-sm leading-6 text-zinc-400">
            You bring the energy. The DJ brings the mix.
            <br />
            Top votes help shape what comes next.
          </p>
        </aside>
      </section>
      <div
        role="alert"
        className={
          error
            ? "mb-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200"
            : "sr-only"
        }
      >
        {error}
      </div>
      <p
        role="status"
        className={notice ? "mb-5 text-sm text-[#c2ff65]" : "sr-only"}
      >
        {notice}
      </p>
      {needsCaptcha && (
        <section className="mb-6 rounded-2xl border border-white/10 p-5">
          <p>Complete the check to enter the pub.</p>
          <Captcha onToken={setCaptchaToken} />
        </section>
      )}
      {(!info || !token) && (
        <div className="mb-8 rounded-2xl border border-white/10 p-7">
          <QrCode className="mb-3 text-[#c2ff65]" />
          <h2 className="text-xl font-bold">Join your pub’s night</h2>
          <p className="mt-2 text-zinc-400">
            Scan a table or entrance QR, or paste the pub link below. Join
            songs, games and optional introductions.
          </p>
          <JoinForm />
        </div>
      )}
      {info && (
        <nav
          aria-label="Pub activities"
          className="mb-6 flex gap-2 overflow-x-auto border-b border-white/10 pb-4"
        >
          {(["music", "games", "people"] as const).map((t) => (
            <button
              key={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-5 py-3 text-sm font-bold ${tab === t ? "bg-[#c2ff65] text-black" : "bg-white/5 text-zinc-300"}`}
            >
              {t === "music"
                ? "Song requests"
                : t === "games"
                  ? "Pub games"
                  : "Meet the crowd"}
            </button>
          ))}
        </nav>
      )}
      {info && tab === "games" && <Games session={info.session} demo={demo} />}
      {info && tab === "people" && (
        <Social session={info.session} demo={demo} />
      )}
      {tab === "music" && (
        <section aria-label="Song leaderboard">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                The crowd’s picks{" "}
                <span className="ml-1 text-sm font-normal text-zinc-500">
                  {tracks.length.toString().padStart(2, "0")}
                </span>
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                See your next favorite? Give it a boost.
              </p>
            </div>
            <Radio size={20} className="text-[#c2ff65]" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {sorted.map((track, i) => (
              <article
                key={track.id}
                className="flex items-center gap-3 border-b border-white/5 bg-[#19191e] p-4 last:border-0 sm:gap-5 sm:p-5"
              >
                <span className="w-5 text-center text-sm text-zinc-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div
                  className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${i % 2 ? "bg-[#362a42] text-[#c9a5f4]" : "bg-[#2d3826] text-[#c2ff65]"}`}
                >
                  <Music2 size={21} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold">{track.title}</h3>
                  <p className="mt-1 truncate text-sm text-zinc-400">
                    {track.artist}
                  </p>
                </div>
                <button
                  aria-label={`${voted.includes(track.id) ? "Voted for" : "Vote for"} ${track.title}`}
                  aria-pressed={voted.includes(track.id)}
                  disabled={busy || voted.includes(track.id) || !info}
                  onClick={() => vote(track.id)}
                  className={`flex min-h-12 min-w-16 flex-col items-center justify-center rounded-xl border px-3 py-2 text-sm font-bold ${voted.includes(track.id) ? "border-[#c2ff65]/40 bg-[#c2ff65]/10 text-[#c2ff65]" : "border-white/15 hover:border-[#c2ff65] hover:text-[#c2ff65]"}`}
                >
                  {voted.includes(track.id) ? (
                    <Check size={16} />
                  ) : (
                    <ArrowUp size={16} />
                  )}{" "}
                  {track.votes}
                </button>
              </article>
            ))}
            {info && !tracks.length && (
              <p className="p-10 text-center text-zinc-400">
                A fresh board. Be the first to request a track.
              </p>
            )}
          </div>
        </section>
      )}
      <footer className="mt-7 flex flex-wrap justify-between gap-3 text-xs leading-6 text-zinc-500">
        <a href="/scan" className="underline">
          Scan another pub QR
        </a>
        <span>One vote per track · Five requests per guest per session</span>
        <span>Requests are suggestions. Final mix is up to the DJ.</span>
        <a href="/host" className="underline">
          Venue staff
        </a>
      </footer>
      <dialog
        ref={dialogRef}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/15 bg-[#202026] p-6 text-white backdrop:bg-black/75"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Set the vibe.</h2>
          <button
            aria-label="Close request form"
            onClick={() => setOpen(false)}
            className="p-3"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={request} className="space-y-5">
          <label className="block text-sm">
            Song title
            <input
              autoFocus
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2"
              placeholder="e.g. One More Time"
            />
          </label>
          <label className="block text-sm">
            Artist
            <input
              required
              maxLength={100}
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="mt-2"
              placeholder="e.g. Daft Punk"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            disabled={busy || !title.trim() || !artist.trim()}
            className="w-full rounded-xl bg-[#c2ff65] p-4 font-bold text-black"
          >
            {busy ? "Sending…" : "Add to the board"}
          </button>
          <p className="text-xs text-zinc-400">
            Your request starts with zero votes. Every guest gets one vote per
            track.
          </p>
        </form>
      </dialog>
    </main>
  );
}
