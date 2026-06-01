import { describe, expect, it } from "bun:test";
import {
  clampGameWidth,
  clampGeometry,
  DEFAULT_CHAT_LAYOUT,
  MAX_CHAT,
  MAX_GAME,
  MIN_CHAT,
  MIN_GAME,
  POPOUT_MARGIN,
  parseChatLayout,
} from "../lib/chat-layout";

describe("clampGameWidth", () => {
  it("keeps both panes within bounds on a wide container", () => {
    expect(clampGameWidth(2000, 1400)).toBe(MAX_GAME);
    expect(clampGameWidth(100, 1400)).toBe(MIN_GAME);
  });

  it("never lets chat exceed MAX_CHAT (forces game wider)", () => {
    const container = 1000; // game in [max(360,580), min(760,720)] = [580,720]
    expect(clampGameWidth(400, container)).toBe(580);
    expect(container - clampGameWidth(400, container)).toBeLessThanOrEqual(
      MAX_CHAT,
    );
  });

  it("falls back to MIN_GAME when container is too small for both mins", () => {
    expect(clampGameWidth(500, 500)).toBe(MIN_GAME);
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
      JSON.stringify({ mode: "popout", dividerWidth: 5 }),
    );
    expect(out.mode).toBe("popout");
    expect(out.dividerWidth).toBe(MIN_GAME);
  });

  it("exposes sane chat bounds", () => {
    expect(MIN_CHAT).toBeLessThan(MAX_CHAT);
  });
});
