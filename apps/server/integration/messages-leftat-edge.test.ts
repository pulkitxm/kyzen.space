import { afterAll, describe, expect, it } from "bun:test";
import { conversations, messages } from "@gamelobby/database";
import * as conversationsService from "../src/chat/conversations-service";
import * as messagesService from "../src/chat/messages-service";
import { createHarness, DB_UP, unwrap } from "./harness";

const h = createHarness("mle");

afterAll(h.cleanup);

describe.skipIf(!DB_UP)("unreadCount and a member who has left", () => {
  it("still counts messages for a member after they leave the group (documents a leftAt-filter gap)", async () => {
    const owner = await h.makeUser("ulo");
    const leaver = await h.makeUser("ull");
    const gid = await h.makeGroup(owner, "LeftUnread", [leaver.id]);

    unwrap(await conversationsService.removeMember(owner.id, gid, leaver.id));
    expect(await conversations.getMemberIds(gid)).not.toContain(leaver.id);

    unwrap(
      await messagesService.sendMessage({
        conversationId: gid,
        senderId: owner.id,
        body: "posted after you left",
      }),
    );

    expect(await conversations.unreadCount(gid, leaver.id)).toBe(1);
  });
});

describe.skipIf(!DB_UP)(
  "markRead with a messageId from another conversation",
  () => {
    it("accepts a foreign messageId and records it as lastReadMessageId (documents a missing same-conversation check)", async () => {
      const a = await h.makeUser("mfa");
      const b = await h.makeUser("mfb");
      const dmId = await h.makeDm(a, b);

      const c = await h.makeUser("mfc");
      const otherDm = await h.makeDm(a, c);

      const foreign = unwrap(
        await messagesService.sendMessage({
          conversationId: otherDm,
          senderId: a.id,
          body: "in the other conversation",
        }),
      );

      unwrap(await messagesService.markRead(b.id, dmId, foreign.id));

      const rows = await conversations.getMemberRows(dmId);
      const bRow = rows.find((r) => r.userId === b.id);
      expect(bRow?.lastReadMessageId).toBe(foreign.id);

      const stored = await messages.getById(foreign.id);
      expect(stored?.conversationId).toBe(otherDm);
      expect(stored?.conversationId).not.toBe(dmId);
    });
  },
);

if (!DB_UP) {
  describe("messages leftAt edge cases", () => {
    it.skip("skipped - database unreachable; run `bun run db:start`", () => {});
  });
}
