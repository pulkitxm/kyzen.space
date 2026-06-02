# Realtime: Socket.IO, Two Lanes & the Game Driver

## What this is / why it matters

Everything live in this app — chat messages, typing dots, presence, friend requests, notifications, and the moment-to-moment play of a game — rides over **one Socket.IO connection per browser tab**. The realtime layer lives entirely in `apps/server/src/realtime/`. It does three jobs:

1. **Authenticates the socket once, from the Better Auth session cookie** carried in the WebSocket handshake, and stamps `socket.data.userId` so every downstream handler knows who is talking without re-checking auth.
2. **Multiplexes two logically separate "lanes" onto that single connection** — a **chat lane** (chat, friends, typing, presence, in-chat game creation, notifications) and a **game lane** (`join_room` / `make_move` / `leave_room`). They share a connection but are wired and validated independently. The browser opens **one** Socket.IO connection (the web app's `SocketProvider`); game boards reuse it rather than dialing their own — see [games-client](./games-client.md).
3. **Routes every game action through an authoritative driver** that loads the game, validates the payload *and the stored state* against the game's strict Zod schemas (the same schemas the client uses), applies the pure engine `reduce`, persists the result, and broadcasts the new state.

The reason this matters — and the single most important idea in the whole subsystem — is that **the client is never trusted**. The browser imports `@gamelobby/games-core` to render a board and *predict* legality, but the server imports the *exact same* `GameDefinition` (engine + `moveSchema` + `stateSchema`) and re-validates everything. The frontend's copy of the engine is a UX convenience; the server's copy is the source of truth. A hand-crafted `make_move` packet hits `clientMakeMoveSchema.safeParse`, then `def.moveSchema.safeParse`, then `def.engine.reduce` returning `{ ok: false }` — three independent rejections before any database write happens.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/realtime/index.ts` | `attachRealtime`: build the `IOServer`, attach the Redis adapter, install the handshake-cookie auth middleware, and on each connection wire every chat-lane handler plus the three game-lane listeners (`join_room`, `make_move`, `leave_room`). |
| `apps/server/src/realtime/io.ts` | `setIO` / `getIO` singleton so non-socket code (e.g. `notify`) can emit without holding a `socket` reference. |
| `apps/server/src/realtime/rooms.ts` | Room name helpers + emit helpers: `gameRoom`/`convRoom`/`userRoom` naming and `emitToGame`/`emitToConv`/`emitToUser`. |
| `apps/server/src/realtime/drivers.ts` | `RealtimeDriver` interface + `getDriver` indirection; currently always returns the turn-based driver. |
| `apps/server/src/realtime/turn-based.ts` | The driver itself: `handleJoinRoom` (seating) and `handleMakeMove` (authoritative validate → reduce → persist → finalize → broadcast). |
| `apps/server/src/realtime/chat.ts` | Chat-lane handlers (join/leave conversation, send message, mark read, DM/group lifecycle, notification read) and `joinUserRooms` on connect. |
| `apps/server/src/realtime/friends.ts` | Friend request / respond / remove handlers. |
| `apps/server/src/realtime/typing.ts` | In-memory per-conversation typing indicator with a 5 s TTL and disconnect cleanup. |
| `apps/server/src/realtime/presence.ts` | In-memory online/last-seen tracking, reference-counted by socket id, broadcast to friends + co-conversation members. |
| `apps/server/src/realtime/games-in-chat.ts` | `createGameInConversation` over the socket: validate payload, create the game, post a game-card message. |
| `apps/server/src/realtime/notify.ts` | `notify(userId, type, opts)`: persist a notification row and push it to the user's room via the `getIO()` singleton. |
| `apps/server/src/realtime/redis.ts` | Optional `@socket.io/redis-adapter` wiring for multi-node scale-out; no-op without `REDIS_URL`. |
| `apps/server/src/realtime/socket-util.ts` | Tiny helpers shared by chat handlers: `isObj`/`str`/`strArray` coercion, `ack`/`ackErr` ack shaping, and `register` (a try/catch wrapper around `socket.on`). |
| `apps/server/src/realtime/socket-data.d.ts` | Module augmentation typing `socket.data.userId: string`. |

## Setup: `attachRealtime`

`apps/server/src/index.ts` creates a Node HTTP server around the Express/Hono app and hands it to `attachRealtime` (`apps/server/src/index.ts:30`). Everything in this doc hangs off that one call.

```ts
export function attachRealtime(httpServer: HTTPServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/socket.io",
    transports: ["websocket"],
    cors: { origin: env.webUrl, credentials: true },
  });

  attachRedisAdapter(io);
  setIO(io);
```

`apps/server/src/realtime/index.ts:24` — three things to note. `transports: ["websocket"]` skips the HTTP long-poll fallback entirely (one transport, simpler reasoning). `cors.credentials: true` plus a concrete `origin` is what lets the browser send the auth cookie cross-origin. And `setIO(io)` (`apps/server/src/realtime/io.ts:5`) stashes the server in a module singleton so code with no socket in scope — most importantly `notify` — can still emit.

### The auth middleware: one cookie check per connection

Authentication happens **once**, in an `io.use` middleware, before any handler is wired:

```ts
io.use(async (socket, next) => {
  try {
    const cookie = socket.handshake.headers.cookie;
    const session = await getAuth().api.getSession({
      headers: new Headers(cookie ? { cookie } : {}),
    });
    const userId = session?.user?.id;
    if (!userId) {
      log.debug("socket auth rejected (no session)");
      return next(new Error("Unauthorized"));
    }
    socket.data.userId = userId;
    next();
  } catch (e) {
```

`apps/server/src/realtime/index.ts:33`. The WebSocket handshake is an HTTP upgrade, so it carries the same cookies the browser would send to any same-site request. We hand the raw `Cookie` header to Better Auth's `getSession`, and on success stamp `socket.data.userId`. That field is typed by the module augmentation in `apps/server/src/realtime/socket-data.d.ts:4`:

```ts
declare module "socket.io" {
  interface SocketData {
    userId: string;
  }
}
```

The payoff: no handler ever re-reads the cookie or accepts a `userId` from the wire. `const userId = socket.data.userId` is trusted identity everywhere downstream (`turn-based.ts:105`, `chat.ts:17`, `friends.ts:7`, `typing.ts:40`, `presence.ts:52`, `games-in-chat.ts:20`). A forged `userId` in a payload is simply ignored — the only `userId` that exists came from a verified session.

### Per-connection wiring

```ts
io.on("connection", (socket) => {
  const slog = log.child({ socketId: socket.id, userId: socket.data.userId });
  slog.info("socket connected");

  void joinUserRooms(socket);
  attachChatHandlers(io, socket);
  attachFriendHandlers(io, socket);
  attachTypingHandlers(io, socket);
  attachGameChatHandlers(io, socket);
  void handlePresenceConnect(io, socket);
```

`apps/server/src/realtime/index.ts:52`. On every connection we (1) join the user's rooms, (2) attach the four chat-lane handler groups, (3) kick off presence, and then (further down) register the three game-lane listeners (`join_room`, `make_move`, `leave_room`). Note `joinUserRooms` and `handlePresenceConnect` are `async` and fire-and-forgotten with `void`; the listener registrations below them are synchronous, so handlers exist immediately even while those promises resolve.

## The two lanes

Both lanes are events on the same `socket`, but they are deliberately built and validated differently. Understanding the split is the key to reading this directory.

### Lane 1 — the chat lane

The chat lane covers chat, friends, typing, presence, in-chat game *creation*, and notifications. Its event names are centralized in `@gamelobby/chat-core`'s `CHAT_EVENTS` constant (`packages/chat-core/src/socket-events.ts:14`), so client and server never disagree on a string literal.

Most chat-lane handlers go through the `register` helper, which is the lane's signature pattern:

```ts
export function register(
  socket: Socket,
  event: string,
  fn: (payload: unknown, cb?: AckFn) => Promise<void>,
): void {
  socket.on(event, (payload: unknown, cb?: AckFn) => {
    void (async () => {
      try {
        await fn(payload, cb);
      } catch (e) {
        log.error(
          { err: e, event, userId: socket.data.userId },
          "chat handler failed",
        );
        cb?.({ ok: false, error: e instanceof Error ? e.message : "error" });
      }
    })();
  });
}
```

`apps/server/src/realtime/socket-util.ts:36`. `register` does three things every chat handler would otherwise repeat: wraps the async body so a thrown error never crashes the process, logs with the event name and user id, and returns a uniform `{ ok: false, error }` over the **acknowledgement callback** (`cb`). The chat lane's convention is *acks, not broadcasts, for the caller's result* — the success path uses `ack(cb, serviceResult, key)`:

```ts
export function ack<T>(
  cb: AckFn | undefined,
  res: ServiceResult<T>,
  key: string,
): void {
  if (res.ok) cb?.({ ok: true, [key]: res.value });
  else cb?.({ ok: false, error: res.error });
}
```

`apps/server/src/realtime/socket-util.ts:27`. Chat handlers themselves are thin: they coerce fields off an untyped payload with `isObj`/`str`/`strArray` (`socket-util.ts:9`), delegate to a `*-service` module, and `ack` the result. For example `CHAT_EVENTS.sendMessage` (`chat.ts:35`) pulls `conversationId`, `body`, `clientId` and calls `messagesService.sendMessage`, which is what actually fans the new message out to the conversation room. Membership is checked server-side: `conversationJoin` refuses a room you are not a member of (`chat.ts:22`).

`joinUserRooms` runs once on connect and seeds the socket's room membership (`chat.ts:9`):

```ts
export async function joinUserRooms(socket: Socket): Promise<void> {
  const userId = socket.data.userId;
  void socket.join(userRoom(userId));
  const ids = await conversations.getConversationIdsForUser(userId);
  for (const id of ids) void socket.join(convRoom(id));
}
```

So a freshly connected socket is already in its personal `user:<id>` room (for notifications, presence, friend events) and in a `conv:<id>` room for every conversation it belongs to — without any client round-trip.

**Typing** and **presence** are the two lane members that keep ephemeral in-memory state rather than touching the DB. Typing stores a `Map<conversationId, Map<userId, Entry>>` with a 5 s `setTimeout` TTL per typer and re-broadcasts the full typer list on every change (`typing.ts:8`, `typing.ts:20`, `typing.ts:56`); a disconnect clears all of that socket's active typers (`typing.ts:77`). Presence reference-counts a user's live socket ids — a user is online while `sockets.size > 0`, so opening a second tab does not double-count and closing one tab does not flip them offline (`presence.ts:19`, `presence.ts:54`, `presence.ts:79`). Presence only broadcasts a transition (`if (!wasOnline)` on connect, `if (p.sockets.size > 0) return` on disconnect) to a computed *audience* of friends plus co-conversation members (`presence.ts:33`).

**`notify`** is the chat lane's escape hatch for code that has no socket. It persists a notification row, then emits to the recipient's user room via the `getIO()` singleton — note the self-suppression guard so you are never notified about your own action:

```ts
export async function notify(
  userId: string,
  type: NotificationType,
  opts: { actorId?: string | null; payload?: NotificationPayload } = {},
): Promise<void> {
  if (opts.actorId && opts.actorId === userId) return;

  const row = await notifications.create({
```

`apps/server/src/realtime/notify.ts:11`. This is why `setIO` exists: `createGameInConversation` (a service, no socket) loops conversation members and calls `notify`, which reaches for `getIO()` rather than threading a socket through every call.

### Lane 2 — the game lane

The game lane is three events — `join_room`, `make_move`, and `leave_room` — and it is wired differently from the chat lane in three deliberate ways:

1. **Distinct event names** outside `CHAT_EVENTS` (plain `"join_room"` / `"make_move"` / `"leave_room"`), and a distinct error channel `"game_error"`. `leave_room` (`index.ts:129`) reuses `clientJoinRoomSchema` (just `{ gameId }`), then calls `leaveGameRoom(socket, gameId)` (`rooms.ts:11`) to `socket.leave` the `game:<id>` room — boards emit it on unmount so the *shared, persistent* connection doesn't accumulate stale game rooms as the user navigates between games. It is the one game-lane listener that is synchronous (no DB work) and so is not wrapped in `void (async () => …)`.
2. **Zod validation from `@gamelobby/games-core`**, not the loose `isObj`/`str` coercion of the chat lane. The wire envelope is parsed with `clientJoinRoomSchema` / `clientMakeMoveSchema` before anything else.
3. **A driver indirection** — the handler does not contain game logic; it looks up the game's type, fetches a `RealtimeDriver`, and delegates.

```ts
socket.on("make_move", (payload: unknown, cb?: (err?: string) => void) => {
  void (async () => {
    const parsed = clientMakeMoveSchema.safeParse(payload);
    if (!parsed.success) {
      slog.warn({ payload }, "invalid make_move payload");
      cb?.("Invalid payload");
      socket.emit("game_error", { message: "Invalid make_move payload" });
      return;
    }
    const data = parsed.data;
    const start = performance.now();
    try {
      const gameRow = await games.getGameById(data.gameId);
      const driver = getDriver(gameRow?.gameType ?? "");
      await driver.makeMove(io, socket, data);
```

`apps/server/src/realtime/index.ts:96` (the `join_room` listener immediately above it at `index.ts:63` follows the identical shape). The envelope schemas are strict and tiny — `clientMakeMoveSchema` is `{ gameId: uuid, moveData: unknown }.strict()` (`packages/games-core/src/schemas.ts:36`); the *contents* of `moveData` are validated later by the game-specific `moveSchema` inside the driver, because the envelope layer cannot know what shape a Reversi vs. a Tic-Tac-Toe move takes. `clientJoinRoomSchema` adds an optional `intent: "play" | "spectate"` (`schemas.ts:28`).

`join_room` and `make_move` report failures *twice*: through the ack callback (`cb?.(msg)`) for the specific caller, and as a `"game_error"` emit. They also wrap the body in `try/catch` and log a `durationMs` on success — the game lane's own version of the safety/observability that `register` gives the chat lane. (`leave_room` only acks; it has nothing to fail at beyond payload validation.)

## The driver indirection

`getDriver` is a seam, not (yet) a strategy with multiple implementations:

```ts
const socketIoTurnBasedDriver: RealtimeDriver = {
  kind: "socketio-turn-based",
  joinRoom: handleJoinRoom,
  makeMove: handleMakeMove,
};

export function getDriver(_gameType: string): RealtimeDriver {
  return socketIoTurnBasedDriver;
}
```

`apps/server/src/realtime/drivers.ts:19`. Today every game type maps to the one turn-based driver, so `_gameType` is unused (prefixed with `_`). The point of the indirection is that the `GameEngine` interface already distinguishes `mode: "turn-based" | "realtime"` (`packages/games-core/src/engine.ts:17`) and exposes an optional `step` (`engine.ts:26`) alongside `reduce` (`engine.ts:24`). A future realtime/tick-based driver would implement the same `RealtimeDriver` interface (`drivers.ts:5`), and `getDriver` would branch on the game's mode — without touching `index.ts`, whose listeners only know `driver.joinRoom` / `driver.makeMove`.

## The authoritative game flow

This is where the "never trust the client" principle is enforced. Both driver handlers live in `apps/server/src/realtime/turn-based.ts`.

### `handleJoinRoom` and seating

```ts
export async function handleJoinRoom(
  io: IOServer,
  socket: Socket,
  payload: ClientJoinRoom,
): Promise<void> {
  const userId = socket.data.userId;
  if (!UUID_RE.test(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameById(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");

  const { game, changed } = await ensureSeated(
    gameRow,
    userId,
    payload.intent ?? "play",
  );

  joinGameRoom(socket, payload.gameId);
  await emitFullState(io, game);
  if (changed) await broadcastGameCard(io, game.id);
}
```

`apps/server/src/realtime/turn-based.ts:100`. Joining a room is also the only way a player takes a seat. `ensureSeated` (`turn-based.ts:30`) decides whether this user becomes a player. The seating gate is worth reading in full:

```ts
const { engine } = getDefinition(gameRow.gameType);
const seatFree =
  gameRow.status === "waiting" && players.length < engine.maxPlayers;
const challengeReserved =
  gameRow.seatingMode === "challenge" &&
  !!gameRow.challengedUserId &&
  userId !== gameRow.challengedUserId;

if (intent === "spectate" || !seatFree || challengeReserved) {
  return { game: gameRow, changed: false };
}
```

`apps/server/src/realtime/turn-based.ts:40`. A user is seated only if: they are not already a player, the game is still `waiting` with room under `engine.maxPlayers`, they did not ask to merely `spectate`, and — for a `challenge` game — they are the challenged user. The seat's role comes straight from the engine: `engine.roles[players.length]` (`turn-based.ts:55`, with a `biome-ignore` justifying the non-null assertion). When the new seat count reaches `engine.minPlayers` the game flips to `active` and gets a `startedAt`, and the initial state is lazily created from the engine if absent (`turn-based.ts:58`). The seat is persisted via `games.seatPlayer` into its own indexed `game_player` row.

Whether or not seating changed, the socket joins `game:<gameId>` and receives the full state. `emitFullState` always sends *everything* — the serialized game plus the full move list — so a late joiner or reconnecting client gets a complete, authoritative snapshot rather than a diff:

```ts
async function emitFullState(io: IOServer, gameRow: GameRecord) {
  const moves = await games.listMoves(gameRow.id);
  const payload: ServerGameStatePayload = {
    game: serializeGame(gameRow),
    moves: moves.map(serializeMove),
  };
  emitToGame(io, gameRow.id, "game_state", payload);
}
```

`apps/server/src/realtime/turn-based.ts:21`. The payload type is `ServerGameStatePayload` from games-core (`packages/games-core/src/schemas.ts:72`) — again a shared contract. If a seat was taken (`changed`), `broadcastGameCard` also updates the game-card message in the originating conversation so everyone in the chat sees the new player count.

### `handleMakeMove` — the round trip

This is the heart of the subsystem. Read it top to bottom:

```ts
export async function handleMakeMove(
  io: IOServer,
  socket: Socket,
  payload: ClientMakeMove,
): Promise<void> {
  const userId = socket.data.userId;
  if (!UUID_RE.test(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameById(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");
  if (gameRow.status !== "active") return err(socket, "Game is not active");

  const player = gameRow.players.find((p) => p.userId === userId);
  if (!player) return err(socket, "Not a player in this game");

  const def = getDefinition(gameRow.gameType);
  if (!def.engine.reduce) return err(socket, "Game does not accept moves");

  const parsedMove = def.moveSchema.safeParse(payload.moveData);
  if (!parsedMove.success) return err(socket, "Invalid move");
  const parsedState = def.stateSchema.safeParse(gameRow.gameState);
  if (!parsedState.success) return err(socket, "Corrupt game state");

  const result = def.engine.reduce(
    parsedState.data,
    { role: player.role },
    parsedMove.data,
  );
  if (!result.ok) return err(socket, result.error);
```

`apps/server/src/realtime/turn-based.ts:122`. Every line is a guard, and the ordering is the design:

1. **Identity is taken from the socket, not the payload** — `userId = socket.data.userId`, then `gameRow.players.find(p => p.userId === userId)`. There is no way for the client to claim to be another player; the player's `role` is looked up from the persisted seat, and that role is what gets passed to `reduce` as `{ role: player.role }`. A client cannot move on another seat's behalf.
2. **The game must be `active`** and the engine must actually accept moves (`def.engine.reduce` exists) — a realtime-only engine would have no `reduce`.
3. **The move is validated against the game-specific `def.moveSchema`** — this is the inner Zod check the envelope layer deferred. Note it validates `payload.moveData`, the `unknown` field from `clientMakeMoveSchema`.
4. **The stored state is *also* validated** against `def.stateSchema` before being fed to the engine. This is a subtle but deliberate defense: even data already in the database is treated as untrusted (`"Corrupt game state"`), so a bad migration or manual edit cannot crash the engine.
5. **`def.engine.reduce` is the authority.** It is a pure function from `(state, ctx, input) → ReduceResult` (`packages/games-core/src/engine.ts:24`). If the move is illegal *for this state* (wrong turn, occupied cell, etc.), it returns `{ ok: false, error }` and we bounce the client with `result.error`. The server's verdict is final regardless of what the client's local copy of the same engine predicted.

Only after all five guards pass do we touch the database:

```ts
  const moveNumber = await games.nextMoveNumber(gameRow.id);
  const moveRow = await games.addMove({
    gameId: gameRow.id,
    moveNumber,
    playerId: userId,
    moveData: parsedMove.data,
  });

  let updated = await games.updateGame(gameRow.id, { gameState: result.state });
  updated = await finalize(updated, result.outcome);

  emitToGame(io, gameRow.id, "move_made", {
    move: serializeMove(moveRow),
    gameState: updated.gameState,
  });
  await emitFullState(io, updated);

  if (updated.status === "completed") {
    emitToGame(io, gameRow.id, "game_over", { winner: updated.winner });
    await broadcastGameCard(io, updated.id);
  }
}
```

`apps/server/src/realtime/turn-based.ts:152`. The move is appended (one row in the `move` table, `moveData` stored as the **Zod-parsed** value, not the raw wire value), the new `gameState` is persisted, and `finalize` handles end-of-game. `finalize` (`turn-based.ts:71`) only acts on a `completed` outcome: it resolves `winnerRole` back to a `winnerUserId` via the seat list, writes `status: "completed"` + `completedAt` + `winner` (or `"draw"`), and calls `profiles.bumpStats` once per player (`"won"` / `"lost"` / `"drawn"`).

Then come the broadcasts — and note there are **two audiences**:

- `move_made` and a full `game_state` go to the **game room** `game:<gameId>` (everyone watching/playing the board).
- On completion, `game_over` also goes to the game room, and `broadcastGameCard` pushes a `message_updated` event to the **originating conversation room** `conv:<conversationId>` (`apps/server/src/chat/game-card-broadcast.ts:7`), so the game card embedded in the chat updates to "completed" for people who never opened the board.

This dual broadcast is the bridge between the two lanes: a *game-lane* action (`make_move`) produces a *chat-lane* effect (a `message_updated` over `CHAT_EVENTS.messageUpdated`). The serialized payloads correspond to `ServerMoveMadePayload` and `ServerGameOverPayload` in games-core (`packages/games-core/src/schemas.ts:77`).

### Full data-flow walkthrough: a player makes a winning move

```
Player clicks a cell in the React board (apps/web, @gamelobby/games-client)
  -> client emits "make_move" { gameId, moveData } over the socket
  -> apps/server/src/realtime/index.ts:96  socket.on("make_move")
       clientMakeMoveSchema.safeParse(payload)            (envelope Zod, games-core)
  -> index.ts:108  games.getGameById(gameId) -> getDriver(gameType)  (drivers.ts:25)
  -> driver.makeMove == turn-based.ts:122  handleMakeMove
       userId = socket.data.userId                         (trusted identity, NOT payload)
       guards: game active? caller is a seated player? engine has reduce?
       def.moveSchema.safeParse(payload.moveData)          (game-specific Zod)
       def.stateSchema.safeParse(gameRow.gameState)        (stored state re-validated)
       def.engine.reduce(state, { role }, move)            (turn-based.ts:145, AUTHORITATIVE)
         -> result.ok === false  => err(socket, result.error) and STOP
         -> result.ok === true   => continue
  -> persist: games.addMove(...) + games.updateGame({ gameState })   (turn-based.ts:153)
  -> finalize(updated, result.outcome)                     (turn-based.ts:161)
       outcome.status === "completed" => updateGame(status/winner) + profiles.bumpStats x N
  -> BROADCAST A (game room):
       emitToGame "move_made" + emitFullState "game_state"  -> room game:<gameId>  (rooms.ts:15)
       emitToGame "game_over" { winner }                    -> room game:<gameId>
  -> BROADCAST B (chat room):
       broadcastGameCard -> emitToConv "message_updated"    -> room conv:<convId>  (game-card-broadcast.ts:14)
  -> every board in game:<gameId> re-renders from the authoritative game_state;
     every chat window in conv:<convId> updates the game card to "completed".
```

Contrast with how a game even comes to exist: that is a **chat-lane** action. `CHAT_EVENTS.createGameInConversation` (`apps/server/src/realtime/games-in-chat.ts:9`) validates with `clientCreateGameInConversationSchema`, then `createGameInConversation` (`apps/server/src/chat/games-in-chat-service.ts:9`) validates the game's `configSchema`, seats the creator into role `engine.roles[0]`, creates the game with `engine.createInitialState`, posts a `game_card` message, and `notify`s the other members. So creation flows over chat; play flows over the game lane; and they meet again at the game card.

## Rooms

All multicast goes through named rooms, and the naming is centralized in `apps/server/src/realtime/rooms.ts`:

- `game:<gameId>` — `gameRoom` (`rooms.ts:3`), joined in `joinGameRoom` (`rooms.ts:7`), left in `leaveGameRoom` (`rooms.ts:11`), targeted by `emitToGame` (`rooms.ts:15`). Board state lives here.
- `conv:<conversationId>` — `convRoom` (`rooms.ts:24`), `joinConvRoom`/`leaveConvRoom` (`rooms.ts:32`), `emitToConv` (`rooms.ts:40`). Chat messages, typing, and game-card updates live here.
- `user:<userId>` — `userRoom` (`rooms.ts:28`), `emitToUser` (`rooms.ts:49`). Per-user fan-out: notifications, presence, friend events. A user can have several sockets all in this one room (multiple tabs), which is exactly why presence reference-counts.

Because room membership lives in the Socket.IO adapter, `emitTo*` works the same whether the recipient is on this node or — with the Redis adapter — another.

## Scale-out via Redis

```ts
export function attachRedisAdapter(io: IOServer): void {
  if (!env.redisUrl) {
    log.info("single-node mode (no REDIS_URL)");
    return;
  }
  const pub = new Redis(env.redisUrl);
  const sub = pub.duplicate();
```

`apps/server/src/realtime/redis.ts:9`. With no `REDIS_URL` the app runs single-node and the adapter is a no-op. With one set, `@socket.io/redis-adapter` is installed so that an `emitToGame`/`emitToConv`/`emitToUser` on **any** node reaches sockets connected to **every** node. Nothing in the handlers changes — they always call the same room helpers — which is the entire reason the room abstraction exists.

## Gotchas, invariants & conventions

- **The client is never the authority.** The browser runs the same engine for prediction, but `make_move` is re-validated by `moveSchema`, by `stateSchema`, and finally by `engine.reduce` on the server (`turn-based.ts:145`). If the three disagree with the client, the server wins. Do not "optimize" by trusting client-supplied state.
- **One socket per tab carries both lanes.** The browser opens a single authenticated Socket.IO connection in the web app's `SocketProvider`; game boards receive it as a prop (`socket` / `connected`) and emit `join_room` / `make_move` / `leave_room` over it — they do **not** call `io()` themselves. So the chat lane and the game lane always share one connection, one auth check, and one `socket.data.userId`. See [games-client](./games-client.md).
- **Identity comes from `socket.data.userId`, never from a payload.** Set once in the `io.use` middleware (`index.ts:44`). Any handler that reads a `userId` off the wire would be a security bug.
- **Two error/result conventions, one per lane.** Chat lane: ack callbacks shaped `{ ok, ... }` via `ack`/`ackErr`, wrapped by `register` (`socket-util.ts:36`). Game lane: a `"game_error"` emit *and* a string ack `cb?.(msg)` (`index.ts:90`). Follow the lane you are in.
- **Validate at both layers in the game lane.** The envelope schema (`clientMakeMoveSchema`) only guarantees `{ gameId, moveData: unknown }`. The real move shape is the game's `moveSchema`, checked inside the driver. Skipping either is a hole.
- **`emitFullState` sends the entire game + move list every time.** It is intentionally not a diff, so reconnects and late joiners are correct for free. Don't replace it with incremental patches without a resync story.
- **Seating happens on `join_room`, not on a separate "sit" event.** `intent: "spectate"`, a full table, or a reserved `challenge` seat all silently result in `changed: false` (`turn-based.ts:48`) — you watch instead of erroring.
- **Typing and presence are in-process maps, not DB-backed.** They are also not Redis-aware: the maps in `typing.ts:8` and `presence.ts:8` are per-node, so a multi-node deployment would compute presence/typing per node. Treat them as best-effort, single-node-accurate signals.
- **`notify` self-suppresses** (`notify.ts:16`) and depends on `getIO()` being set — which `attachRealtime` guarantees at boot via `setIO(io)` (`apps/server/src/realtime/index.ts:31`). Calling `notify` before `attachRealtime` would persist the row but skip the live push (`if (!io) return`).
- **`getDriver` ignores its argument today.** All games use the turn-based driver. Add realtime games by implementing `RealtimeDriver` and branching in `getDriver` on the engine's `mode`; the listeners in `index.ts` need no change.
- **Stored state is treated as untrusted too.** `stateSchema.safeParse(gameRow.gameState)` returning failure yields `"Corrupt game state"` rather than a crash (`turn-based.ts:142`) — a deliberate guard against bad data in JSONB.
- **No comments in code.** This repo enforces a strict no-comments rule; the lone comment in this subsystem is a justified `biome-ignore` at `turn-based.ts:54`.

## Where to go next

- [Architecture overview](./README.md) — the monorepo map and how these pieces fit together.
- [Auth](./auth.md) — Better Auth, sessions, and the cookie the socket handshake reads.
- [Database](./database.md) — the generic `game` / `move` / `game_player` schema and the repositories the driver calls (`games.*`, `profiles.*`).
- [games-core schemas](./games-core-schemas.md) — `clientJoinRoomSchema`, `clientMakeMoveSchema`, `moveSchema`/`stateSchema`, and the `ServerGameStatePayload` wire types.
- [games-core engine](./games-core-engine.md) — the `GameEngine` interface, `reduce`, `Outcome`, roles, and seat counts the driver depends on.
- [games-client](./games-client.md) — the React boards that take the shared socket as a prop and emit `join_room`/`make_move`/`leave_room`, rendering from `game_state`.
- [chat-core](./chat-core.md) — `CHAT_EVENTS`, the chat DTOs, and the socket event contract shared by both ends.
- [Server API](./server-api.md) — the Express/Hono REST side that mounts `attachRealtime`.
- [Web](./web.md) — how the Next.js client connects the socket and wires Jotai state to these events.
- [Testing](./testing.md) — the `integration/game-driver.test.ts` suite drives the real `handleJoinRoom`/`handleMakeMove` against a live DB via a mock io/socket.
