import { z } from "zod";
const uuid = z.uuid();
/** QR payloads are data. Always navigate to this app's join route, never the QR's host. */
export function joinToken(value: string): string | null {
  const input = value.trim();
  if (uuid.safeParse(input).success) return input.toLowerCase();
  try {
    const url = new URL(input, "https://vibepub.invalid");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const match = url.pathname.match(/^\/join\/([^/]+)\/?$/);
    return match && uuid.safeParse(match[1]).success
      ? match[1].toLowerCase()
      : null;
  } catch {
    return null;
  }
}
