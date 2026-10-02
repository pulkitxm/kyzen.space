import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameJson, ServerGameStatePayload } from "@kyzen/shared/types";
import { io, type Socket } from "socket.io-client";

const origin = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
  throw new Error(
    "The runtime smoke flow requires a local synthetic environment",
  );
}

async function createGuest() {
  const response = await fetch(`${origin}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Guest sign-in failed: ${response.status}`);
  const { user } = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ");
  if (!user?.id || !cookie)
    throw new Error("Guest sign-in did not return an identity and cookie");
  return { userId: user.id, cookie };
}

function connect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error("Socket connection timed out")),
      8000,
    );
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.off("connect", ready);
      socket.off("connect_error", failed);
      if (error) reject(error);
      else resolve();
    };
    const ready = () => finish();
    const failed = (error: Error) => finish(error);
    socket.once("connect", ready);
    socket.once("connect_error", failed);
    socket.connect();
  });
}

function waitForState(
  socket: Socket,
  code: string,
  accept: (state: ServerGameStatePayload) => boolean,
) {
  return new Promise<ServerGameStatePayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Game state timed out"));
    }, 8000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("game_state", receive);
    };
    const receive = (state: ServerGameStatePayload) => {
      if (state.game.id !== code || !accept(state)) return;
      cleanup();
      resolve(state);
    };
    socket.on("game_state", receive);
  });
}

const sockets: Socket[] = [];
try {
  const homepage = await fetch(origin);
  if (!homepage.ok || !(await homepage.text()).includes("<html"))
    throw new Error("Homepage did not render");
  const guests = await Promise.all([createGuest(), createGuest()]);
  for (const guest of guests) {
    const socket = io(origin, {
      autoConnect: false,
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { Cookie: guest.cookie },
    });
    sockets.push(socket);
    await connect(socket);
  }
  const [host, opponent] = sockets;
  if (!host || !opponent) throw new Error("Two players are required");
  const room = (await host
    .timeout(8000)
    .emitWithAck("room:create", { gameType: TIC_TAC_TOE })) as {
    ok: boolean;
    code: string;
  };
  if (!room.ok || !room.code) throw new Error("Room creation failed");
  const waiting = waitForState(
    host,
    room.code,
    (state) => state.game.status === "waiting",
  );
  host.emit("join_room", { gameId: room.code });
  await waiting;
  const active = waitForState(
    host,
    room.code,
    (state) => state.game.status === "active",
  );
  opponent.emit("join_room", { gameId: room.code });
  await active;

  const positions = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 2],
  ];
  for (const [index, position] of positions.entries()) {
    const next = waitForState(
      host,
      room.code,
      (state) => state.move?.moveNumber === index + 1,
    );
    const player = index % 2 === 0 ? host : opponent;
    player.emit("make_move", {
      gameId: room.code,
      moveData: { row: position[0], col: position[1] },
    });
    await next;
    if (index === 1) {
      opponent.disconnect();
      await connect(opponent);
      const restored = waitForState(
        opponent,
        room.code,
        (state) => state.moves?.length === 2,
      );
      opponent.emit("join_room", { gameId: room.code });
      await restored;
    }
  }
  const response = await fetch(`${origin}/api/games/${room.code}`);
  const final = (await response.json()) as { game: GameJson; moves: unknown[] };
  if (
    !response.ok ||
    final.game.status !== "completed" ||
    final.game.winner !== guests[0]?.userId ||
    final.moves.length !== 5
  ) {
    throw new Error("The completed game was not persisted correctly");
  }
  process.stdout.write(
    "Homepage and guest auth work. Two authenticated WebSocket players finished a game, reconnect restored history, and five moves were persisted.\n",
  );
} finally {
  for (const socket of sockets) socket.disconnect();
}
