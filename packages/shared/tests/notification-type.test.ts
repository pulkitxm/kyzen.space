import { describe, expect, it } from "bun:test";
import { notificationTypeSchema } from "../src/types/chat/schemas";

describe("notificationTypeSchema", () => {
  it("accepts game_invite", () => {
    expect(notificationTypeSchema.parse("game_invite")).toBe("game_invite");
  });

  it("still accepts the existing notification types", () => {
    const types = [
      "friend_request",
      "friend_accepted",
      "game_started",
      "game_challenge",
    ] as const;
    for (const t of types) {
      expect(notificationTypeSchema.parse(t)).toBe(t);
    }
  });

  it("rejects an unknown type", () => {
    expect(notificationTypeSchema.safeParse("nope").success).toBe(false);
  });
});
