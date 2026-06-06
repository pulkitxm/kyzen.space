import type { PopoutGeometry } from "../types/chat-layout";

export const MIN_GAME = 360;
export const MIN_CHAT = 280;
export const MAX_CHAT = 420;
export const DEFAULT_CHAT_W = 360;

export const MIN_CHAT_POPOUT_W = 300;
export const MAX_CHAT_POPOUT_W = 560;
export const MIN_CHAT_POPOUT_H = 320;
export const MAX_CHAT_POPOUT_H = 900;

export const DEFAULT_POPOUT = {
  x: 100000,
  y: 100000,
  w: 380,
  h: 520,
} as const satisfies PopoutGeometry;
