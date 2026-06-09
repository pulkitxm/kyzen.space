import { describe, expect, it } from "bun:test";
import { RESERVED_USERNAMES } from "../src/constants/username";
import { isReservedUsername } from "../src/types/username";

describe("RESERVED_USERNAMES", () => {
  it("reserves the invite top-level route segment", () => {
    expect(RESERVED_USERNAMES.has("invite")).toBe(true);
    expect(isReservedUsername("invite")).toBe(true);
  });

  it("keeps the existing reserved segments", () => {
    for (const name of [
      "api",
      "auth",
      "account",
      "chat",
      "friends",
      "games",
      "play",
      "profile",
      "settings",
      "ui",
    ]) {
      expect(RESERVED_USERNAMES.has(name)).toBe(true);
    }
  });
});
