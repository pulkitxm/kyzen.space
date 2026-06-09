import { describe, expect, it } from "bun:test";
import { generateGameCode } from "@gamelobby/shared/types";
import { generateInviteToken, INVITE_TOKEN_LENGTH } from "../src/invite-token";

describe("generateInviteToken", () => {
  it("is long and high-entropy (>= 43 url-safe chars)", () => {
    const token = generateInviteToken();
    expect(token.length).toBe(INVITE_TOKEN_LENGTH);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is never the 6-char game code shape", () => {
    expect(generateInviteToken().length).not.toBe(generateGameCode().length);
  });

  it("does not collide across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateInviteToken());
    expect(seen.size).toBe(5000);
  });

  it("is url-safe across many draws (no +, /, or = padding)", () => {
    for (let i = 0; i < 2000; i++) {
      const token = generateInviteToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(token.includes("+")).toBe(false);
      expect(token.includes("/")).toBe(false);
      expect(token.includes("=")).toBe(false);
    }
  });
});
