import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { joinToken } from "../src/lib/join-token";
const token = "88eebd85-0be8-4c0d-b8b6-2625fac7c0c0";
test("join parser accepts QR links and tokens but never navigates to QR hosts", () => {
  for (const value of [
    token,
    `https://pub.example/join/${token}`,
    `http://localhost:3000/join/${token}`,
    `/join/${token}`,
    ` https://pub.example/join/${token}?source=table#hello `,
  ])
    assert.equal(joinToken(value), token);
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "https://example.com",
    "https://example.com/not-a-pub/" + token,
    `https://name:password@example.com/join/${token}`,
    `https://example.com/join/${token}/extra`,
    "not a QR",
  ])
    assert.equal(joinToken(value), null);
});
test("the same decoder used by the scanner reads a generated printable pub QR", () => {
  const url = `https://pub.example/join/${token}`;
  const code = QRCode.create(url, { errorCorrectionLevel: "M" });
  const scale = 6,
    margin = 4,
    size = (code.modules.size + margin * 2) * scale;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < code.modules.size; y++)
    for (let x = 0; x < code.modules.size; x++)
      if (code.modules.get(y, x))
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i =
              (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) *
              4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
          }
  const result = jsQR(rgba, size, size);
  assert.equal(result?.data, url);
  assert.equal(joinToken(result!.data), token);
});
