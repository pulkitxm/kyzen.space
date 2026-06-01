// Pure layout math + persistence helpers for the play-page game/chat split.
// Mirror of apps/server/src/lib/chat-layout.ts — keep bounds in sync.

export type ChatMode = "mounted" | "popout";

export type PopoutGeometry = { x: number; y: number; w: number; h: number };

export type ChatLayout = {
  mode: ChatMode;
  dividerWidth: number; // game-pane width in px
  popout: PopoutGeometry;
};

// Game pane bounds.
export const MIN_GAME = 360;
export const MAX_GAME = 760;
export const DEFAULT_GAME = 480;

// Chat pane (mounted) bounds — chat is deliberately kept small.
export const MIN_CHAT = 280;
export const MAX_CHAT = 420;

// Floating-window size bounds.
export const MIN_CHAT_POPOUT_W = 300;
export const MAX_CHAT_POPOUT_W = 560;
export const MIN_CHAT_POPOUT_H = 320;
export const MAX_CHAT_POPOUT_H = 900;
export const POPOUT_MARGIN = 16;

export const CHAT_LAYOUT_KEY = "gl_chat_layout";

export const DEFAULT_POPOUT: PopoutGeometry = {
  x: 100000, // sentinel; clampGeometry pulls it to bottom-right
  y: 100000,
  w: 380,
  h: 520,
};

export const DEFAULT_CHAT_LAYOUT: ChatLayout = {
  mode: "mounted",
  dividerWidth: DEFAULT_GAME,
  popout: DEFAULT_POPOUT,
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

/**
 * Clamp the game-pane width so BOTH panes respect their min/max for the given
 * container width. Responsive: callers re-run this on container resize.
 */
export function clampGameWidth(width: number, containerW: number): number {
  const lo = Math.max(MIN_GAME, containerW - MAX_CHAT);
  const hi = Math.min(MAX_GAME, containerW - MIN_CHAT);
  if (hi < lo) {
    if (lo > MAX_GAME) {
      // Container is so wide that even MAX_GAME leaves excess chat room;
      // fall back to [MIN_GAME, MAX_GAME] so the user's requested width is honoured.
      return clampNum(width, MIN_GAME, MAX_GAME, DEFAULT_GAME);
    }
    // Container is too small to fit both panes at their minimums.
    return MIN_GAME;
  }
  return clampNum(width, lo, hi, DEFAULT_GAME);
}

/** Clamp a floating-window geometry to the viewport (size + on-screen position). */
export function clampGeometry(
  geo: PopoutGeometry,
  vw: number,
  vh: number,
): PopoutGeometry {
  const w = clampNum(
    geo.w,
    MIN_CHAT_POPOUT_W,
    Math.max(MIN_CHAT_POPOUT_W, Math.min(MAX_CHAT_POPOUT_W, vw)),
    DEFAULT_POPOUT.w,
  );
  const h = clampNum(
    geo.h,
    MIN_CHAT_POPOUT_H,
    Math.max(MIN_CHAT_POPOUT_H, Math.min(MAX_CHAT_POPOUT_H, vh)),
    DEFAULT_POPOUT.h,
  );
  const maxX = Math.max(0, vw - w - POPOUT_MARGIN);
  const maxY = Math.max(0, vh - h - POPOUT_MARGIN);
  return {
    w,
    h,
    x: clampNum(geo.x, 0, maxX, maxX),
    y: clampNum(geo.y, 0, maxY, maxY),
  };
}

export function normalizeChatLayout(o: unknown): ChatLayout {
  if (typeof o !== "object" || o === null || Array.isArray(o))
    return DEFAULT_CHAT_LAYOUT;
  const r = o as Record<string, unknown>;
  const p =
    typeof r.popout === "object" && r.popout !== null
      ? (r.popout as Record<string, unknown>)
      : {};
  return {
    mode: r.mode === "popout" ? "popout" : "mounted",
    dividerWidth: clampNum(r.dividerWidth, MIN_GAME, MAX_GAME, DEFAULT_GAME),
    popout: {
      x: finiteOr(p.x, DEFAULT_POPOUT.x),
      y: finiteOr(p.y, DEFAULT_POPOUT.y),
      w: clampNum(p.w, MIN_CHAT_POPOUT_W, MAX_CHAT_POPOUT_W, DEFAULT_POPOUT.w),
      h: clampNum(p.h, MIN_CHAT_POPOUT_H, MAX_CHAT_POPOUT_H, DEFAULT_POPOUT.h),
    },
  };
}

export function parseChatLayout(raw: string | null | undefined): ChatLayout {
  if (!raw) return DEFAULT_CHAT_LAYOUT;
  try {
    return normalizeChatLayout(JSON.parse(raw));
  } catch {
    return DEFAULT_CHAT_LAYOUT;
  }
}

export function readChatLayout(): ChatLayout | null {
  try {
    const raw = localStorage.getItem(CHAT_LAYOUT_KEY);
    return raw ? parseChatLayout(raw) : null;
  } catch {
    return null;
  }
}

export function writeChatLayout(layout: ChatLayout): void {
  try {
    localStorage.setItem(CHAT_LAYOUT_KEY, JSON.stringify(layout));
  } catch {}
}
