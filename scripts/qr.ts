import QRCode from "qrcode";
import { mkdir } from "node:fs/promises";
const [origin, token] = process.argv.slice(2);
if (
  !origin ||
  !token ||
  !/^https?:$/.test(new URL(origin).protocol) ||
  !/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token)
)
  throw new Error(
    "Usage: npm run qr -- https://your-app.example TABLE_QR_TOKEN",
  );
await mkdir("outputs", { recursive: true });
const url = new URL(`/join/${token}`, origin).href;
await QRCode.toFile(`outputs/table-${token}.png`, url, {
  width: 1024,
  margin: 4,
  errorCorrectionLevel: "M",
});
console.log(`Created table QR for ${url}`);
