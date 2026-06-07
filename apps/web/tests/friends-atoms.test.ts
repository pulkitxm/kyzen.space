import { describe, expect, it } from "bun:test";
import type { FriendshipJson } from "@gamelobby/shared/types";
import { upsertFriend } from "@/lib/chat/atoms";

function friendship(id: string, userId: string): FriendshipJson {
  return {
    id,
    status: "accepted",
    user: {
      id: userId,
      username: `user-${userId}`,
      displayName: null,
      avatar: null,
    },
  } as unknown as FriendshipJson;
}

describe("upsertFriend", () => {
  it("adds a newly-accepted friend to the front of the list", () => {
    const existing = [friendship("f1", "u1")];
    const next = upsertFriend(existing, friendship("f2", "u2"));
    expect(next.map((f) => f.user.id)).toEqual(["u2", "u1"]);
  });

  it("replaces an existing entry for the same user instead of duplicating", () => {
    const existing = [friendship("f1", "u1"), friendship("f2", "u2")];
    const next = upsertFriend(existing, friendship("f3", "u2"));
    expect(next).toHaveLength(2);
    expect(next.map((f) => f.user.id)).toEqual(["u2", "u1"]);
    expect(next.find((f) => f.user.id === "u2")?.id).toBe("f3");
  });
});
