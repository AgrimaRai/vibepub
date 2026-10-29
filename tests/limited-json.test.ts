import { test } from "node:test";
import assert from "node:assert/strict";
import { limitedJson, PayloadTooLarge } from "../src/lib/limited-json";
test("body limit uses actual UTF-8 bytes, including chunked requests", async () => {
  const text = JSON.stringify({ x: "é".repeat(2200) });
  await assert.rejects(
    limitedJson(
      new Request("http://localhost", { method: "POST", body: text }),
    ),
    PayloadTooLarge,
  );
  const reader = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(2048));
      c.enqueue(new Uint8Array(2049));
      c.close();
    },
  });
  await assert.rejects(
    limitedJson(
      new Request("http://localhost", {
        method: "POST",
        body: reader,
        duplex: "half",
      } as RequestInit),
    ),
    PayloadTooLarge,
  );
  assert.deepEqual(
    await limitedJson(
      new Request("http://localhost", { method: "POST", body: '{"ok":true}' }),
    ),
    { ok: true },
  );
});
