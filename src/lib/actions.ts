import { browserDb } from "./supabase";
import type { z } from "zod";
import type { actionSchema } from "./validation";
export async function act(data: z.infer<typeof actionSchema>) {
  const {
    data: { session },
  } = await browserDb().auth.getSession();
  if (!session) throw new Error("Your session expired. Reload to reconnect.");
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Action failed. Please retry.");
  return result.data;
}
