import { afterAll, describe, expect, it } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/games-core";
import { createGameInConversation } from "../src/chat/games-in-chat-service";
import { games, profiles } from "../src/db";
import { handleJoinRoom, handleMakeMove } from "../src/realtime/turn-based";
import { createHarness, DB_UP, type TestUser } from "./harness";

const h = createHarness("gd");
afterAll(h.cleanup);

type Broadcast = { room: string; event: string; payload: unknown };

function makeIo(broadcasts: Broadcast[]) {
  return {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          broadcasts.push({ room, event, payload });
        },
      };
    },
    in(room: string) {
      return {
        emit(event: string, payload: unknown) {
          broadcasts.push({ room, event, payload });
        },
        socketsJoin() {},
        socketsLeave() {},
      };
    },
  };
}

type SocketEmit = { event: string; payload: unknown };

function makeSocket(userId: string) {
  return {
    data: { userId },
    rooms: new Set<string>(),
    emits: [] as SocketEmit[],
    join(room: string) {
      this.rooms.add(room);
    },
    leave(room: string) {
      this.rooms.delete(room);
    },
    emit(event: string, payload: unknown) {
      this.emits.push({ event, payload });
    },
  };
}

function lastError(
  socket: ReturnType<typeof makeSocket>,
): SocketEmit | undefined {
  const errs = socket.emits.filter((e) => e.event === "game_error");
  return errs[errs.length - 1];
}

function eventsOf(broadcasts: Broadcast[], event: string): Broadcast[] {
  return broadcasts.filter((b) => b.event === event);
}

const move = (row: number, col: number) => ({ row, col });

async function statOf(userId: string) {
  const profile = await profiles.getProfileByUserId(userId);
  return (
    profile?.stats?.["tic-tac-toe"] ?? { played: 0, won: 0, lost: 0, drawn: 0 }
  );
}

async function createDmGame(creator: TestUser, conversationId: string) {
  const res = await createGameInConversation({
    userId: creator.id,
    conversationId,
    gameType: TIC_TAC_TOE,
  });
  if (!res.ok) throw new Error(`game create failed: ${res.error}`);
  h.trackGame(res.value.game.id);
  return res.value.game.id;
}

describe.skipIf(!DB_UP)("turn-based driver end-to-end", () => {
  it("handleJoinRoom by the creator emits game_state without seating a second player", async () => {
    const x = await h.makeUser("creatorjoin");
    const o = await h.makeUser("creatorjoin2");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);

    const broadcasts: Broadcast[] = [];
    const io = makeIo(broadcasts);
    const socket = makeSocket(x.id);

    await handleJoinRoom(io as never, socket as never, {
      gameId,
      intent: "play",
    });

    expect(socket.rooms.has(`game:${gameId}`)).toBe(true);
    const states = eventsOf(broadcasts, "game_state");
    expect(states.length).toBe(1);
    expect((states[0]?.payload as { game: { id: string } }).game.id).toBe(
      gameId,
    );

    const stored = await games.getGameById(gameId);
    expect(stored?.status).toBe("waiting");
    expect(stored?.players.length).toBe(1);
  });

  it("handleJoinRoom by the second DM member seats them as O and activates the game", async () => {
    const x = await h.makeUser("seatx");
    const o = await h.makeUser("seato");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);

    const broadcasts: Broadcast[] = [];
    const io = makeIo(broadcasts);
    const socket = makeSocket(o.id);

    await handleJoinRoom(io as never, socket as never, {
      gameId,
      intent: "play",
    });

    const stored = await games.getGameById(gameId);
    expect(stored?.status).toBe("active");
    expect(stored?.players.length).toBe(2);
    const seat = stored?.players.find((p) => p.userId === o.id);
    expect(seat?.role).toBe("O");

    expect(eventsOf(broadcasts, "game_state").length).toBeGreaterThanOrEqual(1);
  });

  it("handleJoinRoom with intent spectate does not seat a third user", async () => {
    const x = await h.makeUser("specx");
    const o = await h.makeUser("speco");
    const third = await h.makeUser("specthird");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);

    const ioA: Broadcast[] = [];
    await handleJoinRoom(makeIo(ioA) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const broadcasts: Broadcast[] = [];
    const socket = makeSocket(third.id);
    await handleJoinRoom(makeIo(broadcasts) as never, socket as never, {
      gameId,
      intent: "spectate",
    });

    expect(socket.rooms.has(`game:${gameId}`)).toBe(true);
    const stored = await games.getGameById(gameId);
    expect(stored?.players.length).toBe(2);
    expect(stored?.players.some((p) => p.userId === third.id)).toBe(false);
  });

  it("handleJoinRoom rejects an invalid game id", async () => {
    const broadcasts: Broadcast[] = [];
    const socket = makeSocket("does-not-matter");
    await handleJoinRoom(makeIo(broadcasts) as never, socket as never, {
      gameId: "not-a-uuid",
      intent: "play",
    });
    expect(lastError(socket)?.payload).toEqual({ message: "Invalid game id" });
    expect(broadcasts.length).toBe(0);
  });

  it("handleMakeMove on a waiting (not yet active) game emits game_error", async () => {
    const x = await h.makeUser("waitx");
    const o = await h.makeUser("waito");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);

    const socket = makeSocket(x.id);
    await handleMakeMove(makeIo([]) as never, socket as never, {
      gameId,
      moveData: move(0, 0),
    });
    expect(lastError(socket)?.payload).toEqual({
      message: "Game is not active",
    });
  });

  it("handleMakeMove by a non-player emits game_error", async () => {
    const x = await h.makeUser("npx");
    const o = await h.makeUser("npo");
    const outsider = await h.makeUser("npout");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const socket = makeSocket(outsider.id);
    await handleMakeMove(makeIo([]) as never, socket as never, {
      gameId,
      moveData: move(0, 0),
    });
    expect(lastError(socket)?.payload).toEqual({
      message: "Not a player in this game",
    });
  });

  it("handleMakeMove out of turn emits game_error", async () => {
    const x = await h.makeUser("otx");
    const o = await h.makeUser("oto");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const socket = makeSocket(o.id);
    await handleMakeMove(makeIo([]) as never, socket as never, {
      gameId,
      moveData: move(0, 0),
    });
    expect(lastError(socket)?.payload).toEqual({ message: "Not your turn" });
  });

  it("handleMakeMove on an occupied cell emits game_error", async () => {
    const x = await h.makeUser("occx");
    const o = await h.makeUser("occo");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    await handleMakeMove(makeIo([]) as never, makeSocket(x.id) as never, {
      gameId,
      moveData: move(0, 0),
    });

    const socket = makeSocket(o.id);
    await handleMakeMove(makeIo([]) as never, socket as never, {
      gameId,
      moveData: move(0, 0),
    });
    expect(lastError(socket)?.payload).toEqual({ message: "Cell occupied" });
  });

  it("handleMakeMove with an out-of-range move (row 5) is rejected by the schema", async () => {
    const x = await h.makeUser("oorx");
    const o = await h.makeUser("ooro");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const socket = makeSocket(x.id);
    await handleMakeMove(makeIo([]) as never, socket as never, {
      gameId,
      moveData: { row: 5, col: 0 },
    });
    expect(lastError(socket)?.payload).toEqual({ message: "Invalid move" });
    const moves = await games.listMoves(gameId);
    expect(moves.length).toBe(0);
  });

  it("a valid handleMakeMove persists a move and broadcasts move_made + game_state", async () => {
    const x = await h.makeUser("validx");
    const o = await h.makeUser("valido");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const before = await games.listMoves(gameId);
    const broadcasts: Broadcast[] = [];
    const socket = makeSocket(x.id);
    await handleMakeMove(makeIo(broadcasts) as never, socket as never, {
      gameId,
      moveData: move(1, 1),
    });

    expect(lastError(socket)).toBeUndefined();
    const after = await games.listMoves(gameId);
    expect(after.length).toBe(before.length + 1);
    expect(after[0]?.moveData).toEqual({ row: 1, col: 1 });
    expect(after[0]?.playerId).toBe(x.id);

    expect(eventsOf(broadcasts, "move_made").length).toBe(1);
    expect(eventsOf(broadcasts, "game_state").length).toBe(1);

    const stored = await games.getGameById(gameId);
    expect((stored?.gameState as { currentTurn: string }).currentTurn).toBe(
      "O",
    );
  });

  it("a full game to an X win completes, sets winner to X's userId, broadcasts game_over and bumps stats", async () => {
    const x = await h.makeUser("winx");
    const o = await h.makeUser("wino");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const xBefore = await statOf(x.id);
    const oBefore = await statOf(o.id);

    const broadcasts: Broadcast[] = [];
    const io = makeIo(broadcasts);
    const xSock = makeSocket(x.id);
    const oSock = makeSocket(o.id);
    const sequence: [
      ReturnType<typeof makeSocket>,
      { row: number; col: number },
    ][] = [
      [xSock, move(0, 0)],
      [oSock, move(1, 0)],
      [xSock, move(0, 1)],
      [oSock, move(1, 1)],
      [xSock, move(0, 2)],
    ];
    for (const [sock, md] of sequence) {
      await handleMakeMove(io as never, sock as never, {
        gameId,
        moveData: md,
      });
    }

    expect(lastError(xSock)).toBeUndefined();
    expect(lastError(oSock)).toBeUndefined();

    const stored = await games.getGameById(gameId);
    expect(stored?.status).toBe("completed");
    expect(stored?.winner).toBe(x.id);

    const overs = eventsOf(broadcasts, "game_over");
    expect(overs.length).toBe(1);
    expect((overs[0]?.payload as { winner: string }).winner).toBe(x.id);

    const xAfter = await statOf(x.id);
    const oAfter = await statOf(o.id);
    expect(xAfter.won).toBe(xBefore.won + 1);
    expect(xAfter.played).toBe(xBefore.played + 1);
    expect(oAfter.lost).toBe(oBefore.lost + 1);
    expect(oAfter.played).toBe(oBefore.played + 1);
  }, 30000);

  it("handleMakeMove after a completed game emits game_error", async () => {
    const x = await h.makeUser("postx");
    const o = await h.makeUser("posto");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const xSock = makeSocket(x.id);
    const oSock = makeSocket(o.id);
    const sequence: [
      ReturnType<typeof makeSocket>,
      { row: number; col: number },
    ][] = [
      [xSock, move(0, 0)],
      [oSock, move(1, 0)],
      [xSock, move(0, 1)],
      [oSock, move(1, 1)],
      [xSock, move(0, 2)],
    ];
    for (const [sock, md] of sequence) {
      await handleMakeMove(makeIo([]) as never, sock as never, {
        gameId,
        moveData: md,
      });
    }

    const after = makeSocket(o.id);
    await handleMakeMove(makeIo([]) as never, after as never, {
      gameId,
      moveData: move(2, 2),
    });
    expect(lastError(after)?.payload).toEqual({
      message: "Game is not active",
    });
  }, 30000);

  it("a full game to a draw sets winner to draw and bumps both players' drawn count", async () => {
    const x = await h.makeUser("drawx");
    const o = await h.makeUser("drawo");
    const convId = await h.makeDm(x, o);
    const gameId = await createDmGame(x, convId);
    await handleJoinRoom(makeIo([]) as never, makeSocket(o.id) as never, {
      gameId,
      intent: "play",
    });

    const xBefore = await statOf(x.id);
    const oBefore = await statOf(o.id);

    const broadcasts: Broadcast[] = [];
    const io = makeIo(broadcasts);
    const xSock = makeSocket(x.id);
    const oSock = makeSocket(o.id);
    const sequence: [
      ReturnType<typeof makeSocket>,
      { row: number; col: number },
    ][] = [
      [xSock, move(0, 0)],
      [oSock, move(0, 1)],
      [xSock, move(0, 2)],
      [oSock, move(1, 1)],
      [xSock, move(1, 0)],
      [oSock, move(1, 2)],
      [xSock, move(2, 1)],
      [oSock, move(2, 0)],
      [xSock, move(2, 2)],
    ];
    for (const [sock, md] of sequence) {
      await handleMakeMove(io as never, sock as never, {
        gameId,
        moveData: md,
      });
    }

    expect(lastError(xSock)).toBeUndefined();
    expect(lastError(oSock)).toBeUndefined();

    const stored = await games.getGameById(gameId);
    expect(stored?.status).toBe("completed");
    expect(stored?.winner).toBe("draw");

    const overs = eventsOf(broadcasts, "game_over");
    expect(overs.length).toBe(1);
    expect((overs[0]?.payload as { winner: string }).winner).toBe("draw");

    const xAfter = await statOf(x.id);
    const oAfter = await statOf(o.id);
    expect(xAfter.drawn).toBe(xBefore.drawn + 1);
    expect(oAfter.drawn).toBe(oBefore.drawn + 1);
    expect(xAfter.played).toBe(xBefore.played + 1);
    expect(oAfter.played).toBe(oBefore.played + 1);
  }, 30000);

  it("challenge seating: a non-challenged member is not seated but the challenged member is", async () => {
    const owner = await h.makeUser("chalowner");
    const challenged = await h.makeUser("chaltarget");
    const bystander = await h.makeUser("chalother");
    const convId = await h.makeGroup(owner, "challenge group", [
      challenged.id,
      bystander.id,
    ]);

    const res = await createGameInConversation({
      userId: owner.id,
      conversationId: convId,
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: challenged.id,
    });
    if (!res.ok) throw new Error(`challenge create failed: ${res.error}`);
    const gameId = res.value.game.id;
    h.trackGame(gameId);

    const bystanderSock = makeSocket(bystander.id);
    await handleJoinRoom(makeIo([]) as never, bystanderSock as never, {
      gameId,
      intent: "play",
    });
    let stored = await games.getGameById(gameId);
    expect(stored?.players.length).toBe(1);
    expect(stored?.players.some((p) => p.userId === bystander.id)).toBe(false);
    expect(stored?.status).toBe("waiting");

    const challengedSock = makeSocket(challenged.id);
    await handleJoinRoom(makeIo([]) as never, challengedSock as never, {
      gameId,
      intent: "play",
    });
    stored = await games.getGameById(gameId);
    expect(stored?.players.length).toBe(2);
    const seat = stored?.players.find((p) => p.userId === challenged.id);
    expect(seat?.role).toBe("O");
    expect(stored?.status).toBe("active");
  });
});
