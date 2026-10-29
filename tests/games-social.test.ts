import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const a = "30000000-0000-4000-8000-000000000001",
  b = "30000000-0000-4000-8000-000000000002",
  host = "30000000-0000-4000-8000-000000000003";
const session = "20000000-0000-4000-8000-000000000001",
  venue = "10000000-0000-4000-8000-000000000001";
test("host games and private opt-in introductions", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const f of ["202610280001_core.sql", "202610290001_games_social.sql"])
      await db.exec(
        (await readFile(`supabase/migrations/${f}`, "utf8")).replace(
          /^alter publication .*;$/gm,
          "",
        ),
      );
    await db.exec(await readFile("supabase/seed.sql", "utf8"));
    await db.query("insert into auth.users values($1),($2),($3)", [a, b, host]);
    await db.query("insert into public.venue_staff values($1,$2)", [
      venue,
      host,
    ]);
    const as = async (id: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    const hostRound = async (kind = "trivia", correct: number | null = 0) => {
      const r = await db.query<{ id: string }>(
        "select public.host_round($1,$2,'Who sang it?',array['Queen','ABBA'], $3) id",
        [session, kind, correct],
      );
      return r.rows[0].id;
    };
    await as(a);
    await db.query("select public.join_table($1)", [
      "70000000-0000-4000-8000-000000000007",
    ]);
    await as(b);
    const joined = await db.query<{ room: { table: string } }>(
      "select public.join_table($1) room",
      ["70000000-0000-4000-8000-000000000000"],
    );
    assert.equal(joined.rows[0].room.table, "Pub floor");
    await t.test(
      "guest cannot host, close rounds, list QR secrets or grant staff",
      async () => {
        await assert.rejects(hostRound(), /Staff access/);
        await assert.rejects(
          db.query("select public.venue_links($1)", [session]),
          /Staff access/,
        );
        await assert.rejects(
          db.query("insert into public.venue_staff values($1,$2)", [venue, b]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from public.game_keys"),
          /permission denied/,
        );
      },
    );
    await as(host);
    let round = await hostRound();
    await t.test(
      "host can access venue QR codes and cannot overlap rounds",
      async () => {
        const l = await db.query<{ links: unknown[] }>(
          "select public.venue_links($1) links",
          [session],
        );
        assert.equal(l.rows[0].links.length, 3);
        await assert.rejects(hostRound(), /Close the current/);
      },
    );
    await as(a);
    await t.test(
      "answer stays private, locks once, and scores are hidden until close",
      async () => {
        assert.equal(
          (
            await db.query<{ r: null }>("select public.game_results($1) r", [
              round,
            ])
          ).rows[0].r,
          null,
        );
        await assert.rejects(
          db.query("select public.close_round($1)", [round]),
          /Staff access/,
        );
        await db.query("select public.answer_round($1,0)", [round]);
        await db.query("select public.answer_round($1,1)", [round]);
        assert.equal(
          (
            await db.query<{ choice: number }>(
              "select choice from public.game_answers",
            )
          ).rows[0].choice,
          0,
        );
        assert.deepEqual(
          (
            await db.query<{ s: unknown[] }>(
              "select public.table_scores($1) s",
              [session],
            )
          ).rows[0].s,
          [],
        );
      },
    );
    await as(b);
    await t.test(
      "another guest cannot see answer rows or submit invalid choices",
      async () => {
        assert.equal(
          (await db.query("select * from public.game_answers")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select public.answer_round($1,3)", [round]),
          /valid answer/,
        );
        await db.query("select public.answer_round($1,1)", [round]);
      },
    );
    await as(host);
    await db.query("select public.close_round($1)", [round]);
    await as(a);
    await t.test(
      "closed results reveal correct answer and table points exactly once",
      async () => {
        const result = await db.query<{
          r: { correct: number; counts: number[] };
        }>("select public.game_results($1) r", [round]);
        assert.deepEqual(result.rows[0].r, { correct: 0, counts: [1, 1] });
        const scores = await db.query<{
          s: { label: string; points: number }[];
        }>("select public.table_scores($1) s", [session]);
        assert.deepEqual(scores.rows[0].s, [{ label: "07", points: 10 }]);
        await assert.rejects(
          db.query("select public.answer_round($1,1)", [round]),
          /round has closed/,
        );
      },
    );
    await as(host);
    await t.test("host input validation also runs in SQL", async () => {
      await assert.rejects(
        db.query(
          "select public.host_round($1,'trivia','Question',array['A','a'],0)",
          [session],
        ),
        /different options/,
      );
      await assert.rejects(hostRound("trivia", 3), /valid correct answer/);
    });
    round = await hostRound("poll", null);
    await as(b);
    await db.query("select public.answer_round($1,1)", [round]);
    await as(host);
    await db.query("select public.close_round($1)", [round]);
    await t.test("poll results never generate trivia points", async () => {
      const result = await db.query<{ r: { correct: null; counts: number[] } }>(
        "select public.game_results($1) r",
        [round],
      );
      assert.deepEqual(result.rows[0].r, { correct: null, counts: [0, 1] });
      assert.equal(
        (
          await db.query<{ s: unknown[] }>("select public.table_scores($1) s", [
            session,
          ])
        ).rows[0].s.length,
        1,
      );
    });
    await as(a);
    await t.test(
      "introductions default to hidden and require both guests to opt in",
      async () => {
        const board = await db.query<{ b: { me: null; people: unknown[] } }>(
          "select public.social_board($1) b",
          [session],
        );
        assert.deepEqual(board.rows[0].b.people, []);
        assert.equal(board.rows[0].b.me, null);
        await db.query(
          "select public.save_profile($1,'Alex','Trivia fan',true)",
          [session],
        );
        await assert.rejects(
          db.query("select public.send_intro($1,$2)", [session, b]),
          /not available/,
        );
        await assert.rejects(
          db.query("select * from public.guest_profiles"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select public.save_profile($1,'X','',true)", [session]),
          /nickname/,
        );
      },
    );
    await as(b);
    await db.query("select public.save_profile($1,'Sam','Music fan',true)", [
      session,
    ]);
    await as(a);
    await db.query("select public.send_intro($1,$2)", [session, b]);
    const invitations = await db.query<{
      b: {
        invitations: { id: string; incoming: boolean; status: string }[];
        people: unknown[];
      };
    }>("select public.social_board($1) b", [session]);
    const invitation = invitations.rows[0].b.invitations[0].id;
    await t.test(
      "invitation is private and only recipient can accept",
      async () => {
        assert.equal(invitations.rows[0].b.people.length, 1);
        await assert.rejects(
          db.query("select public.respond_intro($1,true)", [invitation]),
          /not available/,
        );
        await assert.rejects(
          db.query("select public.send_intro($1,$2)", [session, b]),
          /already exists/,
        );
        await as(host);
        await assert.rejects(
          db.query("select public.social_board($1)", [session]),
          /Join an active/,
        );
        await as(b);
        await db.query("select public.respond_intro($1,true)", [invitation]);
        const r = await db.query<{
          b: { invitations: { incoming: boolean; status: string }[] };
        }>("select public.social_board($1) b", [session]);
        assert.equal(r.rows[0].b.invitations[0].incoming, true);
        assert.equal(r.rows[0].b.invitations[0].status, "accepted");
      },
    );
    await t.test(
      "opting out removes visibility and revokes accepted invitations",
      async () => {
        await db.query(
          "select public.save_profile($1,'Sam','Music fan',false)",
          [session],
        );
        await as(a);
        const r = await db.query<{
          b: { people: unknown[]; invitations: unknown[] };
        }>("select public.social_board($1) b", [session]);
        assert.deepEqual(r.rows[0].b.people, []);
        assert.deepEqual(r.rows[0].b.invitations, []);
        await db.exec("reset role");
        const status = await db.query<{ status: string }>(
          "select status from public.introductions where id=$1",
          [invitation],
        );
        assert.equal(status.rows[0].status, "declined");
      },
    );
    await as(b);
    await db.query("select public.save_profile($1,'Sam','Music fan',true)", [
      session,
    ]);
    await as(a);
    await db.query("select public.block_guest($1,$2)", [session, b]);
    await t.test(
      "blocking is symmetric and prevents future invitations",
      async () => {
        for (const user of [a, b]) {
          await as(user);
          const r = await db.query<{ b: { people: unknown[] } }>(
            "select public.social_board($1) b",
            [session],
          );
          assert.deepEqual(r.rows[0].b.people, []);
        }
        await assert.rejects(
          db.query("select public.send_intro($1,$2)", [session, a]),
          /not available/,
        );
      },
    );
    await db.exec("reset role");
    await db.query("update public.sessions set active=false where id=$1", [
      session,
    ]);
    await as(a);
    await t.test(
      "closing the pub hides social snapshots and blocks profile changes",
      async () => {
        await assert.rejects(
          db.query("select public.social_board($1)", [session]),
          /active pub/,
        );
        await assert.rejects(
          db.query("select public.save_profile($1,'Alex','',true)", [session]),
          /session has ended/,
        );
        await as(host);
        await assert.rejects(hostRound(), /session has ended/);
      },
    );
  } finally {
    await db.close();
  }
});
