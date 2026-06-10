import { describe, expect, it } from "bun:test";
import { ANON_FRIEND_LIMIT_MESSAGE, ANON_MAX_FRIENDS } from "../src/constants";

describe("ANON_MAX_FRIENDS", () => {
  it("caps guests at five friends", () => {
    expect(ANON_MAX_FRIENDS).toBe(5);
  });
});

describe("ANON_FRIEND_LIMIT_MESSAGE", () => {
  it("names the limit", () => {
    expect(ANON_FRIEND_LIMIT_MESSAGE).toContain(String(ANON_MAX_FRIENDS));
  });
});
