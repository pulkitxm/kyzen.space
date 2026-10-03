import { db, games, profiles } from "@kyzen/database";
import { CAR_FOOTBALL } from "@kyzen/shared/constants";
import { carFootballStateSchema, type GameJson } from "@kyzen/shared/types";
import { io, type Socket } from "socket.io-client";

const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3000";
for (const url of [origin, process.env.DATABASE_URL ?? ""]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error(
      "This smoke flow requires a local synthetic app and database",
    );
}
const sockets: Socket[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
async function waitFor(check: () => boolean, timeout = 15000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw new Error("Runtime state timed out");
    await Bun.sleep(25);
  }
}
async function connect(socket: Socket) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Socket timed out")),
      8000,
    );
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.connect();
  });
}
try {
  const guests: { id: string; cookie: string }[] = [];
  for (let index = 0; index < 4; index++) {
    const signIn = () =>
      fetch(`${origin}/api/auth/sign-in/anonymous`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      });
    let response = await signIn();
    for (let attempt = 0; response.status === 429 && attempt < 3; attempt++) {
      const seconds = Number(response.headers.get("retry-after")) || 10;
      await Bun.sleep(Math.min(60, Math.max(5, seconds)) * 1000);
      response = await signIn();
    }
    if (!response.ok)
      throw new Error(`Guest sign-in failed: ${response.status}`);
    const data = (await response.json()) as { user: { id: string } };
    const cookie = response.headers
      .getSetCookie()
      .map((part) => part.split(";")[0])
      .join("; ");
    guests.push({ id: data.user.id, cookie });
    const socket = io(origin, {
      autoConnect: false,
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { Cookie: cookie },
    });
    sockets.push(socket);
    await connect(socket);
  }
  let code = "";
  for (const [index, socket] of sockets.entries()) {
    const result = await socket
      .timeout(8000)
      .emitWithAck("game:queue_join", { gameType: CAR_FOOTBALL });
    if (!result.ok || (index < 3 && result.gameId))
      throw new Error("Four-player matchmaking failed");
    if (result.gameId) code = result.gameId;
  }
  const record = await games.getGameByCode(code);
  if (
    record?.players.length !== 4 ||
    record.players.some(
      (player) => !guests.some((guest) => guest.id === player.userId),
    )
  )
    throw new Error("Synthetic match seating failed");
  const fixture = carFootballStateSchema.parse(record.gameState);
  fixture.phase = "play";
  fixture.pauseRemaining = 0;
  fixture.timeRemaining = 6;
  fixture.ball.position.x = 30;
  fixture.ball.velocity.x = 20;
  await games.updateGame(record.id, { gameState: fixture });
  let latest: GameJson | null = null;
  let moved = false;
  let scored = false;
  const snapshots = new Set<number>();
  for (const [index, socket] of sockets.entries()) {
    socket.on("game_state", ({ game }: { game: GameJson }) => {
      if (game.id !== code) return;
      snapshots.add(index);
      latest = game;
      const state = carFootballStateSchema.parse(game.gameState);
      if ((state.cars[0]?.position.x ?? -29) > -28.8) moved = true;
      if (state.score.blue > 0) scored = true;
      if (guests.some((guest) => JSON.stringify(game).includes(guest.id)))
        throw new Error("Public identity leaked");
    });
    socket.emit("join_room", { gameId: code });
  }
  timer = setInterval(() => {
    for (const [index, socket] of sockets.entries()) {
      const role = record.players.find(
        (player) => player.userId === guests[index]?.id,
      )?.role;
      socket.emit("make_move", {
        gameId: code,
        moveData: {
          throttle: role === "blue-1" ? 1 : 0,
          steer: 0,
          jump: false,
          boost: false,
          handbrake: false,
        },
      });
    }
  }, 50);
  await waitFor(() => snapshots.size === 4 && moved);
  const first = sockets[0];
  const second = sockets[1];
  const last = sockets[3];
  if (!first || !second || !last) throw new Error("Missing socket");
  const sent = await first.timeout(8000).emitWithAck("match:message", {
    gameId: code,
    body: "Synthetic team hello",
    clientId: crypto.randomUUID(),
  });
  if (!sent.ok) throw new Error("Four-player match chat failed");
  const choice = await first
    .timeout(8000)
    .emitWithAck("match:friend", { gameId: code });
  const mutual = await second
    .timeout(8000)
    .emitWithAck("match:friend", { gameId: code });
  if (!choice.ok || choice.mutual || !mutual.ok || !mutual.mutual)
    throw new Error("Mutual connection failed");
  const hidden = await fetch(`${origin}/api/matches/${code}/messages`, {
    headers: { Cookie: guests[3]?.cookie ?? "" },
  });
  const social = (await hidden.json()) as { peers: unknown[] };
  if (social.peers.length) throw new Error("Unconsented identities leaked");
  last.disconnect();
  snapshots.delete(3);
  await connect(last);
  last.emit("join_room", { gameId: code });
  await waitFor(() => snapshots.has(3) && scored);
  await waitFor(() => latest?.status === "completed", 20000);
  const final = await games.getGameByCode(code);
  if (
    final?.status !== "completed" ||
    carFootballStateSchema.parse(final.gameState).score.blue !== 1
  )
    throw new Error("Scored match did not persist");
  for (const player of record.players) {
    const stats = (await profiles.getProfileByUserId(player.userId))?.stats?.[
      CAR_FOOTBALL
    ];
    if (player.role.startsWith("blue") ? stats?.won !== 1 : stats?.lost !== 1)
      throw new Error("Team result was not credited");
  }
  process.stdout.write(
    "Four authenticated players matched, drove, scored, chatted, connected mutually, reconnected, and completed with correct team results.\n",
  );
} finally {
  clearInterval(timer);
  for (const socket of sockets) socket.disconnect();
  await db.$client.end();
}
