import { afterAll, describe, expect, it } from "bun:test";
import { games, matchChat, profiles } from "@kyzen/database";
import { CAR_FOOTBALL } from "@kyzen/shared/constants";
import type { CarFootballState } from "@kyzen/shared/types";
import {
  createGameInConversation,
  rematchGame,
} from "../src/chat/games-in-chat-service";
import { sendMessage } from "../src/chat/messages-service";
import {
  realtimeStateFor,
  stopRealtimeGames,
} from "../src/realtime/realtime-game";
import { createStandaloneGame } from "../src/realtime/rooms-service";
import { handleJoinRoom, handleMakeMove } from "../src/realtime/turn-based";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("cf");
afterAll(async () => {
  stopRealtimeGames();
  await h.cleanup();
});

function makeIo(events: { event: string; payload: unknown }[]) {
  return {
    to(_room: string) {
      return {
        emit(event: string, payload: unknown) {
          events.push({ event, payload });
        },
      };
    },
  };
}

function makeSocket(userId: string) {
  return {
    data: { userId },
    rooms: new Set<string>(),
    errors: [] as unknown[],
    join(room: string) {
      this.rooms.add(room);
    },
    emit(event: string, payload: unknown) {
      if (event === "game_error") this.errors.push(payload);
    },
  };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await Bun.sleep(25);
  }
  throw new Error("Timed out waiting for realtime result");
}

describe.skipIf(!DB_UP)("Turbo Pitch four-player flow", () => {
  it("keeps group chat and all four seats through a rematch", async () => {
    const users = await Promise.all(
      [0, 1, 2, 3].map((index) => h.makeUser(`group${index}`)),
    );
    const host = users[0];
    if (!host) throw new Error("Missing host");
    const conversationId = await h.makeGroup(
      host,
      "Synthetic football team",
      users.slice(1).map((user) => user.id),
    );
    const created = await createGameInConversation({
      userId: host.id,
      conversationId,
      gameType: CAR_FOOTBALL,
      seatingMode: "open",
    });
    if (!created.ok) throw new Error(created.error);
    h.trackGame(created.value.game.id);
    const io = makeIo([]);
    for (const user of users)
      await handleJoinRoom(io as never, makeSocket(user.id) as never, {
        gameId: created.value.game.id,
      });
    const game = await games.getGameByCode(created.value.game.id);
    if (!game) throw new Error("Missing game");
    expect(game.players).toHaveLength(4);
    const sent = await sendMessage({
      conversationId,
      senderId: host.id,
      kind: "text",
      body: "Synthetic team ready",
    });
    expect(sent.ok).toBe(true);
    stopRealtimeGames();
    await games.completeRealtimeGame({
      previous: game,
      gameState: { ...(game.gameState as CarFootballState), phase: "finished" },
      winnerRole: "blue-1",
      winningRoles: ["blue-1", "blue-2"],
    });
    const rematch = await rematchGame({ userId: host.id, gameId: game.code });
    if (!rematch.ok) throw new Error(rematch.error);
    h.trackGame(rematch.value.game.id);
    expect(rematch.value.game.conversationId).toBe(conversationId);
    expect(rematch.value.game.players).toHaveLength(4);
    expect(rematch.value.game.status).toBe("active");
  });

  it("gives seated private-room players chat without exposing it to outsiders", async () => {
    const users = await Promise.all(
      [0, 1, 2, 3, 4].map((index) => h.makeUser(`roomchat${index}`)),
    );
    const created = await createStandaloneGame({
      userId: users[0]?.id ?? "",
      gameType: CAR_FOOTBALL,
    });
    if (!created.ok) throw new Error(created.error);
    h.trackGame(created.value.code);
    const io = makeIo([]);
    for (const user of users.slice(0, 4))
      await handleJoinRoom(io as never, makeSocket(user.id) as never, {
        gameId: created.value.code,
      });
    const sent = await matchChat.sendMatchMessage({
      code: created.value.code,
      userId: users[0]?.id ?? "",
      body: "Synthetic room hello",
      clientId: crypto.randomUUID(),
    });
    expect(sent.authorId).toBe(users[0]?.id ?? "");
    expect(
      (await matchChat.readMatchChat(created.value.code, users[1]?.id ?? ""))
        .messages,
    ).toHaveLength(1);
    await expect(
      matchChat.readMatchChat(created.value.code, users[4]?.id ?? ""),
    ).rejects.toThrow("Match not found");
  });

  it("seats four players, validates controls, and advances an authoritative state", async () => {
    const users = await Promise.all(
      [0, 1, 2, 3].map((index) => h.makeUser(`drive${index}`)),
    );
    const created = await createStandaloneGame({
      userId: users[0]?.id ?? "",
      gameType: CAR_FOOTBALL,
    });
    if (!created.ok) throw new Error(created.error);
    h.trackGame(created.value.code);
    const code = created.value.code;
    const events: { event: string; payload: unknown }[] = [];
    const io = makeIo(events);
    const sockets = users.map((user) => makeSocket(user.id));
    for (const socket of sockets) {
      await handleJoinRoom(io as never, socket as never, {
        gameId: code,
        intent: "play",
      });
    }
    const record = await games.getGameByCode(code);
    expect(record?.status).toBe("active");
    expect(record?.players.map((player) => player.role)).toEqual([
      "blue-1",
      "orange-1",
      "blue-2",
      "orange-2",
    ]);
    expect(realtimeStateFor(code)).not.toBeNull();

    const outsider = makeSocket("outsider");
    await handleMakeMove(io as never, outsider as never, {
      gameId: code,
      moveData: {
        throttle: 1,
        steer: 0,
        jump: false,
        boost: false,
        handbrake: false,
      },
    });
    expect(outsider.errors).toContainEqual({
      message: "Join the room before playing",
    });
    await Bun.sleep(3100);
    const startX =
      (realtimeStateFor(code) as CarFootballState).cars[0]?.position.x ?? 0;
    const drive = setInterval(() => {
      void handleMakeMove(io as never, sockets[0] as never, {
        gameId: code,
        moveData: {
          throttle: 1,
          steer: 0,
          jump: false,
          boost: true,
          handbrake: false,
        },
      });
    }, 50);
    await Bun.sleep(350);
    clearInterval(drive);
    const current = realtimeStateFor(code) as CarFootballState;
    expect(current.cars[0]?.position.x).toBeGreaterThan(startX);
    expect(events.some((event) => event.event === "game_state")).toBe(true);
  });

  it("finishes once and credits both winning teammates", async () => {
    const users = await Promise.all(
      [0, 1, 2, 3].map((index) => h.makeUser(`score${index}`)),
    );
    const created = await createStandaloneGame({
      userId: users[0]?.id ?? "",
      gameType: CAR_FOOTBALL,
    });
    if (!created.ok) throw new Error(created.error);
    h.trackGame(created.value.code);
    const code = created.value.code;
    const io = makeIo([]);
    for (const user of users.slice(0, 3)) {
      await handleJoinRoom(io as never, makeSocket(user.id) as never, {
        gameId: code,
        intent: "play",
      });
    }
    const waiting = await games.getGameByCode(code);
    if (!waiting) throw new Error("Missing game");
    const ready = waiting.gameState as CarFootballState;
    await games.updateGame(waiting.id, {
      gameState: {
        ...ready,
        phase: "play",
        pauseRemaining: 0,
        timeRemaining: 0.04,
        score: { blue: 1, orange: 0 },
      },
    });
    await handleJoinRoom(io as never, makeSocket(users[3]?.id ?? "") as never, {
      gameId: code,
      intent: "play",
    });
    await waitFor(
      async () => (await games.getGameByCode(code))?.status === "completed",
    );
    for (const index of [0, 2]) {
      const stats = (await profiles.getProfileByUserId(users[index]?.id ?? ""))
        ?.stats?.[CAR_FOOTBALL];
      expect(stats?.won).toBe(1);
      expect(stats?.played).toBe(1);
    }
    for (const index of [1, 3]) {
      const stats = (await profiles.getProfileByUserId(users[index]?.id ?? ""))
        ?.stats?.[CAR_FOOTBALL];
      expect(stats?.lost).toBe(1);
      expect(stats?.played).toBe(1);
    }
  });
});
