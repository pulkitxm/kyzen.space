import { afterAll, describe, expect, it } from "bun:test";
import { conversations, db, games, schema } from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { eq } from "drizzle-orm";
import { createGameInConversation } from "../src/chat/games-in-chat-service";
import { runPairing } from "../src/realtime/matchmaking";
import { InMemoryMatchmakingStore } from "../src/realtime/matchmaking-store";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("mmflow");
const createdConvIds: string[] = [];

afterAll(async () => {
  if (DB_UP) {
    for (const id of createdConvIds) {
      await db
        .delete(schema.conversation)
        .where(eq(schema.conversation.id, id))
        .catch(() => {});
    }
  }
  await h.cleanup();
});

describe.skipIf(!DB_UP)("matchmaking flow (DB-backed)", () => {
  it("pairs two enqueued users into one open game with both seatable", async () => {
    const a = await h.makeUser("a");
    const b = await h.makeUser("b");

    const store = new InMemoryMatchmakingStore();
    await store.enqueue(TIC_TAC_TOE, a.id, 1);
    await store.enqueue(TIC_TAC_TOE, b.id, 2);

    const pair = await store.pairAndPop(TIC_TAC_TOE);
    expect(pair).toEqual([a.id, b.id]);

    const matched: Array<{ userId: string; gameId: string }> = [];
    await runPairing(TIC_TAC_TOE, pair as [string, string], undefined, {
      onlineAmong: async (ids) => new Set(ids),
      createMatchGame: async (input) => {
        const { conversation } = await conversations.getOrCreateDm(
          input.a,
          input.b,
        );
        const created = await createGameInConversation({
          userId: input.a,
          conversationId: conversation.id,
          gameType: input.gameType,
          seatingMode: "challenge",
          challengedUserId: input.b,
          config: input.config,
        });
        return created.ok
          ? { ok: true, gameId: created.value.game.id }
          : { ok: false };
      },
      emitMatch: (userId, gameId) => matched.push({ userId, gameId }),
      requeue: async () => {},
    });

    expect(matched.map((m) => m.userId).sort()).toEqual([a.id, b.id].sort());
    const gameId = matched[0]?.gameId;
    expect(gameId).toBeTruthy();

    const dm = await conversations.findDm(a.id, b.id);
    expect(dm).not.toBeNull();
    if (dm) createdConvIds.push(dm.id);

    const record = await games.getGameByCode(gameId as string);
    expect(record).not.toBeNull();
    if (record) h.trackGame(record.id);
    expect(record?.gameType).toBe(TIC_TAC_TOE);
    expect(record?.seatingMode).toBe("open");
    expect(record?.challengedUserId).toBeNull();
    expect(record?.players.map((p) => p.userId)).toEqual([a.id]);

    const seated = await games.seatPlayer(
      record?.id as string,
      { userId: b.id, username: b.username, role: "O" },
      1,
    );
    expect(seated).toBe(true);
    const loaded = await games.getGameById(record?.id as string);
    expect(loaded?.players.map((p) => p.userId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it("creates exactly one game per DM even if pairAndPop is attempted twice", async () => {
    const a = await h.makeUser("c");
    const b = await h.makeUser("d");

    const store = new InMemoryMatchmakingStore();
    await store.enqueue(TIC_TAC_TOE, a.id, 1);
    await store.enqueue(TIC_TAC_TOE, b.id, 2);

    const first = await store.pairAndPop(TIC_TAC_TOE);
    const second = await store.pairAndPop(TIC_TAC_TOE);
    expect(first).toEqual([a.id, b.id]);
    expect(second).toBeNull();

    const { conversation } = await conversations.getOrCreateDm(a.id, b.id);
    createdConvIds.push(conversation.id);

    const created = await createGameInConversation({
      userId: a.id,
      conversationId: conversation.id,
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: b.id,
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      const record = await games.getGameByCode(created.value.game.id);
      if (record) h.trackGame(record.id);
    }
  });
});
