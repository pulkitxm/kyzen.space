import { afterAll, describe, expect, it } from "bun:test";
import { accountMerge, db, friends, schema } from "@gamelobby/database";
import { and, eq, or } from "drizzle-orm";
import { createHarness, DB_UP, type TestUser } from "./harness";

const h = createHarness("am");

afterAll(h.cleanup);

async function makeFriendship(
  requester: TestUser,
  addressee: TestUser,
  status: "pending" | "accepted",
): Promise<void> {
  await db.insert(schema.friendship).values({
    requesterId: requester.id,
    addresseeId: addressee.id,
    pairKey: friends.pairKey(requester.id, addressee.id),
    status,
  });
}

async function makeDmConversation(a: TestUser, b: TestUser): Promise<string> {
  const [conv] = await db
    .insert(schema.conversation)
    .values({
      kind: "dm",
      dmKey: [a.id, b.id].sort().join(":"),
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

describe.skipIf(!DB_UP)("account merge", () => {
  it("recordPending writes a pending row and getPendingForTarget reads it", async () => {
    const anon = await h.makeUser("rp_anon");
    const target = await h.makeUser("rp_target");
    const row = await accountMerge.recordPending(anon.id, target.id);
    expect(row.status).toBe("pending");
    expect(row.resolvedAt).toBeNull();
    const pending = await accountMerge.getPendingForTarget(target.id);
    expect(pending?.id).toBe(row.id);
    expect(pending?.anonUserId).toBe(anon.id);
  });

  it("recordPending rejects merging an account into itself", async () => {
    const u = await h.makeUser("rp_self");
    await expect(accountMerge.recordPending(u.id, u.id)).rejects.toThrow();
  });

  it("markResolved only resolves a pending row and is idempotent", async () => {
    const anon = await h.makeUser("mr_anon");
    const target = await h.makeUser("mr_target");
    const row = await accountMerge.recordPending(anon.id, target.id);
    const first = await accountMerge.markResolved(row.id, "confirmed");
    expect(first?.status).toBe("confirmed");
    expect(first?.resolvedAt).not.toBeNull();
    const second = await accountMerge.markResolved(row.id, "discarded");
    expect(second).toBeNull();
  });

  it("summarizeAnonAccount returns counts only (privacy-safe)", async () => {
    const anon = await h.makeUser("sum_anon");
    const other = await h.makeUser("sum_other");
    await makeFriendship(anon, other, "accepted");
    const convId = await makeDmConversation(anon, other);
    await db
      .update(schema.userProfile)
      .set({ stats: { ttt: { played: 2, won: 1, lost: 1, drawn: 0 } } })
      .where(eq(schema.userProfile.userId, anon.id));
    const summary = await accountMerge.summarizeAnonAccount(anon.id);
    expect(summary.friends).toBe(1);
    expect(summary.conversations).toBe(1);
    expect(summary.statLines).toBe(1);
    expect(Object.keys(summary)).toEqual([
      "games",
      "conversations",
      "friends",
      "statLines",
    ]);
    void convId;
  });

  it("merge sums profile stats per gameType and deletes the anon profile + user", async () => {
    const anon = await h.makeUser("st_anon");
    const target = await h.makeUser("st_target");
    await db
      .update(schema.userProfile)
      .set({ stats: { ttt: { played: 3, won: 2, lost: 1, drawn: 0 } } })
      .where(eq(schema.userProfile.userId, anon.id));
    await db
      .update(schema.userProfile)
      .set({ stats: { ttt: { played: 1, won: 0, lost: 0, drawn: 1 } } })
      .where(eq(schema.userProfile.userId, target.id));

    await accountMerge.mergeAccounts(anon.id, target.id);

    const [tProfile] = await db
      .select()
      .from(schema.userProfile)
      .where(eq(schema.userProfile.userId, target.id));
    expect(tProfile?.stats.ttt).toEqual({
      played: 4,
      won: 2,
      lost: 1,
      drawn: 1,
    });
    const [aProfile] = await db
      .select()
      .from(schema.userProfile)
      .where(eq(schema.userProfile.userId, anon.id));
    expect(aProfile).toBeUndefined();
    const [aUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, anon.id));
    expect(aUser).toBeUndefined();
  });

  it("collapses a self-friendship (anon friends-with target -> deleted)", async () => {
    const anon = await h.makeUser("sf_anon");
    const target = await h.makeUser("sf_target");
    await makeFriendship(anon, target, "accepted");
    await accountMerge.mergeAccounts(anon.id, target.id);
    const [row] = await db
      .select()
      .from(schema.friendship)
      .where(
        eq(schema.friendship.pairKey, friends.pairKey(anon.id, target.id)),
      );
    expect(row).toBeUndefined();
  });

  it("dedupes friendships keeping accepted over pending and recomputes pairKey", async () => {
    const anon = await h.makeUser("df_anon");
    const target = await h.makeUser("df_target");
    const other = await h.makeUser("df_other");
    await makeFriendship(anon, other, "accepted");
    await makeFriendship(target, other, "pending");
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
    const toOther = rows.filter(
      (r) => r.requesterId === other.id || r.addresseeId === other.id,
    );
    expect(toOther).toHaveLength(1);
    expect(toOther[0]?.status).toBe("accepted");
    expect(toOther[0]?.pairKey).toBe(friends.pairKey(target.id, other.id));
  });

  it("re-points a friendship to a stranger and recomputes pairKey when target has no edge", async () => {
    const anon = await h.makeUser("rep_anon");
    const target = await h.makeUser("rep_target");
    const other = await h.makeUser("rep_other");
    await makeFriendship(anon, other, "accepted");
    await accountMerge.mergeAccounts(anon.id, target.id);
    const [row] = await db
      .select()
      .from(schema.friendship)
      .where(
        eq(schema.friendship.pairKey, friends.pairKey(target.id, other.id)),
      );
    expect(row?.status).toBe("accepted");
    expect(
      row?.requesterId === target.id || row?.addresseeId === target.id,
    ).toBe(true);
  });

  it("collapses a self-DM (anon+target two-member DM -> anon membership dropped)", async () => {
    const anon = await h.makeUser("sd_anon");
    const target = await h.makeUser("sd_target");
    const convId = await makeDmConversation(anon, target);
    await accountMerge.mergeAccounts(anon.id, target.id);
    const members = await db
      .select()
      .from(schema.conversationMember)
      .where(eq(schema.conversationMember.conversationId, convId));
    expect(members.some((m) => m.userId === anon.id)).toBe(false);
    const targetMembers = members.filter((m) => m.userId === target.id);
    expect(targetMembers).toHaveLength(1);
  });

  it("drops anon membership when target already a member of the same conversation", async () => {
    const anon = await h.makeUser("bm_anon");
    const target = await h.makeUser("bm_target");
    const other = await h.makeUser("bm_other");
    const [conv] = await db
      .insert(schema.conversation)
      .values({ kind: "group", name: "g", createdBy: other.id })
      .returning();
    const convId = conv?.id ?? "";
    await db.insert(schema.conversationMember).values([
      { conversationId: convId, userId: other.id, role: "owner" },
      { conversationId: convId, userId: anon.id, role: "member" },
      { conversationId: convId, userId: target.id, role: "member" },
    ]);
    await accountMerge.mergeAccounts(anon.id, target.id);
    const members = await db
      .select()
      .from(schema.conversationMember)
      .where(eq(schema.conversationMember.conversationId, convId));
    expect(members.filter((m) => m.userId === target.id)).toHaveLength(1);
    expect(members.some((m) => m.userId === anon.id)).toBe(false);
  });

  it("collapses a self-play game seat (both ids seated in one game -> single target seat)", async () => {
    const anon = await h.makeUser("sp_anon");
    const target = await h.makeUser("sp_target");
    const [g] = await db
      .insert(schema.game)
      .values({ gameType: "tic-tac-toe", status: "active" })
      .returning();
    const gameId = g?.id ?? "";
    h.trackGame(gameId);
    await db.insert(schema.gamePlayer).values([
      {
        gameId,
        userId: anon.id,
        username: anon.username,
        role: "X",
        seatOrder: 0,
      },
      {
        gameId,
        userId: target.id,
        username: target.username,
        role: "O",
        seatOrder: 1,
      },
    ]);
    await db.insert(schema.move).values({
      gameId,
      moveNumber: 1,
      playerId: anon.id,
      moveData: { row: 0, col: 0 },
    });
    await accountMerge.mergeAccounts(anon.id, target.id);
    const seats = await db
      .select()
      .from(schema.gamePlayer)
      .where(eq(schema.gamePlayer.gameId, gameId));
    expect(seats.filter((s) => s.userId === target.id)).toHaveLength(1);
    expect(seats.some((s) => s.userId === anon.id)).toBe(false);
    const moves = await db
      .select()
      .from(schema.move)
      .where(eq(schema.move.gameId, gameId));
    expect(moves.every((m) => m.playerId === target.id)).toBe(true);
  });

  it("re-points an anon-only game seat to the target", async () => {
    const anon = await h.makeUser("rp2_anon");
    const target = await h.makeUser("rp2_target");
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
    await accountMerge.mergeAccounts(anon.id, target.id);
    const seats = await db
      .select()
      .from(schema.gamePlayer)
      .where(eq(schema.gamePlayer.gameId, gameId));
    expect(seats).toHaveLength(1);
    expect(seats[0]?.userId).toBe(target.id);
  });

  it("drops a notification whose actor equals recipient after re-point", async () => {
    const anon = await h.makeUser("nt_anon");
    const target = await h.makeUser("nt_target");
    await db.insert(schema.notification).values({
      userId: target.id,
      type: "friend_request",
      actorId: anon.id,
      payload: { requestId: "x" },
    });
    await accountMerge.mergeAccounts(anon.id, target.id);
    const rows = await db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, target.id),
          eq(schema.notification.actorId, target.id),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it("re-points game creator/challenger/winner text fields", async () => {
    const anon = await h.makeUser("gt_anon");
    const target = await h.makeUser("gt_target");
    const [g] = await db
      .insert(schema.game)
      .values({
        gameType: "tic-tac-toe",
        status: "completed",
        creatorUserId: anon.id,
        challengedUserId: anon.id,
        winner: anon.id,
      })
      .returning();
    const gameId = g?.id ?? "";
    h.trackGame(gameId);
    await accountMerge.mergeAccounts(anon.id, target.id);
    const [row] = await db
      .select()
      .from(schema.game)
      .where(eq(schema.game.id, gameId));
    expect(row?.creatorUserId).toBe(target.id);
    expect(row?.challengedUserId).toBe(target.id);
    expect(row?.winner).toBe(target.id);
  });

  it("discard removes a solo anon game but preserves a game shared with a real opponent", async () => {
    const anon = await h.makeUser("dp_anon");
    const real = await h.makeUser("dp_real");

    const [solo] = await db
      .insert(schema.game)
      .values({ gameType: "tic-tac-toe", status: "active" })
      .returning();
    const soloId = solo?.id ?? "";
    h.trackGame(soloId);
    await db.insert(schema.gamePlayer).values({
      gameId: soloId,
      userId: anon.id,
      username: anon.username,
      role: "X",
      seatOrder: 0,
    });

    const [shared] = await db
      .insert(schema.game)
      .values({ gameType: "tic-tac-toe", status: "active" })
      .returning();
    const sharedId = shared?.id ?? "";
    h.trackGame(sharedId);
    await db.insert(schema.gamePlayer).values([
      {
        gameId: sharedId,
        userId: anon.id,
        username: anon.username,
        role: "X",
        seatOrder: 0,
      },
      {
        gameId: sharedId,
        userId: real.id,
        username: real.username,
        role: "O",
        seatOrder: 1,
      },
    ]);

    await accountMerge.deleteAnonUserData(anon.id);

    const [soloRow] = await db
      .select()
      .from(schema.game)
      .where(eq(schema.game.id, soloId));
    expect(soloRow).toBeUndefined();

    const [sharedRow] = await db
      .select()
      .from(schema.game)
      .where(eq(schema.game.id, sharedId));
    expect(sharedRow?.id).toBe(sharedId);

    const sharedSeats = await db
      .select()
      .from(schema.gamePlayer)
      .where(eq(schema.gamePlayer.gameId, sharedId));
    expect(sharedSeats).toHaveLength(1);
    expect(sharedSeats[0]?.userId).toBe(real.id);

    const [aUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, anon.id));
    expect(aUser).toBeUndefined();
  });
});
