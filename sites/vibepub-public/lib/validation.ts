import { z } from "zod";
const uuid = z.uuid();
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join"), token: uuid }),
  z.object({
    action: z.literal("request"),
    session: uuid,
    title: z.string().trim().min(1).max(100),
    artist: z.string().trim().min(1).max(100),
  }),
  z.object({ action: z.literal("vote"), request: uuid }),
  z.object({
    action: z.literal("host"),
    session: uuid,
    kind: z.enum(["trivia", "poll"]),
    question: z.string().trim().min(1).max(200),
    options: z.array(z.string().trim().min(1).max(80)).min(2).max(4),
    correct: z.number().int().min(0).max(3).nullable(),
  }),
  z.object({ action: z.literal("close"), round: uuid }),
  z.object({
    action: z.literal("answer"),
    round: uuid,
    choice: z.number().int().min(0).max(3),
  }),
  z.object({
    action: z.literal("profile"),
    session: uuid,
    nickname: z.string().trim().min(2).max(50),
    intro: z.string().trim().max(240),
    visible: z.boolean(),
  }),
  z.object({ action: z.literal("introduce"), session: uuid, other: uuid }),
  z.object({
    action: z.literal("respond"),
    invitation: uuid,
    accept: z.boolean(),
  }),
  z.object({ action: z.literal("block"), session: uuid, other: uuid }),
  z.object({ action: z.literal("presence"), session: uuid, active: z.boolean() }),
  z.object({ action: z.literal("cancel"), invitation: uuid }),
  z.object({ action: z.literal("report"), session: uuid, other: uuid, reason: z.enum(["harassment","spam","unsafe_content","impersonation","other"]), details: z.string().trim().max(1000) }),
  z.object({ action: z.literal("moderate"), report: uuid, decision: z.enum(["dismiss","suspend","restore"]) }),
]);
