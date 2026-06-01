import { describe, expect, it } from "bun:test";
import {
  MAX_CHAT_POPOUT_W,
  MAX_GAME,
  MIN_GAME,
  validateChatLayout,
} from "../src/lib/chat-layout";

describe("validateChatLayout", () => {
  it("rejects non-objects", () => {
    for (const v of [null, undefined, "x", 5, true, []])
      expect(validateChatLayout(v)).toBeNull();
  });

  it("defaults a bare object to mounted mode with clamped fields", () => {
    const out = validateChatLayout({});
    expect(out).not.toBeNull();
    expect(out?.mode).toBe("mounted");
    expect(out?.dividerWidth).toBeGreaterThanOrEqual(MIN_GAME);
    expect(out?.dividerWidth).toBeLessThanOrEqual(MAX_GAME);
  });

  it("coerces an unknown mode to mounted and keeps a valid one", () => {
    expect(validateChatLayout({ mode: "weird" })?.mode).toBe("mounted");
    expect(validateChatLayout({ mode: "popout" })?.mode).toBe("popout");
  });

  it("clamps out-of-range numbers", () => {
    const out = validateChatLayout({
      mode: "popout",
      dividerWidth: 99999,
      popout: { x: 10, y: 20, w: 99999, h: -5 },
    });
    expect(out?.dividerWidth).toBe(MAX_GAME);
    expect(out?.popout.w).toBe(MAX_CHAT_POPOUT_W);
    expect(out?.popout.x).toBe(10);
  });

  it("falls back to defaults for non-finite numbers", () => {
    const out = validateChatLayout({
      dividerWidth: "abc",
      popout: { x: "nope", y: null, w: undefined, h: Number.NaN },
    });
    expect(Number.isFinite(out?.dividerWidth)).toBe(true);
    expect(Number.isFinite(out?.popout.w)).toBe(true);
  });
});
