export class PayloadTooLarge extends Error {}
export async function limitedJson(
  req: Request,
  limit = 4096,
): Promise<unknown> {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new PayloadTooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw new SyntaxError("Empty body");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new PayloadTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text);
}
