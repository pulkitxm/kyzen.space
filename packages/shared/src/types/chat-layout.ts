import { z } from "zod";

export const chatModeSchema = z.enum(["mounted", "popout"]);
export type ChatMode = z.infer<typeof chatModeSchema>;

export type PopoutGeometry = { x: number; y: number; w: number; h: number };

export type ChatModePref = { mode: ChatMode };

export function validateChatModePref(input: unknown): ChatModePref | null {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return null;
  const r = input as Record<string, unknown>;
  return { mode: r.mode === "popout" ? "popout" : "mounted" };
}
