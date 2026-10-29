"use client";
import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, ShieldCheck } from "lucide-react";
import { Account } from "./account";
import { ProfilePhoto,photoRequest,preparePhoto } from "./profile-photo";
import { act } from "@/lib/actions";
import { browserDb } from "@/lib/supabase";
type Person = { id: string; nickname: string; intro: string; photo_version?: string|null };
type Invitation = {
  id: string;
  incoming: boolean;
  other: string;
  nickname: string;
  status: "pending" | "accepted" | "declined";
};
type Board = {
  me: { nickname: string; intro: string; visible: boolean; photo_version?:string|null } | null;
  people: Person[];
  invitations: Invitation[];
};
export function Social({ session, demo }: { session: string; demo: boolean }) {
  const [verified,setVerified]=useState(false);
  const [ownId,setOwnId]=useState("");
  const [board, setBoard] = useState<Board>({
    me: null,
    people: [],
    invitations: [],
  });
  const [nickname, setNickname] = useState("");
  const [intro, setIntro] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(demo);
  const [editing, setEditing] = useState(false);
  const refresh = useCallback(async () => {
    const { data, error } = await browserDb().rpc("social_board", {
      p_session: session,
    });
    if (error) {
      setBoard({ me: null, people: [], invitations: [] });
      setLoaded(false);
      throw new Error(
        "Introductions are unavailable. Check your connection or ask whether the session has ended.",
      );
    }
    setBoard(data);
    setLoaded(true);
  }, [session]);
  useEffect(() => {
    if (demo || !verified) return;
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
  }, [demo, verified, refresh]);
  useEffect(() => {
    if (!editing && loaded) {
      setNickname(board.me?.nickname || "");
      setIntro(board.me?.intro || "");
      setVisible(board.me?.visible || false);
    }
  }, [board.me, editing, loaded]);
  async function run(action: Parameters<typeof act>[0], message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await act(action);
      await refresh();
      setNotice(message);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(()=>{
    if(demo||!verified)return;
    void browserDb().auth.getUser().then(({data})=>setOwnId(data.user?.id||""));
    const touch=()=>void act({action:"presence",session,active:document.visibilityState==="visible"}).catch(()=>{});
    touch();const timer=setInterval(touch,45000);document.addEventListener("visibilitychange",touch);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",touch);void act({action:"presence",session,active:false}).catch(()=>{});};
  },[demo,verified,session]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (demo) {
      setBoard({
        me: { nickname: nickname.trim(), intro: intro.trim(), visible },
        people: visible
          ? [
              {
                id: "sample-alex",
                nickname: "Alex · demo guest",
                intro: "Always up for a music quiz.",
              },
            ]
          : [],
        invitations: [],
      });
      setEditing(false);
      setNotice("Local preview updated. No real guest can see this.");
      return;
    }
    void run(
      { action: "profile", session, nickname, intro, visible },
      visible
        ? "You are open to introductions for this session."
        : "Your profile is hidden and previous invitations have been revoked.",
    );
  };
  function demoInvite(p: Person) {
    setBoard((b) => ({
      ...b,
      invitations: [
        ...b.invitations,
        {
          id: "demo-invite",
          incoming: false,
          other: p.id,
          nickname: p.nickname,
          status: "pending",
        },
      ],
    }));
    setNotice(
      "Demo invitation sent. A real guest would need to accept before you connect.",
    );
  }
  return (
    <section aria-label="Guest introductions" className="space-y-6">
      <div className="flex items-start gap-4">
        <Users className="mt-1 shrink-0 text-[#c2ff65]" />
        <div>
          <h2 className="text-2xl font-bold">Meet the crowd.</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Here for more than the music? Make yourself visible to other guests
            who choose to join. Introductions stay within tonight’s pub session.
          </p>
        </div>
      </div>
      {demo && (
        <p className="text-sm text-amber-200">
          Offline social preview · sample guest · no messages are delivered.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-[#c2ff65]">
          {notice}
        </p>
      )}
      {!demo&&<Account onVerified={setVerified}/>}
      {(demo||verified)&&<>
      <form
        onSubmit={save}
        className="space-y-4 rounded-2xl border border-white/10 bg-[#19191e] p-5"
      >
        <h3 className="font-bold">Your introduction</h3>
        <label className="block text-sm">
          Display name
          <input
            disabled={!loaded || busy}
            required
            minLength={2}
            maxLength={50}
            value={nickname}
            onChange={(e) => {
              setEditing(true);
              setNickname(e.target.value);
            }}
            className="mt-2"
            placeholder="A name you’d like to go by"
          />
        </label>
        <label className="block text-sm">
          A little about you
          <input
            disabled={!loaded || busy}
            maxLength={240}
            value={intro}
            onChange={(e) => {
              setEditing(true);
              setIntro(e.target.value);
            }}
            className="mt-2"
            placeholder="e.g. Looking for a trivia teammate"
          />
        </label>
        {!demo&&<div className="space-y-3">
          <ProfilePhoto session={session} user={ownId} version={board.me?.photo_version} name={nickname||"You"}/>
          <label className="block text-sm">Profile photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="mt-2" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setBusy(true);try{await photoRequest(session,await preparePhoto(f));await refresh();setNotice("Photo saved privately. A square crop is used.");}catch(e){setError(e instanceof Error?e.message:"Photo failed.");}finally{setBusy(false);}}}/></label>
          {board.me?.photo_version&&<button type="button" disabled={busy} className="text-sm underline" onClick={async()=>{setBusy(true);try{await photoRequest(session,null);await refresh();}catch(e){setError(e instanceof Error?e.message:"Photo failed.");}finally{setBusy(false);}}}>Remove photo</button>}
          <p className="text-xs text-zinc-400">JPEG, PNG or WebP · up to 5 MB. Upload a photo you have permission to share.</p>
        </div>}
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => {
              setEditing(true);
              setVisible(e.target.checked);
            }}
            className="mt-1 size-5 shrink-0 accent-[#c2ff65]"
          />
          Show my name, photo and description to other opted-in guests tonight.
        </label>
        <button
          disabled={busy || !loaded || nickname.trim().length < 2}
          className="rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black"
        >
          Save preferences
        </button>
        {board.me?.visible && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (demo) {
                setBoard({
                  me: { nickname, intro, visible: false },
                  people: [],
                  invitations: [],
                });
                setVisible(false);
              } else
                void run(
                  {
                    action: "profile",
                    session,
                    nickname: board.me!.nickname,
                    intro: board.me!.intro,
                    visible: false,
                  },
                  "You are hidden. Invitations revoked.",
                );
            }}
            className="ml-3 rounded-xl border border-white/20 px-4 py-3 text-sm"
          >
            Hide me now
          </button>
        )}
        <p className="flex items-start gap-2 text-xs leading-5 text-zinc-400">
          <ShieldCheck className="size-4 shrink-0 mt-0.5" />
          No phone numbers, emails, precise locations or private chat are
          shared. Use a nickname; leave contact details out. You can hide or
          block at any time.
        </p>
      </form>
      {board.me?.visible && (
        <>
          <div>
            <h3 className="mb-3 text-lg font-bold">
              Active in this pub
            </h3>
            <p className="mb-3 text-xs leading-5 text-zinc-400">Verified, opted-in guests active in this venue session within the last 2 minutes. This is recent app activity, not proof of physical presence.</p>
            {!board.people.length && (
              <p className="text-sm text-zinc-400">
                No other opted-in guests yet. Check back during the night.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {board.people.map((p) => (
                <article
                  key={p.id}
                  className="rounded-2xl border border-white/10 p-5"
                >
                  {!demo&&<ProfilePhoto session={session} user={p.id} version={p.photo_version} name={p.nickname}/>}
                  <h4 className="font-bold">{p.nickname}</h4>
                  <p className="mt-2 break-words text-sm text-zinc-400">
                    {p.intro || "Here for a good night."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      disabled={
                        busy || board.invitations.some((i) => i.other === p.id)
                      }
                      onClick={() =>
                        demo
                          ? demoInvite(p)
                          : void run(
                              { action: "introduce", session, other: p.id },
                              "Invitation sent. They decide whether to accept.",
                            )
                      }
                      className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm"
                    >
                      <UserPlus size={16} />
                      Say hello
                    </button>
                    <button
                      disabled={busy}
                      className="text-sm text-zinc-400 underline"
                      onClick={() => {
                        if (demo)
                          setBoard((b) => ({
                            ...b,
                            people: b.people.filter((x) => x.id !== p.id),
                            invitations: [],
                          }));
                        else
                          void run(
                            { action: "block", session, other: p.id },
                            "Guest blocked for this session.",
                          );
                      }}
                    >
                      Block
                    </button>
                    {!demo&&<button disabled={busy} className="text-sm text-red-300 underline" onClick={()=>{const reason=window.prompt("Reason: harassment, spam, unsafe_content, impersonation, or other","harassment");if(!reason)return;const reasons=["harassment","spam","unsafe_content","impersonation","other"] as const;if(!reasons.includes(reason as typeof reasons[number])){setError("Choose one of the listed reasons.");return;}const details=window.prompt("Optional details (up to 1000 characters)","");if(details===null)return;void run({action:"report",session,other:p.id,reason:reason as typeof reasons[number],details},"Reported to venue staff and blocked for this session.");}}>Report & block</button>}

                  </div>
                </article>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-lg font-bold">Your invitations</h3>
            {!board.invitations.length && (
              <p className="text-sm text-zinc-400">
                Invitations are private to the two guests.
              </p>
            )}
            {board.invitations.map((i) => (
              <article
                key={i.id}
                className="mb-3 rounded-xl border border-white/10 p-4"
              >
                <p className="font-bold">{i.nickname}</p>
                <p className="mt-1 text-sm text-zinc-400">
                  {i.status === "accepted"
                    ? "You both agreed to say hello. Introduce yourselves in person when comfortable."
                    : i.status === "declined"
                      ? "Invitation closed."
                      : i.incoming
                        ? "Would like to say hello."
                        : "Waiting for their reply."}
                </p>
                {!demo&&i.status!=="declined"&&<button className="mt-3 text-sm underline" disabled={busy} onClick={()=>void run({action:"cancel",invitation:i.id},"Introduction closed.")}>Close introduction</button>}
                {i.incoming && i.status === "pending" && (
                  <div className="mt-3 flex gap-3">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          { action: "respond", invitation: i.id, accept: true },
                          "Introduction accepted.",
                        )
                      }
                      className="rounded-lg bg-[#c2ff65] px-4 py-2 text-sm font-bold text-black"
                    >
                      Accept
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          {
                            action: "respond",
                            invitation: i.id,
                            accept: false,
                          },
                          "Invitation declined.",
                        )
                      }
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      </>}
    </section>
  );
}
