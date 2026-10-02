import { afterAll, describe, expect, it } from "bun:test";
import { conversations, db, games, schema } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { eq } from "drizzle-orm";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("publicmatch");
const definition = getDefinition(TIC_TAC_TOE);
async function join(userId: string, config: unknown = {}, owner = userId) {
  const result = await games.joinMatchmaking({
    userId,
    owner,
    gameType: TIC_TAC_TOE,
    config,
    roles: definition.engine.roles,
    gameState: definition.engine.createInitialState(
      definition.engine.roles.map((role) => ({ role })),
    ),
  });
  if (result) h.trackGame(result.code);
  return result;
}
afterAll(() => h.cleanup());

describe.skipIf(!DB_UP)("transactional public matchmaking", () => {
  it("seats strangers atomically without creating a DM and resumes the same match", async () => {
    const a = await h.makeUser("a");
    const b = await h.makeUser("b");
    expect(await join(a.id)).toBeNull();
    const matched = await join(b.id);
    expect(matched?.userIds.sort()).toEqual([a.id, b.id].sort());
    const record = await games.getGameByCode(matched?.code ?? "");
    expect(record?.publicMatch).toBe(true);
    expect(record?.status).toBe("active");
    expect(record?.players.map((player) => player.role).sort()).toEqual([
      "O",
      "X",
    ]);
    expect(record?.conversationId).toBeNull();
    expect(await conversations.findDm(a.id, b.id)).toBeNull();
    expect((await join(a.id))?.code).toBe(matched?.code);
    expect(await games.leaveMatchmaking(a.id, a.id, TIC_TAC_TOE)).toBe(
      matched?.code ?? null,
    );
  });

  it("isolates config pools and expired tickets", async () => {
    const a = await h.makeUser("configA");
    const b = await h.makeUser("configB");
    expect(await join(a.id, { speed: "fast" })).toBeNull();
    expect(await join(b.id, { speed: "slow" })).toBeNull();
    await games.leaveMatchmaking(b.id, b.id, TIC_TAC_TOE);
    await db
      .update(schema.matchmakingTicket)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.matchmakingTicket.userId, a.id));
    expect(await join(b.id, { speed: "fast" })).toBeNull();
    await games.leaveMatchmaking(a.id, a.id, TIC_TAC_TOE);
    await games.leaveMatchmaking(b.id, b.id, TIC_TAC_TOE);
  });

  it("cancels only the current owner's ticket", async () => {
    const a = await h.makeUser("tabs");
    await join(a.id, {}, "old-tab");
    await join(a.id, {}, "new-tab");
    await games.leaveMatchmaking(a.id, "old-tab", TIC_TAC_TOE);
    const remaining = await db
      .select()
      .from(schema.matchmakingTicket)
      .where(eq(schema.matchmakingTicket.userId, a.id));
    expect(remaining).toHaveLength(1);
    await games.leaveMatchmaking(a.id, "new-tab", TIC_TAC_TOE);
    expect(
      await db
        .select()
        .from(schema.matchmakingTicket)
        .where(eq(schema.matchmakingTicket.userId, a.id)),
    ).toHaveLength(0);
  });

  it("concurrent joins and retries give every player exactly one match", async () => {
    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) => h.makeUser(`race${i}`)),
    );
    await Promise.all(users.flatMap((user) => [join(user.id), join(user.id)]));
    const results = await Promise.all(users.map((user) => join(user.id)));
    expect(new Set(results.map((result) => result?.code)).size).toBe(5);
    for (const user of users) {
      expect(
        (await games.gamesForUser(user.id, { includePublic: true })).filter(
          (game) => game.status === "active",
        ),
      ).toHaveLength(1);
    }
  });
});
