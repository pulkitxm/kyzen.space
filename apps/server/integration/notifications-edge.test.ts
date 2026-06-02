import { afterAll, describe, expect, it } from "bun:test";
import * as friendsService from "../src/chat/friends-service";
import { friends, notifications } from "../src/db";
import { createHarness, DB_UP, type TestUser, unwrap } from "./harness";

const h = createHarness("ne");

afterAll(h.cleanup);

async function sendRequestNotification(
  from: TestUser,
  to: TestUser,
): Promise<string> {
  unwrap(await friendsService.sendFriendRequest(from.id, to.username));
  const row = await friends.getFriendshipBetween(from.id, to.id);
  if (!row) throw new Error("expected friendship row after request");
  return row.id;
}

function must<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${label} to be present`);
  }
  return value;
}

describe.skipIf(!DB_UP)("notifications edge cases", () => {
  it("markRead sets readAt on the single notification and decrements unreadCount by one", async () => {
    const recipient = await h.makeUser("mr_to");
    const senderOne = await h.makeUser("mr_s1");
    const senderTwo = await h.makeUser("mr_s2");

    await sendRequestNotification(senderOne, recipient);
    await sendRequestNotification(senderTwo, recipient);

    const before = await notifications.unreadCount(recipient.id);
    expect(before).toBe(2);

    const page = await notifications.listForUser(recipient.id, {});
    const target = page.notifications[0];
    expect(target).toBeDefined();
    expect(target?.readAt).toBeNull();

    const updated = await notifications.markRead(
      must(target, "notification").id,
      recipient.id,
    );
    expect(updated).not.toBeNull();
    expect(updated?.readAt).not.toBeNull();

    const fetched = await notifications.getById(
      must(target, "notification").id,
    );
    expect(fetched?.readAt).not.toBeNull();

    const after = await notifications.unreadCount(recipient.id);
    expect(after).toBe(before - 1);
  });

  it("markRead returns null and does not change count when already read", async () => {
    const recipient = await h.makeUser("mr2_to");
    const sender = await h.makeUser("mr2_s");

    await sendRequestNotification(sender, recipient);
    const page = await notifications.listForUser(recipient.id, {});
    const target = page.notifications[0];
    expect(target).toBeDefined();

    const first = await notifications.markRead(
      must(target, "notification").id,
      recipient.id,
    );
    expect(first).not.toBeNull();

    const second = await notifications.markRead(
      must(target, "notification").id,
      recipient.id,
    );
    expect(second).toBeNull();

    expect(await notifications.unreadCount(recipient.id)).toBe(0);
  });

  it("markRead does not affect notifications owned by another user", async () => {
    const recipient = await h.makeUser("mr3_to");
    const sender = await h.makeUser("mr3_s");
    const stranger = await h.makeUser("mr3_x");

    await sendRequestNotification(sender, recipient);
    const page = await notifications.listForUser(recipient.id, {});
    const target = page.notifications[0];
    expect(target).toBeDefined();

    const result = await notifications.markRead(
      must(target, "notification").id,
      stranger.id,
    );
    expect(result).toBeNull();

    const fetched = await notifications.getById(
      must(target, "notification").id,
    );
    expect(fetched?.readAt).toBeNull();
    expect(await notifications.unreadCount(recipient.id)).toBe(1);
  });

  it("markAllRead drives unreadCount to zero across several unread notifications", async () => {
    const recipient = await h.makeUser("mar_to");
    const senders = await Promise.all([
      h.makeUser("mar_s1"),
      h.makeUser("mar_s2"),
      h.makeUser("mar_s3"),
    ]);
    for (const sender of senders) {
      await sendRequestNotification(sender, recipient);
    }

    expect(await notifications.unreadCount(recipient.id)).toBe(senders.length);

    await notifications.markAllRead(recipient.id);

    expect(await notifications.unreadCount(recipient.id)).toBe(0);

    const page = await notifications.listForUser(recipient.id, {});
    expect(page.notifications.length).toBe(senders.length);
    for (const n of page.notifications) {
      expect(n.readAt).not.toBeNull();
    }
  });

  it("markAllRead on a user with no unread notifications is a no-op", async () => {
    const recipient = await h.makeUser("mar2_to");
    expect(await notifications.unreadCount(recipient.id)).toBe(0);
    await notifications.markAllRead(recipient.id);
    expect(await notifications.unreadCount(recipient.id)).toBe(0);
  });

  it("unreadCount counts only unread notifications after marking some read", async () => {
    const recipient = await h.makeUser("uc_to");
    const senders = await Promise.all([
      h.makeUser("uc_s1"),
      h.makeUser("uc_s2"),
      h.makeUser("uc_s3"),
      h.makeUser("uc_s4"),
    ]);
    for (const sender of senders) {
      await sendRequestNotification(sender, recipient);
    }

    expect(await notifications.unreadCount(recipient.id)).toBe(senders.length);

    const page = await notifications.listForUser(recipient.id, {});
    await notifications.markRead(
      must(page.notifications[0], "notification").id,
      recipient.id,
    );
    await notifications.markRead(
      must(page.notifications[1], "notification").id,
      recipient.id,
    );

    expect(await notifications.unreadCount(recipient.id)).toBe(
      senders.length - 2,
    );
  });

  it("listForUser paginates with a small limit, returns a nextCursor, and the second page has no overlap and correct ordering", async () => {
    const recipient = await h.makeUser("pg_to");
    const senderCount = 5;
    const senders: TestUser[] = [];
    for (let i = 0; i < senderCount; i++) {
      const sender = await h.makeUser(`pg_s${i}`);
      senders.push(sender);
      await sendRequestNotification(sender, recipient);
    }

    const limit = 2;
    const firstPage = await notifications.listForUser(recipient.id, { limit });
    expect(firstPage.notifications.length).toBe(limit);
    expect(firstPage.nextCursor).not.toBeNull();

    const firstTimes = firstPage.notifications.map((n) =>
      new Date(n.createdAt).getTime(),
    );
    for (let i = 1; i < firstTimes.length; i++) {
      expect(must(firstTimes[i - 1], "time")).toBeGreaterThanOrEqual(
        must(firstTimes[i], "time"),
      );
    }

    const secondPage = await notifications.listForUser(recipient.id, {
      limit,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.notifications.length).toBe(limit);

    const firstIds = new Set(firstPage.notifications.map((n) => n.id));
    for (const n of secondPage.notifications) {
      expect(firstIds.has(n.id)).toBe(false);
    }

    const lastOfFirst = new Date(
      must(
        firstPage.notifications[firstPage.notifications.length - 1],
        "notification",
      ).createdAt,
    ).getTime();
    const firstOfSecond = new Date(
      must(secondPage.notifications[0], "notification").createdAt,
    ).getTime();
    expect(firstOfSecond).toBeLessThanOrEqual(lastOfFirst);

    const thirdPage = await notifications.listForUser(recipient.id, {
      limit,
      cursor: secondPage.nextCursor ?? undefined,
    });
    expect(thirdPage.notifications.length).toBe(senderCount - 2 * limit);
    expect(thirdPage.nextCursor).toBeNull();

    const allIds = [
      ...firstPage.notifications,
      ...secondPage.notifications,
      ...thirdPage.notifications,
    ].map((n) => n.id);
    expect(new Set(allIds).size).toBe(senderCount);
  });

  it("listForUser caps the limit and walks the whole set without duplicates", async () => {
    const recipient = await h.makeUser("pg2_to");
    const senderCount = 4;
    for (let i = 0; i < senderCount; i++) {
      const sender = await h.makeUser(`pg2_s${i}`);
      await sendRequestNotification(sender, recipient);
    }

    const seen = new Set<string>();
    let cursor: string | undefined;
    let guard = 0;
    while (guard < 20) {
      guard++;
      const page = await notifications.listForUser(recipient.id, {
        limit: 1,
        cursor,
      });
      for (const n of page.notifications) seen.add(n.id);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(senderCount);
  });

  it("listForUser unreadOnly excludes read notifications", async () => {
    const recipient = await h.makeUser("uo_to");
    const senders = await Promise.all([
      h.makeUser("uo_s1"),
      h.makeUser("uo_s2"),
      h.makeUser("uo_s3"),
    ]);
    for (const sender of senders) {
      await sendRequestNotification(sender, recipient);
    }

    const all = await notifications.listForUser(recipient.id, {});
    await notifications.markRead(
      must(all.notifications[0], "notification").id,
      recipient.id,
    );

    const unread = await notifications.listForUser(recipient.id, {
      unreadOnly: true,
    });
    expect(unread.notifications.length).toBe(senders.length - 1);
    for (const n of unread.notifications) {
      expect(n.readAt).toBeNull();
    }
  });

  it("resolveByRequestId resolves the actionable friend_request notification and marks it read", async () => {
    const recipient = await h.makeUser("rs_to");
    const sender = await h.makeUser("rs_s");

    const requestId = await sendRequestNotification(sender, recipient);

    const before = await notifications.listForUser(recipient.id, {});
    const actionable = before.notifications.find(
      (n) => n.type === "friend_request" && n.payload?.requestId === requestId,
    );
    expect(actionable).toBeDefined();
    expect(actionable?.resolvedAt).toBeNull();
    expect(actionable?.readAt).toBeNull();

    await notifications.resolveByRequestId(
      recipient.id,
      "friend_request",
      requestId,
    );

    const resolved = await notifications.getById(
      must(actionable, "notification").id,
    );
    expect(resolved?.resolvedAt).not.toBeNull();
    expect(resolved?.readAt).not.toBeNull();
    expect(await notifications.unreadCount(recipient.id)).toBe(0);
  });

  it("resolveByRequestId only resolves notifications matching the request id", async () => {
    const recipient = await h.makeUser("rs2_to");
    const senderOne = await h.makeUser("rs2_s1");
    const senderTwo = await h.makeUser("rs2_s2");

    const requestOne = await sendRequestNotification(senderOne, recipient);
    const requestTwo = await sendRequestNotification(senderTwo, recipient);

    await notifications.resolveByRequestId(
      recipient.id,
      "friend_request",
      requestOne,
    );

    const page = await notifications.listForUser(recipient.id, {});
    const forOne = page.notifications.find(
      (n) => n.payload?.requestId === requestOne,
    );
    const forTwo = page.notifications.find(
      (n) => n.payload?.requestId === requestTwo,
    );
    expect(forOne?.resolvedAt).not.toBeNull();
    expect(forTwo?.resolvedAt).toBeNull();
    expect(forTwo?.readAt).toBeNull();
    expect(await notifications.unreadCount(recipient.id)).toBe(1);
  });

  it("declining a friend request creates no notification for the requester", async () => {
    const requester = await h.makeUser("dc_req");
    const addressee = await h.makeUser("dc_addr");

    const requestId = await sendRequestNotification(requester, addressee);

    const beforeAddresseeUnread = await notifications.unreadCount(addressee.id);
    expect(beforeAddresseeUnread).toBe(1);

    unwrap(
      await friendsService.respondToRequest(addressee.id, requestId, "decline"),
    );

    const requesterNotes = await notifications.listForUser(requester.id, {});
    expect(requesterNotes.notifications.length).toBe(0);
    expect(await notifications.unreadCount(requester.id)).toBe(0);

    const addresseePage = await notifications.listForUser(addressee.id, {});
    const requestNote = addresseePage.notifications.find(
      (n) => n.payload?.requestId === requestId,
    );
    expect(requestNote?.resolvedAt).not.toBeNull();
    expect(await notifications.unreadCount(addressee.id)).toBe(0);
  });

  it("notify suppresses self-targeted notifications when actor equals recipient", async () => {
    const recipient = await h.makeUser("self_to");
    const before = await notifications.unreadCount(recipient.id);
    const { notify } = await import("../src/realtime/notify");
    await notify(recipient.id, "friend_request", {
      actorId: recipient.id,
      payload: { requestId: "self-loop" },
    });
    expect(await notifications.unreadCount(recipient.id)).toBe(before);
  });
});
