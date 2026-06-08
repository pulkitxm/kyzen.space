import {
  DEFAULT_CHAT_W,
  DEFAULT_POPOUT,
  MAX_CHAT,
  MAX_CHAT_POPOUT_H,
  MAX_CHAT_POPOUT_W,
  MIN_CHAT,
  MIN_CHAT_POPOUT_H,
  MIN_CHAT_POPOUT_W,
  MIN_GAME,
} from "@gamelobby/shared/constants";
import type { ChatMode, PopoutGeometry } from "@gamelobby/shared/types";

export type { ChatMode, PopoutGeometry };
export {
  DEFAULT_CHAT_W,
  DEFAULT_POPOUT,
  MAX_CHAT,
  MAX_CHAT_POPOUT_H,
  MAX_CHAT_POPOUT_W,
  MIN_CHAT,
  MIN_CHAT_POPOUT_H,
  MIN_CHAT_POPOUT_W,
  MIN_GAME,
};

export type StashEdge = "left" | "right" | "top" | "bottom";
export type IconPos = { x: number; y: number };

export type ChatLayout = {
  mode: ChatMode;
  minimized: boolean;
  stashEdge: StashEdge | null;
  lastStashEdge: StashEdge;
  chatWidth: number;
  popout: PopoutGeometry;
  icon: IconPos;
};

export const DEFAULT_STASH_EDGE: StashEdge = "right";

export const POPOUT_MARGIN = 16;

export const ICON_SIZE = 56;
export const ICON_MARGIN = 16;
export const EDGE_TAB_THICKNESS = 22;
export const EDGE_TAB_LENGTH = 44;

export const CHAT_LAYOUT_KEY = "gl_chat_layout";

export const DEFAULT_ICON = { x: 100000, y: 100000 } as const satisfies IconPos;

export const DEFAULT_CHAT_LAYOUT = {
  mode: "mounted",
  minimized: false,
  stashEdge: null,
  lastStashEdge: DEFAULT_STASH_EDGE,
  chatWidth: DEFAULT_CHAT_W,
  popout: DEFAULT_POPOUT,
  icon: DEFAULT_ICON,
} satisfies ChatLayout;

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

export function clampChatWidth(width: number, containerW: number): number {
  const hi = Math.min(MAX_CHAT, containerW - MIN_GAME);
  if (hi < MIN_CHAT) return MIN_CHAT;
  return clampNum(width, MIN_CHAT, hi, DEFAULT_CHAT_W);
}

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

function validStashEdge(v: unknown): StashEdge | null {
  return v === "left" || v === "right" || v === "top" || v === "bottom"
    ? v
    : null;
}

export function clampIcon(icon: IconPos, vw: number, vh: number): IconPos {
  const maxX = Math.max(ICON_MARGIN, vw - ICON_SIZE - ICON_MARGIN);
  const maxY = Math.max(ICON_MARGIN, vh - ICON_SIZE - ICON_MARGIN);
  return {
    x: clampNum(icon.x, ICON_MARGIN, maxX, maxX),
    y: clampNum(icon.y, ICON_MARGIN, maxY, maxY),
  };
}

export function edgeForIcon(
  icon: IconPos,
  vw: number,
  vh: number,
): StashEdge | null {
  const cx = icon.x + ICON_SIZE / 2;
  const cy = icon.y + ICON_SIZE / 2;
  const overshoot: Array<[StashEdge, number]> = [
    ["left", -cx],
    ["right", cx - vw],
    ["top", -cy],
    ["bottom", cy - vh],
  ];
  let best: StashEdge | null = null;
  let bestOver = 0;
  for (const [edge, o] of overshoot) {
    if (o > bestOver) {
      bestOver = o;
      best = edge;
    }
  }
  return best;
}

export function normalizeChatLayout(o: unknown): ChatLayout {
  if (typeof o !== "object" || o === null || Array.isArray(o))
    return DEFAULT_CHAT_LAYOUT;
  const r = o as Record<string, unknown>;
  const p =
    typeof r.popout === "object" && r.popout !== null
      ? (r.popout as Record<string, unknown>)
      : {};
  const ic =
    typeof r.icon === "object" && r.icon !== null
      ? (r.icon as Record<string, unknown>)
      : {};
  return {
    mode: r.mode === "popout" ? "popout" : "mounted",
    minimized: r.minimized === true,
    stashEdge: validStashEdge(r.stashEdge),
    lastStashEdge: validStashEdge(r.lastStashEdge) ?? DEFAULT_STASH_EDGE,
    chatWidth: clampNum(r.chatWidth, MIN_CHAT, MAX_CHAT, DEFAULT_CHAT_W),
    popout: {
      x: finiteOr(p.x, DEFAULT_POPOUT.x),
      y: finiteOr(p.y, DEFAULT_POPOUT.y),
      w: clampNum(p.w, MIN_CHAT_POPOUT_W, MAX_CHAT_POPOUT_W, DEFAULT_POPOUT.w),
      h: clampNum(p.h, MIN_CHAT_POPOUT_H, MAX_CHAT_POPOUT_H, DEFAULT_POPOUT.h),
    },
    icon: {
      x: finiteOr(ic.x, DEFAULT_ICON.x),
      y: finiteOr(ic.y, DEFAULT_ICON.y),
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

export const CHAT_LAYOUT_COOKIE = CHAT_LAYOUT_KEY;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export function parseChatLayoutCookie(value: string | undefined): ChatLayout {
  if (!value) return DEFAULT_CHAT_LAYOUT;
  try {
    return normalizeChatLayout(JSON.parse(decodeURIComponent(value)));
  } catch {
    return DEFAULT_CHAT_LAYOUT;
  }
}

export function persistChatLayout(layout: ChatLayout): void {
  const json = JSON.stringify(layout);
  try {
    localStorage.setItem(CHAT_LAYOUT_KEY, json);
  } catch {}
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is not universally supported; SSR reads this cookie for layout hydration
    document.cookie = `${CHAT_LAYOUT_COOKIE}=${encodeURIComponent(json)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {}
}

export const CHAT_LAYOUT_BOOT_SCRIPT = `(function(){try{
var K=${JSON.stringify(CHAT_LAYOUT_KEY)};
var v=null;try{v=localStorage.getItem(K)}catch(e){}
if(v){document.cookie=${JSON.stringify(CHAT_LAYOUT_COOKIE)}+"="+encodeURIComponent(v)+"; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax";}
}catch(e){}})();`;
