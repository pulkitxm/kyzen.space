import { afterAll, describe, expect, it } from "bun:test";
import { conversations, db, messages, schema } from "@kyzen/database";
import { and, eq } from "drizzle-orm";
import * as conversationsService from "../src/chat/conversations-service";
import * as messagesService from "../src/chat/messages-service";
import {
  createHarness,
  DB_UP,
  expectErr,
  type TestUser,
  unwrap,
} from "./harness";

const h = createHarness("cge");

afterAll(h.cleanup);

async function dmPair(
  aLabel: string,
  bLabel: string,
): Promise<{ a: TestUser; b: TestUser; dmId: string }> {
  const a = await h.makeUser(aLabel);
  const b = await h.makeUser(bLabel);
  const dmId = await h.makeDm(a, b);
  return { a, b, dmId };
}

async function promoteToAdmin(
  conversationId: string,
  userId: string,
): Promise<void> {
  await db
    .update(schema.conversationMember)
    .set({ role: "admin" })
    .where(
      and(
        eq(schema.conversationMember.conversationId, conversationId),
        eq(schema.conversationMember.userId, userId),
      ),
    );
}

describe.skipIf(!DB_UP)("deleteMessage ownership gate", () => {
  it("a member who is not the sender cannot delete the message (403, body intact)", async () => {
    const { a, b, dmId } = await dmPair("do1", "do2");
    const msg = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "mine to delete",
      }),
    );

    expectErr(await messagesService.deleteMessage(b.id, msg.id), 403);

    const stored = await messages.getById(msg.id);
    expect(stored?.deletedAt).toBeNull();
    expect(stored?.body).toBe("mine to delete");
  });

  it("the 404 (missing message) check precedes the ownership check", async () => {
    const a = await h.makeUser("do3");
    expectErr(
      await messagesService.deleteMessage(a.id, crypto.randomUUID()),
      404,
    );
  });
});

describe.skipIf(!DB_UP)(
  "group role gate honours the admin role surface",
  () => {
    it("createGroup never assigns admin, but a promoted admin can add members", async () => {
      const owner = await h.makeUser("ad_o");
      const helper = await h.makeUser("ad_h");
      const newcomer = await h.makeUser("ad_n");
      const gid = await h.makeGroup(owner, "AdminAdds", [helper.id]);

      expect(await conversations.getMemberRole(gid, helper.id)).toBe("member");
      expectErr(
        await conversationsService.addMembers(helper.id, gid, [newcomer.id]),
        403,
      );

      await promoteToAdmin(gid, helper.id);
      expect(await conversations.getMemberRole(gid, helper.id)).toBe("admin");

      unwrap(
        await conversationsService.addMembers(helper.id, gid, [newcomer.id]),
      );
      expect(await conversations.getMemberIds(gid)).toContain(newcomer.id);
    });

    it("a promoted admin can remove another member and rename the group", async () => {
      const owner = await h.makeUser("ar_o");
      const helper = await h.makeUser("ar_h");
      const target = await h.makeUser("ar_t");
      const gid = await h.makeGroup(owner, "AdminPowers", [
        helper.id,
        target.id,
      ]);

      await promoteToAdmin(gid, helper.id);

      unwrap(
        await conversationsService.removeMember(helper.id, gid, target.id),
      );
      expect(await conversations.getMemberIds(gid)).not.toContain(target.id);

      const renamed = unwrap(
        await conversationsService.renameGroup(
          helper.id,
          gid,
          "Renamed By Admin",
        ),
      );
      expect(renamed.name).toBe("Renamed By Admin");
    });

    it("a plain member is still blocked from remove and rename (gate fires before existence)", async () => {
      const owner = await h.makeUser("mb_o");
      const plain = await h.makeUser("mb_p");
      const target = await h.makeUser("mb_t");
      const gid = await h.makeGroup(owner, "MemberBlocked", [
        plain.id,
        target.id,
      ]);

      expectErr(
        await conversationsService.removeMember(plain.id, gid, target.id),
        403,
      );
      expectErr(
        await conversationsService.renameGroup(plain.id, gid, "Nope"),
        403,
      );
    });
  },
);

if (!DB_UP) {
  describe("chat gates edge cases", () => {
    it.skip("skipped - database unreachable; run `bun run db:start`", () => {});
  });
}
