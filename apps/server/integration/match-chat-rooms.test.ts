import { afterAll, describe, expect, it } from "bun:test";
import { db, friends, games, matchChat, schema } from "@kyzen/database";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { Socket } from "socket.io";
import { createGameInConversation } from "../src/chat/games-in-chat-service";
import { createStandaloneGame } from "../src/realtime/rooms-service";
import { handleJoinRoom } from "../src/realtime/turn-based";
import { turnTimers } from "../src/realtime/turn-timer";
import { FAKE_ROUNDS } from "../tests/support/fake-rounds";
import { installFakeRegistry } from "../tests/support/runtime";
import { createHarness, DB_UP, type TestUser, unwrap } from "./harness";

installFakeRegistry();

const h = createHarness("nchat");
afterAll(async () => {
  turnTimers.reset();
  await h.cleanup();
});

const io = { to: () => ({ emit: () => {} }) } as never;

async function publicMatch(users: TestUser[]): Promise<string> {
  const [row] = await db
    .insert(schema.game)
    .values({
      gameType: FAKE_ROUNDS,
      status: "active",
      publicMatch: true,
      config: { mode: "ffa", teams: {}, bots: [] },
      gameState: {},
    })
    .returning();
  if (!row) throw new Error("match insert failed");
  h.trackGame(row.id);
  await db.insert(schema.gamePlayer).values(
    users.map((user, index) => ({
      gameId: row.id,
      userId: user.id,
      username: `Player ${index + 1}`,
      role: `P${index + 1}`,
      seatOrder: index,
    })),
  );
  return row.code;
}

function message(code: string, user: TestUser, body: string) {
  return matchChat.sendMatchMessage({
    code,
    userId: user.id,
    body,
    clientId: crypto.randomUUID(),
  });
}

describe.skipIf(!DB_UP)("N-player public match chat", () => {
  it("aliases every author and requires a pairwise mutual choice", async () => {
    const users = await Promise.all(
      ["a", "b", "c", "d"].map((label) => h.makeUser(label)),
    );
    const [a, b, c, d] = users as [TestUser, TestUser, TestUser, TestUser];
    const code = await publicMatch(users);
    const alias = (seat: number) => `${code}:P${seat}`;

    expect((await message(code, c, "synthetic hello")).authorId).toBe(alias(3));
    expect(
      (await matchChat.readMatchChat(code, d.id)).messages.map(
        (entry) => entry.authorId,
      ),
    ).toEqual([alias(3)]);

    expect(
      (await matchChat.chooseMatchFriend(code, a.id, alias(3))).mutual,
    ).toBe(false);
    expect(
      (await matchChat.chooseMatchFriend(code, c.id, alias(2))).mutual,
    ).toBe(false);
    expect(await friends.areFriends(a.id, c.id)).toBe(false);
    expect(await friends.areFriends(b.id, c.id)).toBe(false);

    const [first, second] = await Promise.all([
      matchChat.chooseMatchFriend(code, c.id, alias(1)),
      matchChat.chooseMatchFriend(code, c.id, alias(1)),
    ]);
    expect(first).toEqual({ mutual: true, targetUserId: a.id });
    expect(second).toEqual({ mutual: true, targetUserId: a.id });
    expect(await friends.areFriends(a.id, c.id)).toBe(true);
    expect(await friends.areFriends(b.id, c.id)).toBe(false);

    const viewA = await matchChat.readMatchChat(code, a.id);
    expect(viewA.choices).toEqual([alias(3)]);
    expect(viewA.friends).toEqual([
      { playerId: alias(3), username: c.username },
    ]);
    const viewC = await matchChat.readMatchChat(code, c.id);
    expect(viewC.choices.sort()).toEqual([alias(1), alias(2)]);
    expect(viewC.friends).toEqual([
      { playerId: alias(1), username: a.username },
    ]);
    const viewB = await matchChat.readMatchChat(code, b.id);
    expect(viewB).toMatchObject({ choices: [], friends: [] });
    expect(JSON.stringify(viewB)).not.toContain(a.username);
    expect(JSON.stringify(viewB)).not.toContain(c.username);
  });

  it("rejects self, unknown, and outsider choices", async () => {
    const users = await Promise.all(
      ["sa", "sb", "sc"].map((label) => h.makeUser(label)),
    );
    const [a] = users as [TestUser];
    const outsider = await h.makeUser("so");
    const code = await publicMatch(users);
    await expect(
      matchChat.chooseMatchFriend(code, a.id, `${code}:P1`),
    ).rejects.toThrow("Player not found");
    await expect(
      matchChat.chooseMatchFriend(code, a.id, `${code}:P9`),
    ).rejects.toThrow("Player not found");
    await expect(
      matchChat.chooseMatchFriend(code, outsider.id, `${code}:P2`),
    ).rejects.toThrow("Match not found");
  });
});

describe.skipIf(!DB_UP)("private room match chat", () => {
  it("uses real identities in a standalone room and keeps outsiders out", async () => {
    const host = await h.makeUser("host");
    const guest = await h.makeUser("guest");
    const outsider = await h.makeUser("outsider");
    const created = unwrap(
      await createStandaloneGame({ userId: host.id, gameType: TIC_TAC_TOE }),
    );
    const room = await games.getGameByCode(created.code);
    if (room) h.trackGame(room.id);
    await handleJoinRoom(
      io,
      {
        data: { userId: guest.id },
        join: () => {},
        emit: () => {},
      } as never as Socket,
      { gameId: created.code },
    );
    expect((await games.getGameByCode(created.code))?.status).toBe("active");

    const sent = await message(created.code, host, "private synthetic hello");
    expect(sent.authorId).toBe(host.id);
    expect(
      (await matchChat.readMatchChat(created.code, guest.id)).messages,
    ).toEqual([sent]);
    await expect(
      matchChat.readMatchChat(created.code, outsider.id),
    ).rejects.toThrow("Match not found");
    await expect(
      matchChat.chooseMatchFriend(created.code, guest.id, host.id),
    ).rejects.toThrow("Match not found");
  });

  it("leaves conversation-backed games on permanent chat", async () => {
    const a = await h.makeUser("ca");
    const b = await h.makeUser("cb");
    const conversationId = await h.makeDm(a, b);
    const created = unwrap(
      await createGameInConversation({
        userId: a.id,
        conversationId,
        gameType: TIC_TAC_TOE,
      }),
    );
    const row = await games.getGameByCode(created.game.id);
    if (row) h.trackGame(row.id);
    await expect(message(created.game.id, a, "not here")).rejects.toThrow(
      "Match not found",
    );
  });
});
