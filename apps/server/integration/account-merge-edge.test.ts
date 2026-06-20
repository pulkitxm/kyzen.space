import { afterAll, describe, expect, it } from "bun:test";
import { accountMerge, db, friends, schema } from "@kyzen/database";
import { and, eq, or } from "drizzle-orm";
import { createHarness, DB_UP, type TestUser } from "./harness";

const h = createHarness("ame");

afterAll(h.cleanup);

async function makeFriendship(
  requester: TestUser,
  addressee: TestUser,
  status: "pending" | "accepted" | "declined",
): Promise<void> {
  await db.insert(schema.friendship).values({
    requesterId: requester.id,
    addresseeId: addressee.id,
    pairKey: friends.pairKey(requester.id, addressee.id),
    status,
  });
}

async function makeDmWith(a: TestUser, b: TestUser): Promise<string> {
  const [conv] = await db
    .insert(schema.conversation)
    .values({
      kind: "dm",
      dmKey: friends.pairKey(a.id, b.id),
      createdBy: a.id,
    })
    .returning();
  if (!conv) throw new Error("no conv");
  await db.insert(schema.conversationMember).values([
    { conversationId: conv.id, userId: a.id, role: "member" },
    { conversationId: conv.id, userId: b.id, role: "member" },
  ]);
  return conv.id;
}

async function statsOf(userId: string): Promise<unknown> {
  const [profile] = await db
    .select({ stats: schema.userProfile.stats })
    .from(schema.userProfile)
    .where(eq(schema.userProfile.userId, userId));
  return profile?.stats ?? null;
}

describe.skipIf(!DB_UP)("account merge edge", () => {
  it("re-points the anon profile to the target when the target has no profile row (anon stats preserved)", async () => {
    const anon = await h.makeUser("np_anon");
    const target = await h.makeUser("np_target");
    await db
      .update(schema.userProfile)
      .set({ stats: { ttt: { played: 5, won: 3, lost: 2, drawn: 0 } } })
      .where(eq(schema.userProfile.userId, anon.id));
    await db
      .delete(schema.userProfile)
      .where(eq(schema.userProfile.userId, target.id));

    await accountMerge.mergeAccounts(anon.id, target.id);

    expect(await statsOf(target.id)).toEqual({
      ttt: { played: 5, won: 3, lost: 2, drawn: 0 },
    });
    expect(await statsOf(anon.id)).toBeNull();
    const [aUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, anon.id));
    expect(aUser).toBeUndefined();
  });

  it("keeps pending over declined when anon edge outranks the existing target edge", async () => {
    const anon = await h.makeUser("fd1_anon");
    const target = await h.makeUser("fd1_target");
    const other = await h.makeUser("fd1_other");
    await makeFriendship(anon, other, "pending");
    await makeFriendship(target, other, "declined");

    await accountMerge.mergeAccounts(anon.id, target.id);

    const rows = await db
      .select()
      .from(schema.friendship)
      .where(
        eq(schema.friendship.pairKey, friends.pairKey(target.id, other.id)),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("keeps pending over declined when the existing target edge outranks the anon edge", async () => {
    const anon = await h.makeUser("fd2_anon");
    const target = await h.makeUser("fd2_target");
    const other = await h.makeUser("fd2_other");
    await makeFriendship(anon, other, "declined");
    await makeFriendship(target, other, "pending");

    await accountMerge.mergeAccounts(anon.id, target.id);

    const rows = await db
      .select()
      .from(schema.friendship)
      .where(
        eq(schema.friendship.pairKey, friends.pairKey(target.id, other.id)),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });

  it("keeps accepted on an exact accepted-vs-accepted tie and collapses to one edge", async () => {
    const anon = await h.makeUser("ft_anon");
    const target = await h.makeUser("ft_target");
    const other = await h.makeUser("ft_other");
    await makeFriendship(anon, other, "accepted");
    await makeFriendship(target, other, "accepted");

    await accountMerge.mergeAccounts(anon.id, target.id);

    const rows = await db
      .select()
      .from(schema.friendship)
      .where(
        eq(schema.friendship.pairKey, friends.pairKey(target.id, other.id)),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("accepted");
  });

  it("recomputes the sorted pairKey when the re-pointed edge has target < other", async () => {
    const anon = await h.makeUser("pk1_anon");
    const target = await h.makeUser("pk1_target");
    const other = await h.makeUser("pk1_other");
    await makeFriendship(other, anon, "accepted");

    await accountMerge.mergeAccounts(anon.id, target.id);

    const expectedKey = friends.pairKey(target.id, other.id);
    const [row] = await db
      .select()
      .from(schema.friendship)
      .where(eq(schema.friendship.pairKey, expectedKey));
    expect(row?.status).toBe("accepted");
    expect(row?.pairKey).toBe([target.id, other.id].sort().join(":"));
    expect(
      row?.requesterId === target.id || row?.addresseeId === target.id,
    ).toBe(true);
    expect(row?.requesterId === other.id || row?.addresseeId === other.id).toBe(
      true,
    );
  });

  it("recomputes the sorted pairKey when the re-pointed edge has other < target", async () => {
    const anon = await h.makeUser("pk2_anon");
    const target = await h.makeUser("pk2_target");
    const other = await h.makeUser("pk2_other");
    await makeFriendship(anon, other, "accepted");

    await accountMerge.mergeAccounts(anon.id, target.id);

    const expectedKey = friends.pairKey(target.id, other.id);
    const [row] = await db
      .select()
      .from(schema.friendship)
      .where(eq(schema.friendship.pairKey, expectedKey));
    expect(row?.pairKey).toBe([other.id, target.id].sort().join(":"));
    expect(
      row?.requesterId === target.id || row?.addresseeId === target.id,
    ).toBe(true);
  });

  it("re-points a DM whose dmKey is not the anon/target pair (not treated as self-DM)", async () => {
    const anon = await h.makeUser("od_anon");
    const target = await h.makeUser("od_target");
    const stranger = await h.makeUser("od_stranger");
    const convId = await makeDmWith(anon, stranger);

    await accountMerge.mergeAccounts(anon.id, target.id);

    const members = await db
      .select()
      .from(schema.conversationMember)
      .where(eq(schema.conversationMember.conversationId, convId));
    expect(members.some((m) => m.userId === anon.id)).toBe(false);
    expect(members.filter((m) => m.userId === target.id)).toHaveLength(1);
    expect(members.filter((m) => m.userId === stranger.id)).toHaveLength(1);
  });

  it("keeps a notification whose actor differs from the recipient after re-point", async () => {
    const anon = await h.makeUser("nk_anon");
    const target = await h.makeUser("nk_target");
    const actor = await h.makeUser("nk_actor");
    await db.insert(schema.notification).values({
      userId: anon.id,
      type: "friend_request",
      actorId: actor.id,
      payload: { requestId: "keep" },
    });

    await accountMerge.mergeAccounts(anon.id, target.id);

    const rows = await db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, target.id),
          eq(schema.notification.actorId, actor.id),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({ requestId: "keep" });
  });

  it("discard is a no-op on games for an anon with zero seats and still deletes the user", async () => {
    const anon = await h.makeUser("dz_anon");
    const real = await h.makeUser("dz_real");
    const [keep] = await db
      .insert(schema.game)
      .values({ gameType: "tic-tac-toe", status: "active" })
      .returning();
    const keepId = keep?.id ?? "";
    h.trackGame(keepId);
    await db.insert(schema.gamePlayer).values({
      gameId: keepId,
      userId: real.id,
      username: real.username,
      role: "X",
      seatOrder: 0,
    });

    await accountMerge.deleteAnonUserData(anon.id);

    const [keepRow] = await db
      .select()
      .from(schema.game)
      .where(eq(schema.game.id, keepId));
    expect(keepRow?.id).toBe(keepId);
    const [aUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, anon.id));
    expect(aUser).toBeUndefined();
  });

  it("summarizeAnonAccount counts game seats and never returns the temp email or raw rows", async () => {
    const anon = await h.makeUser("sg_anon");
    const tempEmail = `temp-${crypto.randomUUID()}@anon.local`;
    await db
      .update(schema.user)
      .set({ email: tempEmail })
      .where(eq(schema.user.id, anon.id));
    const [g] = await db
      .insert(schema.game)
      .values({ gameType: "tic-tac-toe", status: "active" })
      .returning();
    const gameId = g?.id ?? "";
    h.trackGame(gameId);
    await db.insert(schema.gamePlayer).values({
      gameId,
      userId: anon.id,
      username: anon.username,
      role: "X",
      seatOrder: 0,
    });

    const summary = await accountMerge.summarizeAnonAccount(anon.id);

    expect(summary.games).toBe(1);
    expect(Object.keys(summary).sort()).toEqual([
      "conversations",
      "friends",
      "games",
      "statLines",
    ]);
    const raw = JSON.stringify(summary);
    expect(raw).not.toContain(tempEmail);
    expect(raw).not.toContain(anon.id);
    expect(raw).not.toContain(anon.username);
  });

  it("getPendingForTarget returns the most recent pending row for the target", async () => {
    const olderAnon = await h.makeUser("pf_old");
    const newerAnon = await h.makeUser("pf_new");
    const target = await h.makeUser("pf_target");
    await db.insert(schema.accountMerge).values({
      anonUserId: olderAnon.id,
      targetUserId: target.id,
      status: "pending",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const [newer] = await db
      .insert(schema.accountMerge)
      .values({
        anonUserId: newerAnon.id,
        targetUserId: target.id,
        status: "pending",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      })
      .returning();

    const pending = await accountMerge.getPendingForTarget(target.id);
    expect(pending?.id).toBe(newer?.id);
    expect(pending?.anonUserId).toBe(newerAnon.id);

    await db
      .delete(schema.accountMerge)
      .where(eq(schema.accountMerge.targetUserId, target.id));
  });

  it("getPendingForTarget ignores resolved rows and self-friendship collapse with anon-as-requester", async () => {
    const anon = await h.makeUser("rs_anon");
    const target = await h.makeUser("rs_target");
    const [resolved] = await db
      .insert(schema.accountMerge)
      .values({
        anonUserId: anon.id,
        targetUserId: target.id,
        status: "confirmed",
        resolvedAt: new Date(),
      })
      .returning();
    expect(resolved?.status).toBe("confirmed");

    const pending = await accountMerge.getPendingForTarget(target.id);
    expect(pending).toBeNull();

    await makeFriendship(target, anon, "accepted");
    await accountMerge.mergeAccounts(anon.id, target.id);
    const rows = await db
      .select()
      .from(schema.friendship)
      .where(
        or(
          eq(schema.friendship.requesterId, target.id),
          eq(schema.friendship.addresseeId, target.id),
        ),
      );
    expect(rows).toHaveLength(0);

    await db
      .delete(schema.accountMerge)
      .where(eq(schema.accountMerge.targetUserId, target.id));
  });
});
