// End-to-end integration tests for the chat domain: friends, DMs, groups,
// messaging, and notifications — exercising the real services + repositories
// against Postgres. Run with: `bun run test:integration` (needs the DB up).
// Self-skips if the database isn't reachable so CI without a DB stays green.

import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import * as conversationsService from "../src/chat/conversations-service";
import * as friendsService from "../src/chat/friends-service";
import * as messagesService from "../src/chat/messages-service";
import type { ServiceResult } from "../src/chat/result";
import {
  conversations,
  db,
  friends,
  messages,
  notifications,
  schema,
} from "../src/db";

let DB_UP = false;
try {
  await db.execute(sql`select 1`);
  DB_UP = true;
} catch {
  DB_UP = false;
}

const createdUserIds: string[] = [];
const createdConvIds: string[] = [];

type TestUser = { id: string; username: string };

async function makeUser(label: string): Promise<TestUser> {
  const id = `itest_${label}_${crypto.randomUUID()}`;
  const username = `itest_${label}_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .insert(schema.user)
    .values({ id, name: label, email: `${id}@itest.local` });
  await db.insert(schema.userProfile).values({ userId: id, username });
  createdUserIds.push(id);
  return { id, username };
}

/** Establish an accepted friendship (request from a, accept by b). */
async function befriend(a: TestUser, b: TestUser): Promise<void> {
  await friendsService.sendFriendRequest(a.id, b.username);
  const row = await friends.getFriendshipBetween(a.id, b.id);
  await friendsService.respondToRequest(b.id, row?.id ?? "", "accept");
}

function unwrap<T>(res: ServiceResult<T>): T {
  if (!res.ok) throw new Error(`expected ok, got error: ${res.error}`);
  return res.value;
}

function expectErr<T>(res: ServiceResult<T>, status?: number): void {
  expect(res.ok).toBe(false);
  if (!res.ok && status !== undefined) expect(res.status).toBe(status);
}

async function trackDm(a: TestUser, b: TestUser): Promise<string> {
  const conv = unwrap(await conversationsService.createDm(a.id, b.id));
  createdConvIds.push(conv.id);
  return conv.id;
}

async function trackGroup(
  owner: TestUser,
  name: string,
  memberIds: string[],
): Promise<string> {
  const conv = unwrap(
    await conversationsService.createGroup(owner.id, name, memberIds),
  );
  createdConvIds.push(conv.id);
  return conv.id;
}

afterAll(async () => {
  if (!DB_UP) return;
  for (const id of createdConvIds) {
    await db
      .delete(schema.conversation)
      .where(eq(schema.conversation.id, id))
      .catch(() => {});
  }
  for (const id of createdUserIds) {
    await db
      .delete(schema.user)
      .where(eq(schema.user.id, id))
      .catch(() => {});
  }
});

describe.skipIf(!DB_UP)("friends", () => {
  it("send -> pending; addressee sees it incoming", async () => {
    const a = await makeUser("fa");
    const b = await makeUser("fb");
    const res = unwrap(
      await friendsService.sendFriendRequest(a.id, b.username),
    );
    expect(res.status).toBe("pending");
    expect(res.direction).toBe("outgoing");
    const incoming = await friends.listPendingIncoming(b.id);
    expect(incoming.some((f) => f.requesterId === a.id)).toBe(true);
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
  });

  it("accept makes both friends", async () => {
    const a = await makeUser("ga");
    const b = await makeUser("gb");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    unwrap(
      await friendsService.respondToRequest(b.id, row?.id ?? "", "accept"),
    );
    expect(await friends.areFriends(a.id, b.id)).toBe(true);
  });

  it("decline leaves them not-friends", async () => {
    const a = await makeUser("da");
    const b = await makeUser("db");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    await friendsService.respondToRequest(b.id, row?.id ?? "", "decline");
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
  });

  it("cannot friend yourself", async () => {
    const a = await makeUser("self");
    expectErr(await friendsService.sendFriendRequest(a.id, a.username), 400);
  });

  it("unknown username -> 404", async () => {
    const a = await makeUser("seek");
    expectErr(
      await friendsService.sendFriendRequest(a.id, "no_such_user_zzz"),
      404,
    );
  });

  it("duplicate request -> 409", async () => {
    const a = await makeUser("dup1");
    const b = await makeUser("dup2");
    await friendsService.sendFriendRequest(a.id, b.username);
    expectErr(await friendsService.sendFriendRequest(a.id, b.username), 409);
  });

  it("reverse request auto-accepts (mutual)", async () => {
    const a = await makeUser("rev1");
    const b = await makeUser("rev2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const res = unwrap(
      await friendsService.sendFriendRequest(b.id, a.username),
    );
    expect(res.status).toBe("accepted");
    expect(await friends.areFriends(a.id, b.id)).toBe(true);
  });

  it("only the addressee can accept", async () => {
    const a = await makeUser("acc1");
    const b = await makeUser("acc2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    // requester tries to accept their own request
    expectErr(
      await friendsService.respondToRequest(a.id, row?.id ?? "", "accept"),
      403,
    );
  });

  it("re-request after decline reopens to pending", async () => {
    const a = await makeUser("rr1");
    const b = await makeUser("rr2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    await friendsService.respondToRequest(b.id, row?.id ?? "", "decline");
    const res = unwrap(
      await friendsService.sendFriendRequest(a.id, b.username),
    );
    expect(res.status).toBe("pending");
  });

  it("remove friend clears the relationship", async () => {
    const a = await makeUser("rm1");
    const b = await makeUser("rm2");
    await befriend(a, b);
    unwrap(await friendsService.removeFriend(a.id, b.id));
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
    expect(await friends.getFriendshipBetween(a.id, b.id)).toBeNull();
  });

  it("pairKey is canonical: A->B and B->A are one row", async () => {
    const a = await makeUser("pk1");
    const b = await makeUser("pk2");
    await friendsService.sendFriendRequest(a.id, b.username);
    // same pair queried from either direction
    const fromA = await friends.getFriendshipBetween(a.id, b.id);
    const fromB = await friends.getFriendshipBetween(b.id, a.id);
    expect(fromA?.id).toBe(fromB?.id ?? "");
  });
});

describe.skipIf(!DB_UP)("direct messages", () => {
  it("friends can open a DM (deduped)", async () => {
    const a = await makeUser("dm1");
    const b = await makeUser("dm2");
    await befriend(a, b);
    const first = await trackDm(a, b);
    const second = unwrap(await conversationsService.createDm(a.id, b.id));
    expect(second.id).toBe(first); // get-or-create dedupes
    expect(second.kind).toBe("dm");
  });

  it("cannot DM a non-friend (friends-only gate)", async () => {
    const a = await makeUser("nf1");
    const c = await makeUser("nf2");
    expectErr(await conversationsService.createDm(a.id, c.id), 403);
  });

  it("cannot DM yourself", async () => {
    const a = await makeUser("dms");
    expectErr(await conversationsService.createDm(a.id, a.id), 400);
  });

  it("findDm returns an existing DM even after unfriending", async () => {
    const a = await makeUser("fd1");
    const b = await makeUser("fd2");
    await befriend(a, b);
    const dmId = await trackDm(a, b);
    await friendsService.removeFriend(a.id, b.id);
    // can't create a *new* DM with a non-friend...
    expectErr(await conversationsService.createDm(a.id, b.id), 403);
    // ...but the existing one is still openable
    const existing = await conversations.findDm(a.id, b.id);
    expect(existing?.id).toBe(dmId);
  });
});

describe.skipIf(!DB_UP)("messaging", () => {
  it("a member can send; a non-member cannot", async () => {
    const a = await makeUser("ms1");
    const b = await makeUser("ms2");
    const outsider = await makeUser("ms3");
    await befriend(a, b);
    const dmId = await trackDm(a, b);

    const sent = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "hello",
      }),
    );
    expect(sent.body).toBe("hello");

    expectErr(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: outsider.id,
        body: "intruding",
      }),
      403,
    );

    const page = await messages.listMessages(dmId, {});
    expect(page.messages.some((m) => m.body === "hello")).toBe(true);
  });

  it("rejects an empty text message", async () => {
    const a = await makeUser("mt1");
    const b = await makeUser("mt2");
    await befriend(a, b);
    const dmId = await trackDm(a, b);
    expectErr(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "   ",
      }),
      400,
    );
  });

  it("unread count + mark read", async () => {
    const a = await makeUser("ur1");
    const b = await makeUser("ur2");
    await befriend(a, b);
    const dmId = await trackDm(a, b);
    const msg = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: b.id,
        body: "yo",
      }),
    );
    expect(await conversations.unreadCount(dmId, a.id)).toBe(1);
    unwrap(await messagesService.markRead(a.id, dmId, msg.id));
    expect(await conversations.unreadCount(dmId, a.id)).toBe(0);
  });

  it("only the sender can delete their message", async () => {
    const a = await makeUser("del1");
    const b = await makeUser("del2");
    await befriend(a, b);
    const dmId = await trackDm(a, b);
    const msg = unwrap(
      await messagesService.sendMessage({
        conversationId: dmId,
        senderId: a.id,
        body: "mine",
      }),
    );
    expectErr(await messagesService.deleteMessage(b.id, msg.id), 403);
    unwrap(await messagesService.deleteMessage(a.id, msg.id));
  });
});

describe.skipIf(!DB_UP)("groups", () => {
  it("creator is owner; named members are added", async () => {
    const a = await makeUser("gc1");
    const b = await makeUser("gc2");
    const gid = await trackGroup(a, "Squad", [b.id]);
    expect(await conversations.getMemberRole(gid, a.id)).toBe("owner");
    const ids = await conversations.getMemberIds(gid);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it("owner can add a NON-friend to the group", async () => {
    const a = await makeUser("ga1");
    const stranger = await makeUser("ga2");
    const gid = await trackGroup(a, "Open", []);
    expect(await friends.areFriends(a.id, stranger.id)).toBe(false);
    unwrap(await conversationsService.addMembers(a.id, gid, [stranger.id]));
    expect(await conversations.getMemberIds(gid)).toContain(stranger.id);
  });

  it("a non-owner member cannot add members", async () => {
    const a = await makeUser("gn1");
    const b = await makeUser("gn2");
    const c = await makeUser("gn3");
    const gid = await trackGroup(a, "Locked", [b.id]);
    expectErr(await conversationsService.addMembers(b.id, gid, [c.id]), 403);
  });

  it("owner can remove a member; non-owner cannot", async () => {
    const a = await makeUser("gr1");
    const b = await makeUser("gr2");
    const c = await makeUser("gr3");
    const gid = await trackGroup(a, "Trim", [b.id, c.id]);
    // non-owner b tries to remove c
    expectErr(await conversationsService.removeMember(b.id, gid, c.id), 403);
    // owner removes c
    unwrap(await conversationsService.removeMember(a.id, gid, c.id));
    expect(await conversations.getMemberIds(gid)).not.toContain(c.id);
  });

  it("a member can leave (remove self)", async () => {
    const a = await makeUser("gl1");
    const b = await makeUser("gl2");
    const gid = await trackGroup(a, "Leavers", [b.id]);
    unwrap(await conversationsService.removeMember(b.id, gid, b.id));
    expect(await conversations.getMemberIds(gid)).not.toContain(b.id);
  });

  it("a removed member can no longer post", async () => {
    const a = await makeUser("gp1");
    const b = await makeUser("gp2");
    const gid = await trackGroup(a, "NoPost", [b.id]);
    unwrap(await conversationsService.removeMember(a.id, gid, b.id));
    expectErr(
      await messagesService.sendMessage({
        conversationId: gid,
        senderId: b.id,
        body: "still here?",
      }),
      403,
    );
  });

  it("only owner/admin can rename", async () => {
    const a = await makeUser("gx1");
    const b = await makeUser("gx2");
    const gid = await trackGroup(a, "Old name", [b.id]);
    expectErr(await conversationsService.renameGroup(b.id, gid, "Hax"), 403);
    const renamed = unwrap(
      await conversationsService.renameGroup(a.id, gid, "New name"),
    );
    expect(renamed.name).toBe("New name");
  });

  it("createGroup drops unresolvable member ids", async () => {
    const a = await makeUser("gd1");
    const b = await makeUser("gd2");
    const gid = await trackGroup(a, "Filtered", [b.id, "ghost-id-xyz"]);
    const ids = await conversations.getMemberIds(gid);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain("ghost-id-xyz");
    expect(ids.length).toBe(2);
  });

  it("group requires a non-empty name", async () => {
    const a = await makeUser("ge1");
    expectErr(await conversationsService.createGroup(a.id, "   ", []), 400);
  });
});

describe.skipIf(!DB_UP)("notifications", () => {
  it("a friend request notifies the addressee, not the actor", async () => {
    const a = await makeUser("na1");
    const b = await makeUser("nb1");
    await friendsService.sendFriendRequest(a.id, b.username);
    const forB = await notifications.listForUser(b.id, {});
    expect(
      forB.notifications.some(
        (n) => n.type === "friend_request" && n.actorId === a.id,
      ),
    ).toBe(true);
    const forA = await notifications.listForUser(a.id, {});
    expect(forA.notifications.some((n) => n.type === "friend_request")).toBe(
      false,
    );
  });

  it("accepting notifies the requester", async () => {
    const a = await makeUser("na2");
    const b = await makeUser("nb2");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    await friendsService.respondToRequest(b.id, row?.id ?? "", "accept");
    const forA = await notifications.listForUser(a.id, {});
    expect(
      forA.notifications.some(
        (n) => n.type === "friend_accepted" && n.actorId === b.id,
      ),
    ).toBe(true);
  });

  it("answering a request resolves its actionable notification", async () => {
    const a = await makeUser("na3");
    const b = await makeUser("nb3");
    await friendsService.sendFriendRequest(a.id, b.username);
    const row = await friends.getFriendshipBetween(a.id, b.id);
    const beforeUnread = await notifications.unreadCount(b.id);
    expect(beforeUnread).toBeGreaterThan(0);
    await friendsService.respondToRequest(b.id, row?.id ?? "", "accept");
    // the friend_request notification was marked read on resolution
    expect(await notifications.unreadCount(b.id)).toBeLessThan(beforeUnread);
  });
});

// Visible signal when the suite is skipped for lack of a database.
describe.skipIf(DB_UP)("chat integration (skipped)", () => {
  it("database not reachable — run `bun run db:start` then retry", () => {
    expect(DB_UP).toBe(false);
  });
});
