import { afterAll, describe, expect, it } from "bun:test";
import { conversations, messages } from "@gamelobby/database";
import * as messagesService from "../src/chat/messages-service";
import {
  createHarness,
  DB_UP,
  expectErr,
  type TestUser,
  unwrap,
} from "./harness";

const h = createHarness("me");

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

describe.skipIf(!DB_UP)("messages edge cases", () => {
  it("deleting a non-existent message returns 404", async () => {
    const a = await h.makeUser("d404a");
    expectErr(
      await messagesService.deleteMessage(a.id, crypto.randomUUID()),
      404,
    );
  });

  it("markRead by a non-member of the conversation returns 403", async () => {
    const { a, b, dmId } = await dmPair("mr1", "mr2");
    const outsider = await h.makeUser("mr3");
    const msg = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "hi",
      }),
    );
    unwrap(await messagesService.markRead(b.id, dmId, msg.id));
    expectErr(await messagesService.markRead(outsider.id, dmId, msg.id), 403);
  });

  it("sending to a conversation the sender is not in returns 403", async () => {
    const { dmId } = await dmPair("sn1", "sn2");
    const outsider = await h.makeUser("sn3");
    expectErr(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: outsider.id,
        body: "let me in",
      }),
      403,
    );
  });

  it("multi-message unread semantics: accrue, mark read clears, new one re-accrues", async () => {
    const { a, b, dmId } = await dmPair("mu1", "mu2");

    let latest = "";
    for (const body of ["one", "two", "three"]) {
      latest = unwrap(
        await messagesService.sendMessage({
          conversationId: dmId,
          senderId: b.id,
          body,
        }),
      ).id;
    }
    expect(await conversations.unreadCount(dmId, a.id)).toBe(3);

    unwrap(await messagesService.markRead(a.id, dmId, latest));
    expect(await conversations.unreadCount(dmId, a.id)).toBe(0);

    unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: b.id,
        body: "four",
      }),
    );
    expect(await conversations.unreadCount(dmId, a.id)).toBe(1);
  });

  it("a sender's own messages never count as unread for themselves", async () => {
    const { a, dmId } = await dmPair("su1", "su2");
    unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "talking to myself",
      }),
    );
    expect(await conversations.unreadCount(dmId, a.id)).toBe(0);
  });

  it("sendSystemMessage stores a system message with null sender and the given meta", async () => {
    const a = await h.makeUser("sys1");
    const b = await h.makeUser("sys2");
    const gid = await h.makeGroup(a, "System Room", [b.id]);

    const msg = await messagesService.sendSystemMessage(gid, {
      event: "group_created",
      actorId: a.id,
    });
    expect(msg.kind).toBe("system");
    expect(msg.sender).toBeNull();
    expect(msg.body).toBeNull();
    expect(msg.metadata).toEqual({ event: "group_created", actorId: a.id });

    const stored = await messages.getById(msg.id);
    expect(stored?.kind).toBe("system");
    expect(stored?.senderId).toBeNull();
  });

  it("a system message does not count toward a member's unread", async () => {
    const a = await h.makeUser("syu1");
    const b = await h.makeUser("syu2");
    const gid = await h.makeGroup(a, "Quiet System", [b.id]);
    await messagesService.sendSystemMessage(gid, {
      event: "group_created",
      actorId: a.id,
    });
    expect(await conversations.unreadCount(gid, b.id)).toBe(0);
  });

  it("a gif message with metadata and no body is stored as kind gif", async () => {
    const { a, dmId } = await dmPair("gif1", "gif2");
    const gifMeta = {
      provider: "klipy" as const,
      providerId: "abc123",
      previewUrl: "https://example.test/p.gif",
      fullUrl: "https://example.test/f.gif",
      width: 200,
      height: 150,
    };
    const sent = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        kind: "gif",
        metadata: gifMeta,
      }),
    );
    expect(sent.kind).toBe("gif");
    expect(sent.body).toBeNull();
    expect(sent.metadata).toEqual(gifMeta);

    const stored = await messages.getById(sent.id);
    expect(stored?.kind).toBe("gif");
    expect(stored?.metadata).toEqual(gifMeta);
  });

  it("a non-text message bypasses the empty-body check even with no body", async () => {
    const { a, dmId } = await dmPair("gb1", "gb2");
    const sent = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        kind: "gif",
        metadata: {
          provider: "klipy",
          providerId: "x",
          previewUrl: "https://example.test/p.gif",
          fullUrl: "https://example.test/f.gif",
          width: 1,
          height: 1,
        },
      }),
    );
    expect(sent.id).toBeTruthy();
  });

  it("a whitespace-only (tabs/newlines) text body is rejected with 400", async () => {
    const { a, dmId } = await dmPair("ws1", "ws2");
    expectErr(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "\t\n  \r\n\t",
      }),
      400,
    );
  });

  it("a text message with a null body is rejected with 400", async () => {
    const { a, dmId } = await dmPair("nb1", "nb2");
    expectErr(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: null,
      }),
      400,
    );
  });

  it("pagination: a small limit yields a cursor and the next page has the earlier messages in order with no overlap", async () => {
    const { a, dmId } = await dmPair("pg1", "pg2");

    const sentIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const m = unwrap(
        await messagesService.sendMessage({
          conversationId: dmId,
          senderId: a.id,
          body: `m${i}`,
        }),
      );
      sentIds.push(m.id);
    }

    const first = await messages.listMessages(dmId, { limit: 2 });
    expect(first.messages.length).toBe(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await messages.listMessages(dmId, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.messages.length).toBe(2);
    expect(second.nextCursor).not.toBeNull();

    const third = await messages.listMessages(dmId, {
      limit: 2,
      cursor: second.nextCursor ?? undefined,
    });
    expect(third.messages.length).toBe(1);
    expect(third.nextCursor).toBeNull();

    const pagedIds = [
      ...first.messages,
      ...second.messages,
      ...third.messages,
    ].map((m) => m.id);
    expect(new Set(pagedIds).size).toBe(5);

    const descSent = [...sentIds].reverse();
    expect(pagedIds).toEqual(descSent);
  });

  it("pagination defaults to newest-first ordering", async () => {
    const { a, dmId } = await dmPair("po1", "po2");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        unwrap(
          await messagesService.sendMessage({
            conversationId: dmId,
            senderId: a.id,
            body: `o${i}`,
          }),
        ).id,
      );
    }
    const page = await messages.listMessages(dmId, {});
    expect(page.messages.map((m) => m.id)).toEqual([...ids].reverse());
  });

  it("clamps a limit of zero or negative up to a single message", async () => {
    const { a, dmId } = await dmPair("lim1", "lim2");
    for (let i = 0; i < 3; i++) {
      unwrap(
        await messagesService.sendMessage({
          conversationId: dmId,
          senderId: a.id,
          body: `c${i}`,
        }),
      );
    }
    expect(
      (await messages.listMessages(dmId, { limit: 0 })).messages,
    ).toHaveLength(1);
    expect(
      (await messages.listMessages(dmId, { limit: -5 })).messages,
    ).toHaveLength(1);
  });

  it("treats a malformed cursor as a first-page request rather than throwing", async () => {
    const { a, dmId } = await dmPair("cur1", "cur2");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        unwrap(
          await messagesService.sendMessage({
            conversationId: dmId,
            senderId: a.id,
            body: `d${i}`,
          }),
        ).id,
      );
    }
    const fallback = await messages.listMessages(dmId, {
      cursor: "not-valid-base64-$$$",
    });
    expect(fallback.messages.map((m) => m.id)).toEqual([...ids].reverse());
  });

  it("deleting a message by its sender soft-deletes it: deletedAt set, body and metadata hidden", async () => {
    const { a, dmId } = await dmPair("sd1", "sd2");
    const msg = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "to be deleted",
      }),
    );

    const result = unwrap(await messagesService.deleteMessage(a.id, msg.id));
    expect(result.deletedAt).not.toBeNull();
    expect(result.body).toBeNull();
    expect(result.metadata).toBeNull();

    const row = await messages.getById(msg.id);
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.body).toBe("to be deleted");

    const page = await messages.listMessages(dmId, {});
    const listed = page.messages.find((m) => m.id === msg.id);
    expect(listed).toBeTruthy();
    expect(listed?.deletedAt).not.toBeNull();
  });

  it("a soft-deleted message stops counting toward unread", async () => {
    const { a, b, dmId } = await dmPair("du1", "du2");
    const msg = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: b.id,
        body: "fleeting",
      }),
    );
    expect(await conversations.unreadCount(dmId, a.id)).toBe(1);
    unwrap(await messagesService.deleteMessage(b.id, msg.id));
    expect(await conversations.unreadCount(dmId, a.id)).toBe(0);
  });

  it("deleting an already-deleted message stays idempotent and returns ok to the sender", async () => {
    const { a, dmId } = await dmPair("dd1", "dd2");
    const msg = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "twice",
      }),
    );
    unwrap(await messagesService.deleteMessage(a.id, msg.id));
    const again = unwrap(await messagesService.deleteMessage(a.id, msg.id));
    expect(again.deletedAt).not.toBeNull();
  });
});

if (!DB_UP) {
  describe("messages edge cases", () => {
    it.skip("skipped — database unreachable; run `bun run db:start`", () => {});
  });
}
