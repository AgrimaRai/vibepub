import { test } from "node:test";
import assert from "node:assert/strict";
import { actionSchema } from "../src/lib/validation";
const session = "20000000-0000-4000-8000-000000000001";
test("valid input is trimmed, empty and oversized inputs rejected", () => {
  assert.deepEqual(
    actionSchema.parse({
      action: "request",
      session,
      title: " Track ",
      artist: " Artist ",
    }),
    { action: "request", session, title: "Track", artist: "Artist" },
  );
  for (const title of ["", "   ", "a".repeat(101)])
    assert.equal(
      actionSchema.safeParse({
        action: "request",
        session,
        title,
        artist: "Artist",
      }).success,
      false,
    );
});
test("invalid identifiers and operations rejected", () => {
  for (const body of [
    { action: "vote", request: "bad" },
    { action: "join", token: "no" },
    { action: "admin" },
    { action: "request", session, title: "Track" },
  ])
    assert.equal(actionSchema.safeParse(body).success, false);
});

test("game and introduction payloads reject forged or excessive fields", () => {
  for (const body of [
    { action: "answer", round: session, choice: 4 },
    { action: "answer", round: session, choice: "0" },
    { action: "profile", session, nickname: "X", intro: "", visible: true },
    {
      action: "profile",
      session,
      nickname: "Alex",
      intro: "a".repeat(241),
      visible: true,
    },
    { action: "respond", invitation: session, accept: "yes" },
    {
      action: "host",
      session,
      kind: "trivia",
      question: "Question",
      options: ["One"],
      correct: 0,
    },
  ])
    assert.equal(actionSchema.safeParse(body).success, false);
  assert.equal(
    actionSchema.safeParse({
      action: "profile",
      session,
      nickname: "Alex",
      intro: "Trivia fan",
      visible: false,
    }).success,
    true,
  );
});
