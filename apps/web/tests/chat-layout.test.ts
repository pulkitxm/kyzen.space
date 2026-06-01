import { describe, expect, it } from "bun:test";
import {
  clampChatWidth,
  clampGeometry,
  DEFAULT_CHAT_LAYOUT,
  MAX_CHAT,
  MIN_CHAT,
  POPOUT_MARGIN,
  parseChatLayout,
} from "../lib/chat-layout";

describe("clampChatWidth", () => {
  it("bounds chat within [MIN_CHAT, MAX_CHAT] on a wide container", () => {
    expect(clampChatWidth(9999, 1400)).toBe(MAX_CHAT);
    expect(clampChatWidth(10, 1400)).toBe(MIN_CHAT);
  });

  it("shrinks chat so the game pane keeps its min width", () => {
    // container 760 → chat max = min(420, 760 - 360) = 400.
    expect(clampChatWidth(9999, 760)).toBe(400);
  });

  it("falls back to MIN_CHAT when the container is too small for both", () => {
    // container 500 → chat max = min(420, 140) = 140 < MIN_CHAT → MIN_CHAT.
    expect(clampChatWidth(300, 500)).toBe(MIN_CHAT);
  });
});

describe("clampGeometry", () => {
  it("pulls the default sentinel to the bottom-right of the viewport", () => {
    const g = clampGeometry(DEFAULT_CHAT_LAYOUT.popout, 1200, 800);
    expect(g.x).toBe(1200 - g.w - POPOUT_MARGIN);
    expect(g.y).toBe(800 - g.h - POPOUT_MARGIN);
  });

  it("clamps size to the viewport and keeps the window on-screen", () => {
    const g = clampGeometry({ x: -500, y: -500, w: 99999, h: 99999 }, 600, 500);
    expect(g.w).toBeLessThanOrEqual(600);
    expect(g.h).toBeLessThanOrEqual(500);
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);
  });
});

describe("parseChatLayout", () => {
  it("returns defaults for null / bad JSON", () => {
    expect(parseChatLayout(null)).toEqual(DEFAULT_CHAT_LAYOUT);
    expect(parseChatLayout("{not json")).toEqual(DEFAULT_CHAT_LAYOUT);
  });

  it("coerces mode and clamps a stored width", () => {
    const out = parseChatLayout(
      JSON.stringify({ mode: "popout", chatWidth: 5 }),
    );
    expect(out.mode).toBe("popout");
    expect(out.chatWidth).toBe(MIN_CHAT);
  });

  it("exposes sane chat bounds", () => {
    expect(MIN_CHAT).toBeLessThan(MAX_CHAT);
  });
});
