// Source of truth for chat-layout validation (server side). Mirror of the web
// catalog in apps/web/lib/chat-layout.ts — keep the bounds in sync.

export type ChatMode = "mounted" | "popout";

export type PopoutGeometry = { x: number; y: number; w: number; h: number };

export type ChatLayout = {
  mode: ChatMode;
  chatWidth: number; // chat-pane width in px; the game pane flex-fills the rest
  popout: PopoutGeometry;
};

// The chat pane is the bounded one; the game pane flex-fills the rest.
export const MIN_GAME = 360;
export const MIN_CHAT = 280;
export const MAX_CHAT = 420;
export const DEFAULT_CHAT_W = 360;

// Floating-window size bounds (px).
export const MIN_CHAT_POPOUT_W = 300;
export const MAX_CHAT_POPOUT_W = 560;
export const MIN_CHAT_POPOUT_H = 320;
export const MAX_CHAT_POPOUT_H = 900;

export const DEFAULT_POPOUT: PopoutGeometry = {
  x: 100000, // sentinel; clamped to bottom-right at render time
  y: 100000,
  w: 380,
  h: 520,
};

function clampNum(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = typeof n === "number" ? n : Number(n);
  const base = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, base));
}

function finiteOr(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Returns a normalized, clamped ChatLayout, or null if `input` is not an object. */
export function validateChatLayout(input: unknown): ChatLayout | null {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return null;
  const r = input as Record<string, unknown>;
  const p =
    typeof r.popout === "object" && r.popout !== null
      ? (r.popout as Record<string, unknown>)
      : {};
  return {
    mode: r.mode === "popout" ? "popout" : "mounted",
    chatWidth: clampNum(r.chatWidth, MIN_CHAT, MAX_CHAT, DEFAULT_CHAT_W),
    popout: {
      x: finiteOr(p.x, DEFAULT_POPOUT.x),
      y: finiteOr(p.y, DEFAULT_POPOUT.y),
      w: clampNum(p.w, MIN_CHAT_POPOUT_W, MAX_CHAT_POPOUT_W, DEFAULT_POPOUT.w),
      h: clampNum(p.h, MIN_CHAT_POPOUT_H, MAX_CHAT_POPOUT_H, DEFAULT_POPOUT.h),
    },
  };
}
