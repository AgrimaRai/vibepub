import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/actions/route";
test("API rejects unauthenticated, malformed and oversized writes before database calls", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  try {
    const send = (body: string, authorization?: string) =>
      POST(
        new Request("http://localhost:3000/api/actions", {
          method: "POST",
          headers: authorization ? { authorization } : {},
          body,
        }),
      );
    assert.equal((await send("{}")).status, 401);
    assert.equal((await send("not JSON", "Bearer token")).status, 400);
    assert.equal(
      (
        await send(
          JSON.stringify({ action: "vote", request: "invalid" }),
          "Bearer token",
        )
      ).status,
      400,
    );
    assert.equal((await send("a".repeat(4097), "Bearer token")).status, 413);
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
});
