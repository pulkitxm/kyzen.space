import { describe, expect, it } from "bun:test";
import { generateGuestName } from "../src/guest-name";

describe("generateGuestName", () => {
  it("produces a 'Guest-xxxx' name", () => {
    const name = generateGuestName();
    expect(name).toMatch(/^Guest-[a-z0-9]{4,8}$/);
  });

  it("varies between calls", () => {
    const a = generateGuestName();
    const b = generateGuestName();
    expect(a).not.toBe(b);
  });

  it("always carries the exact 'Guest-' prefix", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateGuestName().startsWith("Guest-")).toBe(true);
    }
  });

  it("uses only lowercase base36 characters after the prefix", () => {
    for (let i = 0; i < 500; i++) {
      const suffix = generateGuestName().slice("Guest-".length);
      expect(suffix).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("never emits an empty suffix or stray whitespace", () => {
    for (let i = 0; i < 500; i++) {
      const name = generateGuestName();
      const suffix = name.slice("Guest-".length);
      expect(suffix.length).toBeGreaterThan(0);
      expect(name).toBe(name.trim());
      expect(name).not.toContain(" ");
    }
  });

  it("contains exactly one hyphen separating prefix and suffix", () => {
    for (let i = 0; i < 200; i++) {
      const parts = generateGuestName().split("-");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBe("Guest");
    }
  });

  it("is overwhelmingly unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateGuestName());
    expect(seen.size).toBeGreaterThan(4990);
  });
});
