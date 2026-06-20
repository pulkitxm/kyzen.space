import { describe, expect, it } from "bun:test";
import {
  clampWidth,
  clampWidthSafe,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_WIDTH_KEY,
} from "@/lib/sidebar-atoms-shared";
import {
  parseSidebarPrefsCookieValue,
  SIDEBAR_LS_BOOT_SCRIPT,
  SIDEBAR_PREFS_COOKIE,
} from "@/lib/sidebar-prefs";

function encode(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

describe("clampWidthSafe", () => {
  it("clamps to the configured bounds", () => {
    expect(clampWidthSafe(9999)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampWidthSafe(1)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampWidthSafe(MIN_SIDEBAR_WIDTH)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampWidthSafe(MAX_SIDEBAR_WIDTH)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it("passes through an in-range value untouched", () => {
    const mid = (MIN_SIDEBAR_WIDTH + MAX_SIDEBAR_WIDTH) / 2;
    expect(clampWidthSafe(mid)).toBe(mid);
  });

  it("falls back to the default for non-finite input", () => {
    expect(clampWidthSafe(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampWidthSafe(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_SIDEBAR_WIDTH,
    );
  });
});

describe("clampWidth", () => {
  it("parses and clamps a numeric string", () => {
    expect(clampWidth("9999")).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampWidth("10")).toBe(MIN_SIDEBAR_WIDTH);
  });

  it("accepts a raw number", () => {
    expect(clampWidth(MAX_SIDEBAR_WIDTH + 100)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it("falls back to the default for non-numeric input", () => {
    expect(clampWidth("not-a-number")).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampWidth(null)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampWidth(undefined)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampWidth({})).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it("bounds are coherent", () => {
    expect(MIN_SIDEBAR_WIDTH).toBeLessThan(DEFAULT_SIDEBAR_WIDTH);
    expect(DEFAULT_SIDEBAR_WIDTH).toBeLessThan(MAX_SIDEBAR_WIDTH);
  });
});

describe("parseSidebarPrefsCookieValue - fallbacks", () => {
  it("returns defaults for undefined, empty, and whitespace-only input", () => {
    const def = { collapsed: false, width: DEFAULT_SIDEBAR_WIDTH };
    expect(parseSidebarPrefsCookieValue(undefined)).toEqual(def);
    expect(parseSidebarPrefsCookieValue("")).toEqual(def);
    expect(parseSidebarPrefsCookieValue("   ")).toEqual(def);
  });

  it("returns defaults for malformed JSON", () => {
    expect(parseSidebarPrefsCookieValue(encode("{not json"))).toEqual({
      collapsed: false,
      width: DEFAULT_SIDEBAR_WIDTH,
    });
  });

  it("returns defaults for a non-object JSON payload", () => {
    expect(parseSidebarPrefsCookieValue(encode(42))).toEqual({
      collapsed: false,
      width: DEFAULT_SIDEBAR_WIDTH,
    });
    expect(parseSidebarPrefsCookieValue(encode(null))).toEqual({
      collapsed: false,
      width: DEFAULT_SIDEBAR_WIDTH,
    });
  });
});

describe("parseSidebarPrefsCookieValue - collapsed coercion", () => {
  it("treats true / 1 / '1' / 'true' as collapsed", () => {
    for (const c of [true, 1, "1", "true"]) {
      expect(
        parseSidebarPrefsCookieValue(encode({ collapsed: c })).collapsed,
      ).toBe(true);
    }
  });

  it("treats other values (false, 0, 'no') as not collapsed", () => {
    for (const c of [false, 0, "no", "yes"]) {
      expect(
        parseSidebarPrefsCookieValue(encode({ collapsed: c })).collapsed,
      ).toBe(false);
    }
  });

  it("supports the short 'c' alias", () => {
    expect(parseSidebarPrefsCookieValue(encode({ c: 1 })).collapsed).toBe(true);
  });
});

describe("parseSidebarPrefsCookieValue - width", () => {
  it("clamps an in-payload width and accepts a numeric string", () => {
    expect(parseSidebarPrefsCookieValue(encode({ width: 9999 })).width).toBe(
      MAX_SIDEBAR_WIDTH,
    );
    expect(parseSidebarPrefsCookieValue(encode({ width: "5" })).width).toBe(
      MIN_SIDEBAR_WIDTH,
    );
  });

  it("supports the short 'w' alias", () => {
    expect(parseSidebarPrefsCookieValue(encode({ w: 300 })).width).toBe(300);
  });

  it("falls back to the default width when width is non-finite or missing", () => {
    expect(parseSidebarPrefsCookieValue(encode({ width: "junk" })).width).toBe(
      DEFAULT_SIDEBAR_WIDTH,
    );
    expect(
      parseSidebarPrefsCookieValue(encode({ collapsed: true })).width,
    ).toBe(DEFAULT_SIDEBAR_WIDTH);
  });
});

describe("SIDEBAR_LS_BOOT_SCRIPT", () => {
  it("references the storage keys, the cookie name, and the clamp bounds", () => {
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain(SIDEBAR_COLLAPSED_KEY);
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain(SIDEBAR_WIDTH_KEY);
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain(SIDEBAR_PREFS_COOKIE);
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain(String(MIN_SIDEBAR_WIDTH));
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain(String(MAX_SIDEBAR_WIDTH));
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain(String(DEFAULT_SIDEBAR_WIDTH));
  });

  it("mirrors localStorage prefs into the SSR cookie", () => {
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain("document.cookie");
    expect(SIDEBAR_LS_BOOT_SCRIPT).toContain("encodeURIComponent");
  });
});
