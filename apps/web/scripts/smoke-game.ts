import { CHAT_EVENTS, TIC_TAC_TOE } from "@kyzen/shared/constants";
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

  const queued = await host
    .timeout(8000)
    .emitWithAck("game:queue_join", { gameType: TIC_TAC_TOE });
  if (!queued.ok || queued.gameId)
    throw new Error("First public player was not queued");
  const matched = await opponent
    .timeout(8000)
    .emitWithAck("game:queue_join", { gameType: TIC_TAC_TOE });
  if (!matched.ok || !matched.gameId)
    throw new Error("Public matchmaking failed");
  const publicCode = matched.gameId as string;
  const snapshots = await Promise.all(
    guests.map(async (guest) => {
      const response = await fetch(`${origin}/api/games/${publicCode}`, {
        headers: { Cookie: guest.cookie },
      });
      if (!response.ok) throw new Error("Public match snapshot failed");
      return (await response.json()) as { game: GameJson };
    }),
  );
  for (const guest of guests) {
    if (JSON.stringify(snapshots).includes(guest.userId))
      throw new Error("Public snapshot leaked an identity");
  }
  const outsider = await createGuest();
  const forbidden = await fetch(`${origin}/api/games/${publicCode}`, {
    headers: { Cookie: outsider.cookie },
  });
  if (forbidden.status !== 404)
    throw new Error("Outsider could access a public match");
  for (const socket of sockets) {
    const ready = waitForState(
      socket,
      publicCode,
      (state) => state.game.status === "active",
    );
    socket.emit("join_room", { gameId: publicCode });
    await ready;
  }
  const messageInput = {
    gameId: publicCode,
    clientId: crypto.randomUUID(),
    body: "Good luck, synthetic opponent!",
  };
  const message = await host
    .timeout(8000)
    .emitWithAck("match:message", messageInput);
  const retried = await host
    .timeout(8000)
    .emitWithAck("match:message", messageInput);
  if (!message.ok || !retried.ok || message.message.id !== retried.message.id)
    throw new Error("Match message retries duplicated a message");
  const chatResponse = await fetch(
    `${origin}/api/matches/${publicCode}/messages`,
    { headers: { Cookie: guests[1]?.cookie ?? "" } },
  );
  const chat = (await chatResponse.json()) as { messages: unknown[] };
  if (chat.messages.length !== 1)
    throw new Error("Match chat did not synchronize");
  const firstChoice = await host
    .timeout(8000)
    .emitWithAck("match:friend", { gameId: publicCode });
  if (!firstChoice.ok || firstChoice.mutual)
    throw new Error("One-sided consent created a friendship");
  const secondChoice = await opponent
    .timeout(8000)
    .emitWithAck("match:friend", { gameId: publicCode });
  if (!secondChoice.ok || !secondChoice.mutual)
    throw new Error("Mutual consent did not create friendship");
  const xIndex = snapshots.findIndex(
    (snapshot) => snapshot.game.viewerId === `${publicCode}:X`,
  );
  const x = sockets[xIndex];
  const o = sockets[1 - xIndex];
  if (!x || !o) throw new Error("Public roles could not be resolved");
  for (const [index, position] of positions.entries()) {
    const next = waitForState(
      host,
      publicCode,
      (state) => state.move?.moveNumber === index + 1,
    );
    (index % 2 === 0 ? x : o).emit("make_move", {
      gameId: publicCode,
      moveData: { row: position[0], col: position[1] },
    });
    const state = await next;
    for (const guest of guests)
      if (JSON.stringify(state).includes(guest.userId))
        throw new Error("Realtime state leaked an identity");
    if (index === 1) {
      opponent.disconnect();
      await connect(opponent);
      const resumed = await opponent
        .timeout(8000)
        .emitWithAck("game:queue_join", { gameType: TIC_TAC_TOE });
      if (resumed.gameId !== publicCode)
        throw new Error("Reconnect created a duplicate public match");
      const restored = waitForState(
        opponent,
        publicCode,
        (state) => state.moves?.length === 2,
      );
      opponent.emit("join_room", { gameId: publicCode });
      await restored;
    }
  }
  const ended = await fetch(`${origin}/api/matches/${publicCode}/messages`, {
    headers: { Cookie: guests[0]?.cookie ?? "" },
  });
  if (((await ended.json()) as { messages: unknown[] }).messages.length)
    throw new Error("Ended match chat is still visible");
  const permanent = await fetch(`${origin}/api/conversations`, {
    headers: { Cookie: guests[0]?.cookie ?? "" },
  });
  const conversations = (await permanent.json()) as {
    conversations: { id: string }[];
  };
  const dm = conversations.conversations[0];
  if (!dm) throw new Error("Mutual friends have no permanent chat");
  const dmMessage = await host
    .timeout(8000)
    .emitWithAck(CHAT_EVENTS.sendMessage, {
      conversationId: dm.id,
      body: "Hello from our permanent friend chat",
      clientId: crypto.randomUUID(),
    });
  if (!dmMessage.ok) throw new Error("Permanent friend chat failed");
  process.stdout.write(
    "Anonymous public matching, participant-only snapshots, temporary chat, mutual friendship, permanent messaging, completion, and reconnect all work. Public snapshots contain no account IDs.\n",
  );
  process.stdout.write(
    "Homepage and guest auth work. Two authenticated WebSocket players finished a game, reconnect restored history, and five moves were persisted.\n",
  );
} finally {
  for (const socket of sockets) socket.disconnect();
}
