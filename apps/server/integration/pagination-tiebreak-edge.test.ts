import { afterAll, describe, expect, it } from "bun:test";
import { db, messages, notifications, schema } from "@kyzen/database";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("ptb");

afterAll(h.cleanup);

async function insertMessageAt(
  conversationId: string,
  senderId: string,
  body: string,
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(schema.message)
    .values({ conversationId, senderId, kind: "text", body, createdAt })
    .returning({ id: schema.message.id });
  if (!row) throw new Error("failed to insert message");
  return row.id;
}

async function insertNotificationAt(
  userId: string,
  actorId: string,
  requestId: string,
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(schema.notification)
    .values({
      userId,
      type: "friend_request",
      actorId,
      payload: { requestId },
      createdAt,
    })
    .returning({ id: schema.notification.id });
  if (!row) throw new Error("failed to insert notification");
  return row.id;
}

describe.skipIf(!DB_UP)(
  "keyset cursor tie-break on identical createdAt",
  () => {
    it("messages with the same createdAt page deterministically by id-desc with no overlap or skips", async () => {
      const a = await h.makeUser("mta");
      const b = await h.makeUser("mtb");
      const dmId = await h.makeDm(a, b);

      const sameInstant = new Date("2024-01-01T00:00:00.000Z");
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        ids.push(await insertMessageAt(dmId, a.id, `same-${i}`, sameInstant));
      }

      const expectedOrder = [...ids].sort((x, y) =>
        x < y ? 1 : x > y ? -1 : 0,
      );

      const walked: string[] = [];
      let cursor: string | undefined;
      let guard = 0;
      while (guard < 20) {
        guard++;
        const page = await messages.listMessages(dmId, { limit: 2, cursor });
        for (const m of page.messages) walked.push(m.id);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(walked).toEqual(expectedOrder);
      expect(new Set(walked).size).toBe(ids.length);
    });

    it("messages crossing a createdAt boundary keep older timestamps after newer ones, ties broken by id-desc", async () => {
      const a = await h.makeUser("mbx");
      const b = await h.makeUser("mby");
      const dmId = await h.makeDm(a, b);

      const older = new Date("2024-02-01T00:00:00.000Z");
      const newer = new Date("2024-02-01T00:00:01.000Z");
      const olderIds: string[] = [];
      const newerIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        olderIds.push(await insertMessageAt(dmId, a.id, `old-${i}`, older));
      }
      for (let i = 0; i < 3; i++) {
        newerIds.push(await insertMessageAt(dmId, a.id, `new-${i}`, newer));
      }

      const descById = (xs: string[]) =>
        [...xs].sort((x, y) => (x < y ? 1 : x > y ? -1 : 0));
      const expected = [...descById(newerIds), ...descById(olderIds)];

      const walked: string[] = [];
      let cursor: string | undefined;
      let guard = 0;
      while (guard < 20) {
        guard++;
        const page = await messages.listMessages(dmId, { limit: 2, cursor });
        for (const m of page.messages) walked.push(m.id);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(walked).toEqual(expected);
    });

    it("notifications with the same createdAt page deterministically by id-desc", async () => {
      const recipient = await h.makeUser("nta");
      const actor = await h.makeUser("ntb");

      const sameInstant = new Date("2024-03-01T00:00:00.000Z");
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(
          await insertNotificationAt(
            recipient.id,
            actor.id,
            `req-${i}`,
            sameInstant,
          ),
        );
      }

      const expectedOrder = [...ids].sort((x, y) =>
        x < y ? 1 : x > y ? -1 : 0,
      );

      const walked: string[] = [];
      let cursor: string | undefined;
      let guard = 0;
      while (guard < 20) {
        guard++;
        const page = await notifications.listForUser(recipient.id, {
          limit: 2,
          cursor,
        });
        for (const n of page.notifications) walked.push(n.id);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(walked).toEqual(expectedOrder);
      expect(new Set(walked).size).toBe(ids.length);
    });
  },
);

describe.skipIf(!DB_UP)(
  "keyset pagination limit clamping at the upper bound",
  () => {
    it("listMessages caps a limit above the maximum to 100 rows", async () => {
      const a = await h.makeUser("lca");
      const b = await h.makeUser("lcb");
      const dmId = await h.makeDm(a, b);

      const base = new Date("2024-04-01T00:00:00.000Z");
      for (let i = 0; i < 101; i++) {
        await insertMessageAt(
          dmId,
          a.id,
          `cap-${i}`,
          new Date(base.getTime() + i),
        );
      }

      const page = await messages.listMessages(dmId, { limit: 1000 });
      expect(page.messages.length).toBe(100);
      expect(page.nextCursor).not.toBeNull();
    });

    it("listForUser caps a limit above the maximum to 100 rows", async () => {
      const recipient = await h.makeUser("lna");
      const actor = await h.makeUser("lnb");

      const base = new Date("2024-05-01T00:00:00.000Z");
      for (let i = 0; i < 101; i++) {
        await insertNotificationAt(
          recipient.id,
          actor.id,
          `cap-${i}`,
          new Date(base.getTime() + i),
        );
      }

      const page = await notifications.listForUser(recipient.id, {
        limit: 1000,
      });
      expect(page.notifications.length).toBe(100);
      expect(page.nextCursor).not.toBeNull();
    });
  },
);

if (!DB_UP) {
  describe("pagination tie-break edge cases", () => {
    it.skip("skipped - database unreachable; run `bun run db:start`", () => {});
  });
}
