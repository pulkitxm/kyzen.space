import { describe, expect, it } from "bun:test";
import {
  MAX_CHAT,
  MAX_CHAT_POPOUT_W,
  MIN_CHAT,
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
    expect(out?.chatWidth).toBeGreaterThanOrEqual(MIN_CHAT);
    expect(out?.chatWidth).toBeLessThanOrEqual(MAX_CHAT);
  });

  it("coerces an unknown mode to mounted and keeps a valid one", () => {
    expect(validateChatLayout({ mode: "weird" })?.mode).toBe("mounted");
    expect(validateChatLayout({ mode: "popout" })?.mode).toBe("popout");
  });

  it("clamps out-of-range numbers", () => {
    const out = validateChatLayout({
      mode: "popout",
      chatWidth: 99999,
      popout: { x: 10, y: 20, w: 99999, h: -5 },
    });
    expect(out?.chatWidth).toBe(MAX_CHAT);
    expect(out?.popout.w).toBe(MAX_CHAT_POPOUT_W);
    expect(out?.popout.x).toBe(10);
  });

  it("falls back to defaults for non-finite numbers", () => {
    const out = validateChatLayout({
      chatWidth: "abc",
      popout: { x: "nope", y: null, w: undefined, h: Number.NaN },
    });
    expect(Number.isFinite(out?.chatWidth)).toBe(true);
    expect(Number.isFinite(out?.popout.w)).toBe(true);
  });
});
