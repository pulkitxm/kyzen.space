import { describe, expect, it } from "bun:test";
import {
  clampChatWidth,
  clampGeometry,
  clampIcon,
  DEFAULT_CHAT_LAYOUT,
  DEFAULT_ICON,
  edgeForIcon,
  ICON_MARGIN,
  ICON_SIZE,
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
    expect(clampChatWidth(9999, 760)).toBe(400);
  });

  it("falls back to MIN_CHAT when the container is too small for both", () => {
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

describe("parseChatLayout — minimize fields", () => {
  it("defaults the new fields", () => {
    const out = parseChatLayout(JSON.stringify({ mode: "popout" }));
    expect(out.minimized).toBe(false);
    expect(out.stashEdge).toBeNull();
    expect(out.icon).toEqual(DEFAULT_ICON);
  });

  it("round-trips minimized + a valid stash edge + icon", () => {
    const out = parseChatLayout(
      JSON.stringify({
        mode: "mounted",
        minimized: true,
        stashEdge: "right",
        icon: { x: 40, y: 60 },
      }),
    );
    expect(out.minimized).toBe(true);
    expect(out.stashEdge).toBe("right");
    expect(out.icon).toEqual({ x: 40, y: 60 });
  });

  it("coerces an invalid stash edge to null", () => {
    expect(
      parseChatLayout(JSON.stringify({ stashEdge: "diagonal" })).stashEdge,
    ).toBeNull();
  });
});

describe("clampIcon", () => {
  it("pulls the sentinel to the bottom-right", () => {
    const p = clampIcon(DEFAULT_ICON, 1200, 800);
    expect(p.x).toBe(1200 - ICON_SIZE - ICON_MARGIN);
    expect(p.y).toBe(800 - ICON_SIZE - ICON_MARGIN);
  });

  it("clamps negatives to the margin", () => {
    expect(clampIcon({ x: -50, y: -50 }, 1200, 800)).toEqual({
      x: ICON_MARGIN,
      y: ICON_MARGIN,
    });
  });
});

describe("edgeForIcon", () => {
  it("returns null when the icon center is on-screen", () => {
    expect(edgeForIcon({ x: 600, y: 400 }, 1200, 800)).toBeNull();
  });

  it("detects each edge once the center crosses it", () => {
    expect(edgeForIcon({ x: -40, y: 400 }, 1200, 800)).toBe("left");
    expect(edgeForIcon({ x: 1200, y: 400 }, 1200, 800)).toBe("right");
    expect(edgeForIcon({ x: 600, y: -40 }, 1200, 800)).toBe("top");
    expect(edgeForIcon({ x: 600, y: 800 }, 1200, 800)).toBe("bottom");
  });

  it("on a corner, picks the edge with the larger overshoot", () => {
    expect(edgeForIcon({ x: -100, y: -60 }, 1200, 800)).toBe("left");
  });
});
