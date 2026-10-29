import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const a = "30000000-0000-4000-8000-000000000001",
  b = "30000000-0000-4000-8000-000000000002";
const session = "20000000-0000-4000-8000-000000000001";
const token = "70000000-0000-4000-8000-000000000007";
test("database permissions, membership, voting and limits", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
    );
    // PGlite provides PostgreSQL execution, but no logical replication service.
    const migration = (
      await readFile("supabase/migrations/202610280001_core.sql", "utf8")
    ).replace(
      "alter publication supabase_realtime add table public.song_requests;",
      "",
    );
    await db.exec(migration);
    await db.exec(await readFile("supabase/seed.sql", "utf8"));
    await db.query("insert into auth.users values($1),($2)", [a, b]);
    const asUser = async (id: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    await t.test(
      "unauthenticated functions and table access denied",
      async () => {
        await db.exec("set role anon");
        await assert.rejects(
          db.query("select public.join_table($1)", [token]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from public.song_requests"),
          /permission denied/,
        );
      },
    );
    await asUser(a);
    await t.test(
      "cannot request before joining; invalid QR rejected",
      async () => {
        await assert.rejects(
          db.query("select public.request_song($1,$2,$3)", [
            session,
            "Track",
            "Artist",
          ]),
          /Scan a table/,
        );
        await assert.rejects(
          db.query("select public.join_table($1)", [
            "70000000-0000-4000-8000-000000000099",
          ]),
          /Invalid table/,
        );
      },
    );
    await db.query("select public.join_table($1)", [token]);
    const { rows } = await db.query<{ id: string }>(
      "select public.request_song($1,$2,$3) as id",
      [session, "Track", "Artist"],
    );
    const id = rows[0].id;
    await t.test(
      "repeated vote is idempotent and count is authoritative",
      async () => {
        await db.query("select public.vote_song($1)", [id]);
        await db.query("select public.vote_song($1)", [id]);
        const { rows } = await db.query<{ votes: number }>(
          "select votes from public.song_requests where id=$1",
          [id],
        );
        assert.equal(rows[0].votes, 1);
        await assert.rejects(
          db.query("update public.song_requests set votes=999"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("insert into public.votes values($1,$2)", [a, id]),
          /permission denied/,
        );
        await assert.rejects(
          db.query("insert into public.memberships values($1,$2,$3)", [
            b,
            session,
            token,
          ]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "first table assignment remains stable on a second QR scan",
      async () => {
        const { rows } = await db.query<{ room: { table: string } }>(
          "select public.join_table($1) as room",
          ["70000000-0000-4000-8000-000000000012"],
        );
        assert.equal(rows[0].room.table, "07");
      },
    );
    await t.test(
      "membership in another venue grants no access to this board",
      async () => {
        await db.exec("reset role");
        await db.exec(`insert into public.venues(id,name) values('10000000-0000-4000-8000-000000000002','Other venue');
  insert into public.sessions(id,venue_id,name) values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other night');
  insert into public.venue_tables(venue_id,label,qr_token) values('10000000-0000-4000-8000-000000000002','01','70000000-0000-4000-8000-000000000001');`);
        await asUser(b);
        await db.query("select public.join_table($1)", [
          "70000000-0000-4000-8000-000000000001",
        ]);
        assert.equal(
          (await db.query("select * from public.song_requests")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select public.request_song($1,$2,$3)", [
            session,
            "Foreign",
            "Artist",
          ]),
          /Scan a table/,
        );
        await assert.rejects(
          db.query("select public.vote_song($1)", [id]),
          /Join this session/,
        );
      },
    );
    await t.test(
      "outsider cannot read or vote; joining permits one vote",
      async () => {
        await asUser(b);
        assert.equal(
          (await db.query("select * from public.song_requests")).rows.length,
          0,
        );
        await assert.rejects(
          db.query("select public.vote_song($1)", [id]),
          /Join this session/,
        );
        await db.query("select public.join_table($1)", [token]);
        await db.query("select public.vote_song($1)", [id]);
        assert.equal(
          (
            await db.query<{ votes: number }>(
              "select votes from public.song_requests",
            )
          ).rows[0].votes,
          2,
        );
        assert.equal(
          (await db.query("select * from public.votes")).rows.length,
          1,
        );
      },
    );
    await asUser(a);
    await t.test(
      "duplicate and invalid songs rejected at database boundary",
      async () => {
        await assert.rejects(
          db.query("select public.request_song($1,$2,$3)", [
            session,
            " TRACK ",
            " artist ",
          ]),
          /already on the board/,
        );
        await assert.rejects(
          db.query("select public.request_song($1,$2,$3)", [
            session,
            " ",
            "Artist",
          ]),
          /1–100/,
        );
      },
    );
    await t.test("five request quota", async () => {
      for (let i = 0; i < 4; i++)
        await db.query("select public.request_song($1,$2,$3)", [
          session,
          `Track ${i}`,
          "Artist",
        ]);
      await assert.rejects(
        db.query("select public.request_song($1,$2,$3)", [
          session,
          "Sixth",
          "Artist",
        ]),
        /five requests/,
      );
    });
    await t.test("ended sessions block joins, requests and votes", async () => {
      await db.exec("reset role");
      await db.query("update public.sessions set active=false where id=$1", [
        session,
      ]);
      await asUser(b);
      await assert.rejects(
        db.query("select public.join_table($1)", [token]),
        /No active session/,
      );
      await assert.rejects(
        db.query("select public.request_song($1,$2,$3)", [
          session,
          "Another",
          "Artist",
        ]),
        /session has ended/,
      );
      await assert.rejects(
        db.query("select public.vote_song($1)", [id]),
        /session has ended/,
      );
    });
  } finally {
    await db.close();
  }
});
