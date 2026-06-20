import { afterAll, describe, expect, it } from "bun:test";
import { games } from "@kyzen/database";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import {
  createGameInConversation,
  rematchGame,
} from "../src/chat/games-in-chat-service";
import { handleJoinRoom, handleMakeMove } from "../src/realtime/turn-based";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("rm");
afterAll(h.cleanup);

function makeIo() {
  return {
    to() {
      return { emit() {} };
    },
    in() {
      return { emit() {}, socketsJoin() {}, socketsLeave() {} };
    },
  };
}

function makeSocket(userId: string) {
  return {
    data: { userId },
    rooms: new Set<string>(),
    join(room: string) {
      this.rooms.add(room);
    },
    leave(room: string) {
      this.rooms.delete(room);
    },
    emit() {},
  };
}

const move = (row: number, col: number) => ({ row, col });

describe.skipIf(!DB_UP)("rematch end-to-end", () => {
  it("links a rematch into the same series with loser-first seating", async () => {
    const a = await h.makeUser("rmA");
    const b = await h.makeUser("rmB");
    const convId = await h.makeDm(a, b);

    const first = await createGameInConversation({
      userId: a.id,
      conversationId: convId,
      gameType: TIC_TAC_TOE,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const code = first.value.game.id;
    h.trackGame(code);

    const io = makeIo();
    const sockA = makeSocket(a.id);
    const sockB = makeSocket(b.id);
    await handleJoinRoom(io as never, sockA as never, { gameId: code });
    await handleJoinRoom(io as never, sockB as never, { gameId: code });

    await handleMakeMove(io as never, sockA as never, {
      gameId: code,
      moveData: move(0, 0),
    });
    await handleMakeMove(io as never, sockB as never, {
      gameId: code,
      moveData: move(1, 0),
    });
    await handleMakeMove(io as never, sockA as never, {
      gameId: code,
      moveData: move(0, 1),
    });
    await handleMakeMove(io as never, sockB as never, {
      gameId: code,
      moveData: move(1, 1),
    });
    await handleMakeMove(io as never, sockA as never, {
      gameId: code,
      moveData: move(0, 2),
    });

    const finished = await games.getGameByCode(code);
    expect(finished?.status).toBe("completed");
    expect(finished?.winner).toBe(a.id);

    const rematch = await rematchGame({ userId: a.id, gameId: code });
    expect(rematch.ok).toBe(true);
    if (!rematch.ok) return;
    const newCode = rematch.value.game.id;
    h.trackGame(newCode);

    const newGame = await games.getGameByCode(newCode);
    expect(newGame?.seriesId).toBe(finished?.seriesId ?? "");
    expect(newGame?.status).toBe("active");
    const xPlayer = newGame?.players.find((p) => p.role === "X");
    expect(xPlayer?.userId).toBe(b.id);

    const dup = await rematchGame({ userId: b.id, gameId: code });
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.value.game.id).toBe(newCode);
  });

  it("returns the existing live game when a second same-type game is created", async () => {
    const a = await h.makeUser("oneLiveA");
    const b = await h.makeUser("oneLiveB");
    const convId = await h.makeDm(a, b);

    const first = await createGameInConversation({
      userId: a.id,
      conversationId: convId,
      gameType: TIC_TAC_TOE,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const code = first.value.game.id;
    h.trackGame(code);

    const second = await createGameInConversation({
      userId: b.id,
      conversationId: convId,
      gameType: TIC_TAC_TOE,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.game.id).toBe(code);
    expect(second.value.message).toBeUndefined();

    const live = await games.findLiveGameInConversation(convId, TIC_TAC_TOE);
    expect(live?.code).toBe(code);
  });

  it("re-creates a fresh game once the live game is abandoned", async () => {
    const a = await h.makeUser("oneLiveC");
    const b = await h.makeUser("oneLiveD");
    const convId = await h.makeDm(a, b);

    const first = await createGameInConversation({
      userId: a.id,
      conversationId: convId,
      gameType: TIC_TAC_TOE,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstCode = first.value.game.id;
    h.trackGame(firstCode);

    const loaded = await games.getGameByCode(firstCode);
    expect(loaded).toBeTruthy();
    if (!loaded) return;
    await games.updateGame(loaded.id, { status: "abandoned" });

    const second = await createGameInConversation({
      userId: a.id,
      conversationId: convId,
      gameType: TIC_TAC_TOE,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    h.trackGame(second.value.game.id);
    expect(second.value.game.id).not.toBe(firstCode);
    expect(second.value.message?.kind).toBe("game_card");
  });
});
