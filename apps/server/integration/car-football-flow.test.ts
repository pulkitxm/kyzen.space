import { afterAll, describe, expect, it } from "bun:test";
import { games, profiles } from "@kyzen/database";
import { CAR_FOOTBALL } from "@kyzen/shared/constants";
import type { CarFootballState } from "@kyzen/shared/types";
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
