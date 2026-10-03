import {
  aliveTeams,
  arenaWidth,
  canUse,
  GRAVITY,
  isJumpAction,
  MIN_POWER,
  resolutionInput,
  roleTeam,
  simulateRound,
  TANKS,
} from "@kyzen/games-core";
import { CHAT_EVENTS, TANK_ARENA, TIC_TAC_TOE } from "@kyzen/shared/constants";
import type {
  GameJson,
  MoveJson,
  ServerGameStatePayload,
  TankAction,
  TankArenaMove,
  TankArenaState,
  TankArenaTank,
} from "@kyzen/shared/types";
import { io, type Socket } from "socket.io-client";

const origin = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
  throw new Error(
    "The runtime smoke flow requires a local synthetic environment",
  );
}

function signInGuest() {
  return fetch(`${origin}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: "{}",
  });
}

async function createGuest() {
  let response = await signInGuest();
  for (let retry = 0; response.status === 429 && retry < 3; retry++) {
    const seconds = Number(response.headers.get("X-Retry-After")) || 10;
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    response = await signInGuest();
  }
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

type Guest = Awaited<ReturnType<typeof createGuest>>;
type TankPlayer = {
  guest: Guest;
  socket: Socket;
  log: ServerGameStatePayload[];
};
type TankSeat = { player: TankPlayer; role: string };
type TankSnapshot = { game: GameJson; moves: MoveJson[] };
type TankDecision = (state: TankArenaState, seat: TankSeat) => TankArenaMove;
type TankRecord = {
  resolved: Map<number, TankArenaState>;
  starts: Map<number, TankArenaTank[]>;
};

const RESOLVED_SEED_PATH = "game.gameState.resolution.seed";
const ACTION_CYCLE: TankAction[] = [
  "missile",
  "specialA",
  "shield",
  "jump",
  "specialB",
];
const tankViolations: string[] = [];
const tankRecords = new Map<string, TankRecord>();
const sockets: Socket[] = [];

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function hiddenKeyLeak(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const leak = hiddenKeyLeak(item, `${path}[${index}]`);
      if (leak) return leak;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (
      key === "secret" ||
      (key === "seed" && childPath !== RESOLVED_SEED_PATH)
    )
      return `Tank Arena payload exposed ${childPath}`;
    const leak = hiddenKeyLeak(child, childPath);
    if (leak) return leak;
  }
  return null;
}

function tankPayloadLeak(payload: ServerGameStatePayload): string | null {
  const keyLeak = hiddenKeyLeak(payload, "");
  if (keyLeak) return keyLeak;
  const state = payload.game.gameState as TankArenaState | null;
  if (!state) return null;
  if (Object.keys(state.plans).length)
    return "Tank Arena state exposed locked plans";
  if (state.phase === "select" && state.tanks.some((tank) => tank.kind))
    return "Tank Arena state exposed tank picks before everyone chose";
  if (state.phase === "finished") return null;
  const moves = payload.moves ?? (payload.move ? [payload.move] : []);
  for (const move of moves) {
    const data = move.moveData as { type: string; round: number };
    if (
      data.round === state.round &&
      data.type !== "submitted" &&
      data.type !== "forfeit"
    )
      return "Tank Arena move exposed an unresolved plan";
  }
  return null;
}

function observeTank(payload: ServerGameStatePayload): void {
  const leak = tankPayloadLeak(payload);
  if (leak) tankViolations.push(leak);
  const state = payload.game.gameState as TankArenaState | null;
  if (!state) return;
  const record = tankRecords.get(payload.game.id) ?? {
    resolved: new Map(),
    starts: new Map(),
  };
  tankRecords.set(payload.game.id, record);
  if (state.resolution && !record.resolved.has(state.resolution.round))
    record.resolved.set(state.resolution.round, state);
  if (state.phase === "plan" && !record.starts.has(state.round))
    record.starts.set(state.round, state.tanks);
}

function assertNoTankLeaks(): void {
  const [leak] = tankViolations;
  if (leak) throw new Error(leak);
}

async function tankPlayer(guest: Guest): Promise<TankPlayer> {
  const socket = io(origin, {
    autoConnect: false,
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { Cookie: guest.cookie },
  });
  const player: TankPlayer = { guest, socket, log: [] };
  socket.on("game_state", (payload: ServerGameStatePayload) => {
    if (payload.game.gameType !== TANK_ARENA) return;
    observeTank(payload);
    player.log.push(payload);
  });
  sockets.push(socket);
  await connect(socket);
  return player;
}

function tankState(game: GameJson): TankArenaState {
  const state = game.gameState as TankArenaState | null;
  if (!state) throw new Error("Tank Arena state is missing");
  return state;
}

async function fetchTank(code: string, guest: Guest): Promise<TankSnapshot> {
  const response = await fetch(`${origin}/api/games/${code}`, {
    headers: { Cookie: guest.cookie },
  });
  if (!response.ok)
    throw new Error(`Tank Arena snapshot failed: ${response.status}`);
  const snapshot = (await response.json()) as TankSnapshot;
  observeTank(snapshot);
  return snapshot;
}

async function joinTankRoom(
  player: TankPlayer,
  code: string,
): Promise<ServerGameStatePayload> {
  const error = await player.socket
    .timeout(8000)
    .emitWithAck("join_room", { gameId: code });
  if (error) throw new Error(`Joining the Tank Arena room failed: ${error}`);
  const snapshot = player.log.findLast(
    (payload) => payload.game.id === code && payload.moves,
  );
  if (!snapshot) throw new Error("Joining did not deliver a snapshot");
  return snapshot;
}

async function submitTankMove(
  player: TankPlayer,
  code: string,
  moveData: TankArenaMove,
): Promise<string | null> {
  const errors: string[] = [];
  const onError = (payload: { message: string }) => {
    errors.push(payload.message);
  };
  player.socket.on("game_error", onError);
  try {
    const error = await player.socket
      .timeout(8000)
      .emitWithAck("make_move", { gameId: code, moveData });
    return typeof error === "string" ? error : (errors[0] ?? null);
  } finally {
    player.socket.off("game_error", onError);
  }
}

async function mustMoveTank(
  player: TankPlayer,
  code: string,
  moveData: TankArenaMove,
): Promise<void> {
  const error = await submitTankMove(player, code, moveData);
  if (error) throw new Error(`Tank Arena rejected a legal move: ${error}`);
}

function isPending(state: TankArenaState, role: string): boolean {
  return (
    state.phase !== "finished" &&
    !state.submitted.includes(role) &&
    state.tanks.some((tank) => tank.role === role && tank.alive)
  );
}

function aimLock(state: TankArenaState, seat: TankSeat): TankArenaMove {
  const index = state.seats.findIndex((entry) => entry.role === seat.role);
  const tank = state.tanks[index];
  if (!tank?.kind) throw new Error(`No tank was chosen for ${seat.role}`);
  const width = arenaWidth(state);
  const team = roleTeam(state, seat.role);
  let dx = width / 2;
  for (const other of state.tanks) {
    if (!other.alive || roleTeam(state, other.role) === team) continue;
    const delta = ((other.x - tank.x + width * 1.5) % width) - width / 2;
    if (Math.abs(delta) < Math.abs(dx)) dx = delta;
  }
  const preferred =
    ACTION_CYCLE[(state.round + index) % ACTION_CYCLE.length] ?? "missile";
  const action = canUse(state, seat.role, preferred) ? preferred : "missile";
  if (!canUse(state, seat.role, action))
    throw new Error(`${seat.role} cannot lock ${action}`);
  if (isJumpAction(tank.kind, action))
    return {
      type: "lock",
      round: state.round,
      action,
      angle: dx >= 0 ? 80 : 100,
      power: 0.35,
    };
  const speed = Math.sqrt(GRAVITY * Math.abs(dx));
  return {
    type: "lock",
    round: state.round,
    action,
    angle: dx >= 0 ? 45 : 135,
    power: round4(
      Math.min(1, Math.max(MIN_POWER, speed / TANKS[tank.kind].maxShotSpeed)),
    ),
  };
}

function idleLock(state: TankArenaState): TankArenaMove {
  return {
    type: "lock",
    round: state.round,
    action: "idle",
    angle: 90,
    power: 0.5,
  };
}

function forfeitMove(state: TankArenaState): TankArenaMove {
  return { type: "forfeit", round: state.round };
}

async function playTankRound(
  code: string,
  seats: TankSeat[],
  decide: TankDecision,
  afterMove?: (seat: TankSeat) => Promise<void>,
): Promise<TankSnapshot> {
  const [first] = seats;
  if (!first) throw new Error("A Tank Arena round needs players");
  let snapshot = await fetchTank(code, first.player.guest);
  const round = tankState(snapshot.game).round;
  for (const seat of seats) {
    const state = tankState(snapshot.game);
    if (snapshot.game.status !== "active" || state.round !== round) break;
    if (!isPending(state, seat.role)) continue;
    await mustMoveTank(seat.player, code, decide(state, seat));
    await afterMove?.(seat);
    snapshot = await fetchTank(code, seat.player.guest);
  }
  const after = tankState(snapshot.game);
  if (snapshot.game.status === "active" && after.round === round)
    throw new Error(`Tank Arena round ${round} did not resolve`);
  return snapshot;
}

async function selectTanks(code: string, seats: TankSeat[]): Promise<void> {
  await playTankRound(code, seats, (state, seat) => ({
    type: "select",
    round: 0,
    tank:
      state.seats.findIndex((entry) => entry.role === seat.role) % 2 === 0
        ? "bastion"
        : "kestrel",
  }));
}

async function playTankRounds(
  code: string,
  seats: TankSeat[],
  rounds: number,
): Promise<TankSnapshot> {
  const [first] = seats;
  if (!first) throw new Error("A Tank Arena game needs players");
  let snapshot = await fetchTank(code, first.player.guest);
  for (let played = 0; played < rounds; played++) {
    if (snapshot.game.status !== "active") break;
    snapshot = await playTankRound(code, seats, aimLock);
  }
  return snapshot;
}

async function forfeitTeam(
  code: string,
  seats: TankSeat[],
  team: string,
): Promise<TankSnapshot> {
  const [first] = seats;
  if (!first) throw new Error("A Tank Arena game needs players");
  let snapshot = await fetchTank(code, first.player.guest);
  while (snapshot.game.status === "active")
    snapshot = await playTankRound(code, seats, (state, seat) =>
      roleTeam(state, seat.role) === team
        ? forfeitMove(state)
        : idleLock(state),
    );
  return snapshot;
}

function verifyResolution(state: TankArenaState): void {
  const input = resolutionInput(state);
  if (!input || !state.resolution)
    throw new Error("A resolved round has no replay input");
  const result = simulateRound(input);
  if (result.steps !== state.resolution.steps)
    throw new Error(`Round ${state.resolution.round} replayed a new length`);
  const width = arenaWidth(state);
  const tanks = new Map(state.tanks.map((tank) => [tank.role, tank]));
  for (const out of result.tanks) {
    const tank = tanks.get(out.role);
    if (!tank) throw new Error(`Round replay invented ${out.role}`);
    const dx = Math.abs(round4(out.x) - tank.x) % width;
    const drift = Math.min(dx, width - dx) + Math.abs(round4(out.y) - tank.y);
    const hpDrift = tank.alive
      ? Math.abs(round4(Math.max(0, out.hp)) - tank.hp)
      : 0;
    if (drift > 1e-6 || hpDrift > 1e-6)
      throw new Error(
        `Round ${state.resolution.round} replay moved ${out.role} elsewhere`,
      );
  }
}

async function verifyTankGame(
  code: string,
  guest: Guest,
): Promise<{ snapshot: TankSnapshot; state: TankArenaState; rounds: number }> {
  const snapshot = await fetchTank(code, guest);
  const { game, moves } = snapshot;
  const state = tankState(game);
  const outcome = state.outcome;
  if (game.status !== "completed" || state.phase !== "finished" || !outcome)
    throw new Error("The Tank Arena game did not complete");
  const winnerRoles = new Set(outcome.winnerRoles);
  const winners = game.players
    .filter((player) => winnerRoles.has(player.role))
    .map((player) => player.userId);
  const winner = outcome.draw
    ? "draw"
    : winners.length === 1
      ? (winners[0] ?? null)
      : null;
  if (
    JSON.stringify(game.winners) !== JSON.stringify(winners) ||
    game.winner !== winner
  )
    throw new Error("Persisted winners disagree with the final state");
  if (!outcome.draw) {
    const teams = new Set(
      outcome.winnerRoles.map((role) => roleTeam(state, role)),
    );
    const [team] = teams;
    if (teams.size !== 1 || !team || !aliveTeams(state).includes(team))
      throw new Error("The winning roles are not one surviving team");
  }
  const record = tankRecords.get(code);
  const rounds = state.resolution?.round ?? 0;
  let expectedMoves = state.seats.length;
  for (let round = 1; round <= rounds; round++) {
    const resolved = record?.resolved.get(round);
    const start = record?.starts.get(round);
    if (!resolved?.resolution || !start)
      throw new Error(`Round ${round} was never observed`);
    if (
      JSON.stringify(resolved.resolution.before.tanks) !== JSON.stringify(start)
    )
      throw new Error(`Round ${round} did not start from the prior result`);
    verifyResolution(resolved);
    expectedMoves += Object.keys(resolved.resolution.plans).length;
  }
  if (moves.length !== expectedMoves)
    throw new Error(
      `Expected ${expectedMoves} persisted moves, found ${moves.length}`,
    );
  const seatRoles = new Map(
    game.players.map((player) => [player.userId, player.role]),
  );
  for (const move of moves) {
    const data = move.moveData as TankArenaMove;
    if (data.type === "select") continue;
    const role = seatRoles.get(move.playerId);
    const plan = role
      ? record?.resolved.get(data.round)?.resolution?.plans[role]
      : undefined;
    const matches =
      data.type === "forfeit"
        ? plan?.action === "forfeit"
        : plan?.action === data.action &&
          plan.angle === round4(data.angle) &&
          plan.power === round4(data.power);
    if (!matches)
      throw new Error(`A persisted move disagrees with round ${data.round}`);
  }
  assertNoTankLeaks();
  return { snapshot, state, rounds };
}

async function reconnectMidRound(
  player: TankPlayer,
  code: string,
  role: string,
  lockedBy: { userId: string; role: string },
): Promise<void> {
  player.socket.disconnect();
  await connect(player.socket);
  const restored = await joinTankRoom(player, code);
  const state = tankState(restored.game);
  const locked = restored.moves?.filter(
    (move) =>
      move.playerId === lockedBy.userId &&
      (move.moveData as { round: number }).round === state.round,
  );
  if (
    state.phase !== "plan" ||
    !state.submitted.includes(lockedBy.role) ||
    state.submitted.includes(role) ||
    Object.keys(state.plans).length > 0 ||
    locked?.length !== 1 ||
    JSON.stringify(locked[0]?.moveData) !==
      JSON.stringify({ type: "submitted", round: state.round })
  )
    throw new Error("The reconnect snapshot did not hide the locked plan");
}

async function privateTankLobby(pool: Guest[]): Promise<string> {
  const [host, guest] = await Promise.all(pool.slice(0, 2).map(tankPlayer));
  if (!host || !guest) throw new Error("Two Tank Arena players are required");
  const created = (await host.socket
    .timeout(8000)
    .emitWithAck("room:create", { gameType: TANK_ARENA })) as {
    ok: boolean;
    code?: string;
  };
  if (!created.ok || !created.code)
    throw new Error("Tank Arena room creation failed");
  const code = created.code;
  await joinTankRoom(host, code);
  const found = (await guest.socket
    .timeout(8000)
    .emitWithAck("room:join", { code })) as { ok: boolean };
  if (!found.ok) throw new Error("The Tank Arena room code was not found");
  const lobby = await joinTankRoom(guest, code);
  if (lobby.game.status !== "waiting" || lobby.game.players.length !== 2)
    throw new Error("The Tank Arena lobby did not seat both players");
  const config = {
    mode: "teams",
    teams: { [host.guest.userId]: "A", [guest.guest.userId]: "B" },
    bots: [{ id: "bot:1", difficulty: "normal", team: "B" }],
  };
  const intruderConfigure = (await guest.socket
    .timeout(8000)
    .emitWithAck("room:configure", { gameId: code, config })) as {
    ok: boolean;
  };
  const intruderStart = (await guest.socket
    .timeout(8000)
    .emitWithAck("room:start", { gameId: code })) as { ok: boolean };
  if (intruderConfigure.ok || intruderStart.ok)
    throw new Error("A non-host changed or started the lobby");
  const configured = (await host.socket
    .timeout(8000)
    .emitWithAck("room:configure", { gameId: code, config })) as {
    ok: boolean;
  };
  if (!configured.ok) throw new Error("The host could not configure teams");
  const started = (await host.socket
    .timeout(8000)
    .emitWithAck("room:start", { gameId: code })) as { ok: boolean };
  if (!started.ok) throw new Error("The host could not start the lobby");
  const opening = await fetchTank(code, host.guest);
  const expectedSeats = [
    { role: "p1", team: "A", bot: null },
    { role: "p2", team: "B", bot: null },
    { role: "p3", team: "B", bot: "normal" },
  ];
  if (
    opening.game.status !== "active" ||
    JSON.stringify(tankState(opening.game).seats) !==
      JSON.stringify(expectedSeats) ||
    !opening.game.players.some(
      (player) =>
        player.userId === "bot:1" && player.username === "Bot 1 (Normal)",
    )
  )
    throw new Error("The started lobby has the wrong seats");
  const seats: TankSeat[] = [
    { player: host, role: "p1" },
    { player: guest, role: "p2" },
  ];
  await mustMoveTank(host, code, { type: "select", round: 0, tank: "bastion" });
  if (
    !(await submitTankMove(host, code, {
      type: "select",
      round: 0,
      tank: "kestrel",
    }))
  )
    throw new Error("A second tank pick in one round was accepted");
  await mustMoveTank(guest, code, {
    type: "select",
    round: 0,
    tank: "kestrel",
  });
  await playTankRound(code, seats, aimLock, async (seat) => {
    if (seat.player === host)
      await reconnectMidRound(guest, code, "p2", {
        userId: host.guest.userId,
        role: "p1",
      });
  });
  await playTankRounds(code, seats, 2);
  await forfeitTeam(code, seats, "A");
  const { snapshot, state, rounds } = await verifyTankGame(code, host.guest);
  const winnerIds = new Set(snapshot.game.winners);
  const names = snapshot.game.players
    .filter((player) => winnerIds.has(player.userId))
    .map((player) => player.username);
  const team = state.outcome?.draw
    ? "a draw"
    : `team ${roleTeam(state, state.outcome?.winnerRoles[0] ?? "") ?? "?"} (${names.join(", ")})`;
  return `Tank Arena private lobby: host-only configure and start, teams with a normal bot, a mid-round reconnect that hid the locked plan, ${rounds} resolved rounds re-simulated to the stored positions, ${snapshot.moves.length} persisted moves, and ${team} won.`;
}

async function matchTankQueue(
  players: TankPlayer[],
  config: { mode: "ffa" | "teams" },
): Promise<string> {
  const [player, ...waiting] = players;
  if (!player) throw new Error("The Tank Arena queue did not match");
  const ack = (await player.socket
    .timeout(8000)
    .emitWithAck("game:queue_join", { gameType: TANK_ARENA, config })) as {
    ok: boolean;
    gameId: string | null;
  };
  if (!ack.ok) throw new Error("Tank Arena queue join failed");
  if (waiting.length) {
    if (ack.gameId)
      throw new Error("The Tank Arena queue matched before it filled");
    return matchTankQueue(waiting, config);
  }
  if (!ack.gameId) throw new Error("The Tank Arena queue did not match");
  return ack.gameId;
}

async function seatPublicTank(
  code: string,
  players: TankPlayer[],
): Promise<{ seats: TankSeat[]; identities: RegExp }> {
  const identities = new RegExp(
    players.map((player) => player.guest.userId).join("|"),
  );
  const seats = await Promise.all(
    players.map(async (player): Promise<TankSeat> => {
      const snapshot = await fetchTank(code, player.guest);
      const viewer = snapshot.game.viewerId;
      const role = snapshot.game.players.find(
        (entry) => entry.userId === viewer,
      )?.role;
      if (!role || viewer !== `${code}:${role}`)
        throw new Error("A public Tank Arena seat has no alias");
      if (identities.test(JSON.stringify(snapshot)))
        throw new Error("A public Tank Arena snapshot leaked an identity");
      await joinTankRoom(player, code);
      return { player, role };
    }),
  );
  return { seats, identities };
}

function assertAliased(players: TankPlayer[], identities: RegExp): void {
  for (const player of players)
    if (identities.test(JSON.stringify(player.log)))
      throw new Error("Public Tank Arena realtime state leaked an identity");
}

async function publicTankDuel(pool: Guest[]): Promise<string> {
  const players = await Promise.all(pool.slice(0, 2).map(tankPlayer));
  const code = await matchTankQueue(players, { mode: "ffa" });
  const { seats, identities } = await seatPublicTank(code, players);
  const [first, second] = seats;
  if (!first || !second) throw new Error("A duel needs two seats");
  await selectTanks(code, seats);
  let snapshot = await playTankRounds(code, seats, 2);
  const played = tankState(snapshot.game).resolution?.round ?? 0;
  const forfeited = snapshot.game.status === "active";
  if (forfeited) snapshot = await forfeitTeam(code, seats, first.role);
  const { state, rounds } = await verifyTankGame(code, first.player.guest);
  const winnerAlias = `${code}:${second.role}`;
  if (
    forfeited &&
    (snapshot.game.winner !== winnerAlias ||
      JSON.stringify(snapshot.game.winners) !== JSON.stringify([winnerAlias]))
  )
    throw new Error("The duel forfeit did not award the opponent");
  assertAliased(players, identities);
  const ending = forfeited
    ? `${first.role} forfeited round ${rounds} and ${second.role} won`
    : `${state.outcome?.draw ? "a draw" : `${state.outcome?.winnerRoles.join(", ")} won`} in round ${rounds}`;
  return `Tank Arena public 1v1: two queued guests were matched under aliases, played ${played} real rounds with hidden plans, and ${ending}. No account IDs, secrets, or unresolved plans reached either client.`;
}

async function publicTankTeams(pool: Guest[]): Promise<string> {
  const players = await Promise.all(pool.slice(0, 4).map(tankPlayer));
  const code = await matchTankQueue(players, { mode: "teams" });
  const { seats, identities } = await seatPublicTank(code, players);
  const [first] = seats;
  if (!first) throw new Error("A 2v2 match needs seats");
  const opening = tankState((await fetchTank(code, first.player.guest)).game);
  const sizes = new Map<string, number>();
  for (const seat of opening.seats)
    sizes.set(seat.team, (sizes.get(seat.team) ?? 0) + 1);
  if (
    sizes.size !== 2 ||
    [...sizes.values()].some((size) => size !== 2) ||
    opening.seats.some((seat) => seat.bot)
  )
    throw new Error("The 2v2 match did not form two teams of two humans");
  await selectTanks(code, seats);
  const played = await playTankRounds(code, seats, 1);
  const losing = roleTeam(opening, first.role);
  if (!losing) throw new Error("The first 2v2 seat has no team");
  const forfeited = played.game.status === "active";
  await forfeitTeam(code, seats, losing);
  const { snapshot, state } = await verifyTankGame(code, first.player.guest);
  const winningTeam = state.outcome?.draw
    ? null
    : roleTeam(state, state.outcome?.winnerRoles[0] ?? "");
  const expected = opening.seats
    .filter((seat) => seat.team === winningTeam)
    .map((seat) => `${code}:${seat.role}`);
  if (
    !winningTeam ||
    (forfeited && winningTeam === losing) ||
    JSON.stringify(snapshot.game.winners) !== JSON.stringify(expected) ||
    snapshot.game.winner !== null
  )
    throw new Error("The 2v2 result does not list the whole winning team");
  assertAliased(players, identities);
  const ending = forfeited
    ? `team ${losing} forfeited after a real round`
    : "a real round ended the match";
  return `Tank Arena public 2v2: four queued guests formed two aliased teams, ${ending}, and team ${winningTeam} won with both aliases listed and no single winner.`;
}

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
  const accountIdPattern = new RegExp(
    guests.map((guest) => guest.userId).join("|"),
  );
  if (accountIdPattern.test(JSON.stringify(snapshots)))
    throw new Error("Public snapshot leaked an identity");
  const outsider = await createGuest();
  const forbidden = await fetch(`${origin}/api/games/${publicCode}`, {
    headers: { Cookie: outsider.cookie },
  });
  if (forbidden.status !== 404)
    throw new Error("Outsider could access a public match");
  await Promise.all(
    sockets.map(async (socket) => {
      const ready = waitForState(
        socket,
        publicCode,
        (state) => state.game.status === "active",
      );
      socket.emit("join_room", { gameId: publicCode });
      await ready;
    }),
  );
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
  if (!chatResponse.ok) throw new Error("Match chat could not be loaded");
  const chat = (await chatResponse.json()) as { messages: unknown[] };
  if (chat.messages.length !== 1)
    throw new Error("Match chat did not synchronize");
  const peerOf = (view: GameJson | undefined) =>
    view?.players.find((player) => player.userId !== view.viewerId)?.userId;
  const hostPeer = peerOf(snapshots[0]?.game);
  const opponentPeer = peerOf(snapshots[1]?.game);
  if (!hostPeer || !opponentPeer)
    throw new Error("Public player aliases could not be resolved");
  const firstChoice = await host
    .timeout(8000)
    .emitWithAck("match:friend", { gameId: publicCode, playerId: hostPeer });
  if (!firstChoice.ok || firstChoice.mutual)
    throw new Error("One-sided consent created a friendship");
  const secondChoice = await opponent
    .timeout(8000)
    .emitWithAck("match:friend", {
      gameId: publicCode,
      playerId: opponentPeer,
    });
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
    if (accountIdPattern.test(JSON.stringify(state)))
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
  if (!ended.ok) throw new Error("Ended chat could not be loaded");
  if (((await ended.json()) as { messages: unknown[] }).messages.length)
    throw new Error("Ended match chat is still visible");
  const permanent = await fetch(`${origin}/api/conversations`, {
    headers: { Cookie: guests[0]?.cookie ?? "" },
  });
  if (!permanent.ok) throw new Error("Permanent chats could not be loaded");
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
  const pool = [...guests, outsider, await createGuest()];
  process.stdout.write(`${await privateTankLobby(pool)}\n`);
  process.stdout.write(`${await publicTankDuel(pool)}\n`);
  process.stdout.write(`${await publicTankTeams(pool)}\n`);
} finally {
  for (const socket of sockets) socket.disconnect();
}
