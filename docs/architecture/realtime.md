# Realtime: Socket.IO & the Two Lanes

## What this is / why it matters

Everything live in this app - chat messages, typing dots, presence, friend requests, notifications, and the moment-to-moment play of a game - rides over **one Socket.IO connection per browser tab**. The realtime layer lives entirely in `apps/server/src/realtime/`. It does three jobs:

1. **Authenticates the socket once, from the Better Auth session cookie** carried in the WebSocket handshake, and stamps `socket.data.userId` so every downstream handler knows who is talking without re-checking auth.
2. **Multiplexes two logically separate "lanes" onto that single connection** - a **chat lane** (chat, friends, typing, presence, in-chat game creation, notifications) and a **game lane** (`join_room` / `make_move` / `leave_room`). They share a connection but are wired and validated independently - **both lanes validate every inbound payload with shared Zod schemas**. The browser opens **one** Socket.IO connection (the web app's `SocketProvider`); the shared game session uses it rather than boards dialing their own - see [games-client](./games-client.md).
3. **Runs every game action through the authoritative turn-based handlers** (`handleJoinRoom` / `handleMakeMove` in `turn-based.ts`) that load the game, validate the payload *and the stored state* against the game's strict Zod schemas (the same schemas the client uses), apply the pure engine `reduce`, persist the result, and broadcast the new state.

The reason this matters - and the single most important idea in the whole subsystem - is that **the client is never trusted**. The browser imports `@kyzen/games-core` to render a board and *predict* legality, but the server imports the *exact same* `GameDefinition` (engine + `moveSchema` + `stateSchema`) and re-validates everything. The frontend's copy of the engine is a UX convenience; the server's copy is the source of truth. A hand-crafted `make_move` packet hits `clientMakeMoveSchema.safeParse`, then `def.moveSchema.safeParse`, then `def.engine.reduce` returning `{ ok: false }` - three independent rejections before any database write happens.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/realtime/index.ts` | `attachRealtime`: build the `IOServer`, attach the Redis adapter, install the handshake-cookie auth middleware, and on each connection wire every chat-lane handler plus the three game-lane listeners (`join_room`, `make_move`, `leave_room`). |
| `apps/server/src/realtime/io.ts` | `setIO` / `getIO` singleton so non-socket code (e.g. `notify`) can emit without holding a `socket` reference. |
| `apps/server/src/realtime/rooms.ts` | Room name helpers + emit helpers: `gameRoom`/`convRoom`/`userRoom` naming and `emitToGame`/`emitToConv`/`emitToUser`. |
| `apps/server/src/realtime/turn-based.ts` | The two game-lane handlers: `handleJoinRoom` (seating, `turn-based.ts:274`) and `handleMakeMove` (authoritative validate → reduce → persist → finalize → broadcast, `turn-based.ts:297`), wired directly by `index.ts`; plus the turn-timer integration (`scheduleNext`, `onTurnTimeout`, `applyMove`, `abortGame`). |
| `apps/server/src/realtime/turn-timer.ts` | The server-authoritative per-player turn clock: pure helpers (`turnLimitMs`, `decideTimeout`, `abortOutcome`) + the in-memory `TurnTimerManager` (`turnTimers` singleton) that tracks per-seat strikes and one pending deadline per active game. |
| `apps/server/src/realtime/room-events.ts` | `attachRoomHandlers`: the two **standalone-room** lane events `room:create` / `room:join` (both rate-limited), each parsed against a shared Zod schema and delegating to `rooms-service.ts`. |
| `apps/server/src/realtime/rooms-service.ts` | `createStandaloneGame` (conversation-less open game, host pre-seated, no game-card/notify) and `validateJoinByCode` (typed `not_found`/`full`/`already_started`/`finished` checks for a join by code). |
| `apps/server/src/realtime/chat.ts` | Chat-lane handlers (join/leave conversation, send message, mark read, DM/group lifecycle, notification read) and `joinUserRooms` on connect. |
| `apps/server/src/realtime/friends.ts` | Friend request / respond / remove handlers. |
| `apps/server/src/realtime/typing.ts` | In-memory per-conversation typing indicator with a 5 s TTL and disconnect cleanup. |
| `apps/server/src/realtime/presence.ts` | Online/last-seen tracking backed by a `PresenceStore` (Redis sorted-set when `REDIS_URL` is set, else in-memory), with durable last-seen in the DB; broadcasts transitions to friends + co-conversation members. |
| `apps/server/src/realtime/presence-store.ts` | The `PresenceStore` interface plus its `InMemoryPresenceStore` and `RedisPresenceStore` implementations (pure; no env import). |
| `apps/server/src/realtime/presence-store-instance.ts` | `createPresenceStore` + the `presenceStore` singleton, env-selected (Redis when `REDIS_URL` is set, else in-memory). |
| `apps/server/src/realtime/presence-heartbeat.ts` | Per-node timers that refresh live presence entries and periodically persist last-seen to `user_profile.last_seen_at`. |
| `apps/server/src/realtime/games-in-chat.ts` | Two chat-lane game handlers: `CHAT_EVENTS.createGameInConversation` (validate payload, create-or-resume the game, post a game-card message) and `CHAT_EVENTS.rematch` (start a rematch in the same series, then emit `rematchCreated` to the old game's room). |
| `apps/server/src/realtime/notify.ts` | `notify(userId, type, opts)`: persist a notification row and push it to the user's room via the `getIO()` singleton. |
| `apps/server/src/realtime/redis.ts` | Optional `@socket.io/redis-adapter` wiring for multi-node scale-out; no-op without `REDIS_URL`. |
| `apps/server/src/realtime/redis-client.ts` | Shared ioredis command client (`getRedis()`) used by the Redis-backed presence store, separate from the adapter's pub/sub connections. |
| `apps/server/src/realtime/socket-util.ts` | The two lanes' listener wrappers: `ack`/`ackErr` ack shaping + `register` (the chat lane's try/catch wrapper around `socket.on`), and `registerGameEvent` (the game lane's parse → run → `durationMs` log → `game_error`-on-failure wrapper). |
| `apps/server/src/realtime/socket-data.d.ts` | Module augmentation typing `socket.data.userId: string`. |

## Setup: `attachRealtime`

`apps/server/src/http.ts` creates the shared Node HTTP server and hands it to `attachRealtime`. Everything in this doc hangs off that one call.

```ts
export function attachRealtime(httpServer: HTTPServer): IOServer {
  const io = new IOServer(httpServer, {
    path: "/socket.io",
    transports: ["websocket"],
    cors: { origin: env.webUrl, credentials: true },
  });

  attachRedisAdapter(io);
  setIO(io);
  startPresenceHeartbeats(io);
```

`apps/server/src/realtime/index.ts:28` - four things to note. `transports: ["websocket"]` skips the HTTP long-poll fallback entirely (one transport, simpler reasoning). `cors.credentials: true` plus a concrete `origin` is what lets the browser send the auth cookie cross-origin. `setIO(io)` (`apps/server/src/realtime/io.ts:5`) stashes the server in a module singleton so code with no socket in scope - most importantly `notify` - can still emit. And `startPresenceHeartbeats(io)` (`apps/server/src/realtime/presence-heartbeat.ts:51`) starts the per-node timers that refresh live presence entries and periodically persist last-seen.

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

`apps/server/src/realtime/index.ts:39`. The WebSocket handshake is an HTTP upgrade, so it carries the same cookies the browser would send to any same-site request. We hand the raw `Cookie` header to Better Auth's `getSession`, and on success stamp `socket.data.userId`. That field is typed by the module augmentation in `apps/server/src/realtime/socket-data.d.ts:4`:

```ts
declare module "socket.io" {
  interface SocketData {
    userId: string;
  }
}
```

The payoff: no handler ever re-reads the cookie or accepts a `userId` from the wire. `const userId = socket.data.userId` is trusted identity everywhere downstream (`turn-based.ts:279`, `chat.ts:28`, `friends.ts:12`, `typing.ts:43`, `presence.ts:63`, `games-in-chat.ts:25`). A forged `userId` in a payload is simply ignored - the only `userId` that exists came from a verified session.

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
  attachMatchmakingHandlers(io, socket);
  attachRoomHandlers(socket);
  void handlePresenceConnect(io, socket);
```

`apps/server/src/realtime/index.ts:59`. On every connection we (1) join the user's rooms, (2) attach the four chat-lane handler groups, (3) attach the matchmaking handlers, (4) attach the standalone-room handlers (`room:create` / `room:join`), (5) kick off presence, and then (further down) register the three game-lane listeners (`join_room`, `make_move`, `leave_room`). Note `joinUserRooms` and `handlePresenceConnect` are `async` and fire-and-forgotten with `void`; the listener registrations below them are synchronous, so handlers exist immediately even while those promises resolve.

## The two lanes

Both lanes are events on the same `socket`, but they are deliberately built and validated differently. Understanding the split is the key to reading this directory.

### Lane 1 - the chat lane

The chat lane covers chat, friends, typing, presence, in-chat game *creation* and *rematch*, and notifications. Its event names are centralized in `@kyzen/shared`'s `CHAT_EVENTS` constant (`packages/shared/src/constants/chat.ts:1`), so client and server never disagree on a string literal.

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

`apps/server/src/realtime/socket-util.ts:26`. `register` does three things every chat handler would otherwise repeat: wraps the async body so a thrown error never crashes the process, logs with the event name and user id, and returns a uniform `{ ok: false, error }` over the **acknowledgement callback** (`cb`). The chat lane's convention is *acks, not broadcasts, for the caller's result* - the success path uses `ack(cb, serviceResult, key)`:

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

`apps/server/src/realtime/socket-util.ts:17`. Chat handlers themselves are thin: they `safeParse` the untyped payload against a shared Zod schema (`clientSendMessageSchema`, `clientMarkReadSchema`, …, from `@kyzen/shared/types`), `ackErr` on a parse failure, delegate to a `*-service` module, and `ack` the result. For example `CHAT_EVENTS.sendMessage` (`chat.ts:47`) parses the payload with `clientSendMessageSchema`, pulls `conversationId`, `body`, `clientId`, `metadata`, and calls `messagesService.sendMessage`, which is what actually fans the new message out to the conversation room. Membership is checked server-side: `conversationJoin` refuses a room you are not a member of (`chat.ts:34`).

`joinUserRooms` runs once on connect and seeds the socket's room membership (`chat.ts:20`):

```ts
export async function joinUserRooms(socket: Socket): Promise<void> {
  const userId = socket.data.userId;
  void socket.join(userRoom(userId));
  const ids = await conversations.getConversationIdsForUser(userId);
  for (const id of ids) void socket.join(convRoom(id));
}
```

So a freshly connected socket is already in its personal `user:<id>` room (for notifications, presence, friend events) and in a `conv:<id>` room for every conversation it belongs to - without any client round-trip.

**Typing** keeps ephemeral in-memory state rather than touching the DB: it stores a `Map<conversationId, Map<userId, Entry>>` with a 5 s `setTimeout` TTL per typer and re-broadcasts the full typer list on every change (`typing.ts:11`, `typing.ts:23`, `typing.ts:58`); a disconnect clears all of that socket's active typers (`typing.ts:80`). Both typing events `safeParse` their payload with `clientConversationRefSchema` (`typing.ts:48`, `:71`). **Presence** instead delegates its socket bookkeeping to a `PresenceStore` (`presence-store.ts`) - reference-counting a user's live socket ids so a user is online while their set is non-empty, so opening a second tab does not double-count and closing one tab does not flip them offline (`presence-store.ts:17`, `presence-store.ts:33`). The store returns `{ wasOnline }` on `markOnline` and `{ stillOnline }` on `markOffline`, so presence only broadcasts a transition (`if (!wasOnline)` on connect at `presence.ts:82`, `if (stillOnline) return` on disconnect at `presence.ts:97`) to a computed *audience* of friends plus co-conversation members (`audienceFor`, `presence.ts:40`). The handlers take their store and data-access dependencies as an injectable `PresenceDeps` (defaulting to the real store + repositories), which keeps them unit-testable without module mocking.

**`notify`** is the chat lane's escape hatch for code that has no socket. It persists a notification row, then emits to the recipient's user room via the `getIO()` singleton - note the self-suppression guard so you are never notified about your own action:

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

### In-chat game creation, rematch & the one-live guard

Both in-chat *game* events are wired in `attachGameChatHandlers` (`apps/server/src/realtime/games-in-chat.ts:13`) and delegate to `apps/server/src/chat/games-in-chat-service.ts`. They are chat-lane events (ack-shaped results), but they spawn / re-spawn games that the *game* lane then plays.

**`CHAT_EVENTS.createGameInConversation`** (`games-in-chat.ts:15`) validates with `clientCreateGameInConversationSchema`, then calls `createGameInConversation` (`games-in-chat-service.ts:66`). That service now enforces the platform's **one-live-game-per-`(conversation, gameType)`** rule before creating anything: it calls `games.findLiveGameInConversation(conversationId, gameType)` and, if a `waiting | active` game of that type already exists in the conversation, returns *that* game instead of inserting a duplicate (`games-in-chat-service.ts:81`):

```ts
const existingLive = await games.findLiveGameInConversation(
  input.conversationId,
  input.gameType,
);
if (existingLive) {
  return ok({ game: serializeGame(existingLive) });
}
```

So the service result is `{ game: GameJson; message?: MessageJson }` - `message` is present only when a *new* card was posted; a short-circuit to an existing live game carries no new card. Completed/abandoned games never block - that is when **Rematch** takes over.

**`CHAT_EVENTS.rematch`** (`game:rematch`, handled at `games-in-chat.ts:42`) validates `clientRematchSchema` (`{ gameId }`) and calls `rematchGame` (`games-in-chat-service.ts:150`):

1. Load the finished game by code; require `status === "completed"`, that the requester was one of its players, and that it has a conversation (`games-in-chat-service.ts:156`–`:160`) - rematch is conversation-scoped.
2. Run the **same one-live guard** (`findLiveGameInConversation`, `:163`): if a rematch is already live, return it - so two players both clicking Rematch converge on one game.
3. Compute fair turn order via the single seam `computeRematchSeating(prev) → orderedUserIds` (`apps/server/src/chat/rematch-seating.ts:4`): for 2 players the **loser goes first** (on a draw, the first mover swaps from the previous game's first mover); for N > 2 it rotates the starting seat by one. Index 0 maps to `engine.roles[0]`.
4. Create the new game in the same conversation with `seriesId = prev.seriesId` (linking it into the series), `config` copied from the parent, a fresh `engine.createInitialState`, and **both prior players pre-seated** in the arranged order - so it starts `active` immediately (`becomesActive = players.length >= engine.minPlayers`, `games-in-chat-service.ts:181`).
5. `announceGame` posts the rematch's own `game_card` and notifies the other member(s).

Back in the handler, on success it emits `CHAT_EVENTS.rematchCreated` (`game:rematch_created`, payload `{ newGameId }`) to the **old** game's room (`emitToGame(io, parsed.data.gameId, …)`, `games-in-chat.ts:58`) so an open game-over modal there can flip its button to **Go to rematch**, and acks `{ ok: true, gameId }` - the new game's public code - to the caller, who navigates to `/play/<code>`. The card-side series score is enriched at assembly time (see [chat-core](./chat-core.md) and [server-api](./server-api.md)).

### Lane 2 - the game lane

The game lane is three events - `join_room`, `make_move`, and `leave_room` - and it is wired differently from the chat lane in three deliberate ways:

1. **Distinct event names** outside `CHAT_EVENTS` (plain `"join_room"` / `"make_move"` / `"leave_room"`), and a distinct error channel `"game_error"`. `leave_room` (`index.ts:80`) reuses `clientJoinRoomSchema` (just `{ gameId }`), then calls `leaveGameRoom(socket, gameId)` (`rooms.ts:11`) to `socket.leave` the `game:<code>` room - the shared session emits it on unmount so the *shared, persistent* connection doesn't accumulate stale game rooms as the user navigates between games. It is the one game-lane listener that is synchronous (no DB work) and so is registered with a plain inline `socket.on`, not via `registerGameEvent`.
2. **Strict Zod validation of the wire envelope.** `join_room` / `make_move` are both registered through `registerGameEvent`, which `safeParse`s the payload against `clientJoinRoomSchema` / `clientMakeMoveSchema` (from `@kyzen/shared/types`) before any handler runs. (This is the same discipline the chat lane now uses with its own `client*Schema`s - both lanes validate with shared Zod schemas.)
3. **A thin wrapper, then a direct call to the turn-based handler.** `registerGameEvent(socket, slog, event, schema, run)` is the game lane's counterpart to `register`: it validates, runs the handler, logs a `durationMs` on success, and on a parse failure or a thrown error answers *both* the ack callback and a `"game_error"` emit. The `run` callback calls `handleJoinRoom` / `handleMakeMove` (`./turn-based`) directly - there is no per-dispatch game lookup and no driver layer in between.

```ts
registerGameEvent(socket, slog, "join_room", clientJoinRoomSchema, (data) =>
  handleJoinRoom(io, socket, data),
);

registerGameEvent(socket, slog, "make_move", clientMakeMoveSchema, (data) =>
  handleMakeMove(io, socket, data),
);
```

`apps/server/src/realtime/index.ts:72`. The wrapper itself lives in `socket-util.ts:46`:

```ts
export function registerGameEvent<T extends { gameId: string }>(
  socket: Socket,
  slog: Logger,
  event: string,
  schema: { safeParse: (payload: unknown) => SafeParseResult<T> },
  run: (data: T) => Promise<void>,
): void {
  socket.on(event, (payload: unknown, cb?: GameAck) => {
    void (async () => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        slog.warn({ payload }, `invalid ${event} payload`);
        cb?.("Invalid payload");
        socket.emit("game_error", { message: `Invalid ${event} payload` });
        return;
      }
```

The envelope schemas are strict and tiny - `clientMakeMoveSchema` is `{ gameId: gameCodeSchema, moveData: unknown }.strict()` (`packages/shared/src/types/games/wire.ts:35`); the *contents* of `moveData` are validated later by the game-specific `moveSchema` inside `handleMakeMove`, because the envelope layer cannot know what shape a Reversi vs. a Tic-Tac-Toe move takes. `clientJoinRoomSchema` adds an optional `intent: "play" | "spectate"` (`wire.ts:27`). Both envelopes key off `gameId` - now the game's **public code** (validated and normalized by `gameCodeSchema`), not the internal UUID - not a `gameType`; the registry-typed `gameTypeSchema` (from `@kyzen/shared/types`) that validates `gameType` guards the game-card DTOs and game creation, while the handler resolves both the game (via `games.getGameByCode`, `turn-based.ts:305`) and its type from the stored `gameRow.gameType` (`turn-based.ts:312`).

`join_room` and `make_move` report failures *twice*: through the ack callback (`cb?.(msg)`) for the specific caller, and as a `"game_error"` emit (`socket-util.ts:59`/`:79`). They also wrap the body in `try/catch` and log a `durationMs` on success (`socket-util.ts:66`) - the game lane's own version of the safety/observability that `register` gives the chat lane. (`leave_room` only acks; it has nothing to fail at beyond payload validation.)

## The authoritative game flow

This is where the "never trust the client" principle is enforced. Both game-lane handlers live in `apps/server/src/realtime/turn-based.ts` and are called directly by `registerGameEvent` - no driver indirection sits between the listener and the handler.

### `handleJoinRoom` and seating

```ts
export async function handleJoinRoom(
  io: IOServer,
  socket: Socket,
  payload: ClientJoinRoom,
): Promise<void> {
  const userId = socket.data.userId;
  if (!isGameCode(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameByCode(payload.gameId);
  if (!gameRow) return err(socket, "Game not found");

  const { game, changed } = await ensureSeated(
    gameRow,
    userId,
    payload.intent ?? "play",
  );

  joinGameRoom(socket, game.code);
  if (changed && game.status === "active") scheduleNext(io, game);
  await emitFullState(io, game);
  if (changed) await broadcastGameCard(io, game.id);
}
```

`apps/server/src/realtime/turn-based.ts:274`. The id guard is `isGameCode` from `@kyzen/shared/types` (`packages/shared/src/types/games/code.ts:20`), which normalizes then regex-checks the 6-char public room code; the game is then loaded by that code with `games.getGameByCode` (`turn-based.ts:282`), and the socket joins the `game:<code>` room (`joinGameRoom(socket, game.code)`, `turn-based.ts:291`). Joining a room is also the only way a player takes a seat. When seating a player flips a game to `active`, `scheduleNext` (`turn-based.ts:292`) arms the turn clock (see [the turn timer](#turn-timer-auto-move--auto-abort)). `ensureSeated` (`turn-based.ts:78`) decides whether this user becomes a player. The seating gate is worth reading in full:

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

`apps/server/src/realtime/turn-based.ts:88`. A user is seated only if: they are not already a player, the game is still `waiting` with room under `engine.maxPlayers`, they did not ask to merely `spectate`, and - for a `challenge` game - they are the challenged user. The seat's role comes straight from the engine: `engine.roles[players.length]` (`turn-based.ts:103`, with a `biome-ignore` at `turn-based.ts:102` justifying the non-null assertion). When the new seat count reaches `engine.minPlayers` the game flips to `active` and gets a `startedAt`, and the initial state is lazily created from the engine if absent (`turn-based.ts:113`). The seat is persisted via `games.seatPlayer` into its own indexed `game_player` row (`turn-based.ts:108`).

**Seating is idempotent, because `join_room` is not.** The shared session emits `join_room` on effect setup *and* on every socket `connect` (and the shared socket can reconnect, dev Strict-Mode double-mounts, a second tab can join), so the same user's join can arrive twice and interleave around the `await`s in `ensureSeated` - both reads would see the user as unseated and both would try to insert the same `(game_id, user_id)`. To make that safe the membership check is *not* trusted as the only guard: `games.seatPlayer` inserts with `ON CONFLICT (game_id, user_id) DO NOTHING` and returns whether a row was actually written (`games.ts:146`). When it returns `false` the user was seated by a concurrent join, so `ensureSeated` re-loads the game and returns `changed: false` instead of issuing a stale `updateGame` (`turn-based.ts:109`) - the loser of the race never surfaces the old `duplicate key value violates unique constraint "game_player_uq"` error and never double-writes.

Whether or not seating changed, the socket joins `game:<code>` (keyed by `game.code`, the public room code) and receives the full state. `emitFullState` always sends *everything* - the serialized game plus the full move list - so a late joiner or reconnecting client gets a complete, authoritative snapshot rather than a diff:

```ts
async function emitFullState(io: IOServer, gameRow: GameRecord) {
  const moves = await games.listMoves(gameRow.id);
  const payload: ServerGameStatePayload = {
    game: withTimerFields(serializeGame(gameRow), gameRow.id),
    moves: moves.map((m) => serializeMove(m, gameRow.code)),
  };
  emitToGame(io, gameRow.code, "game_state", payload);
}
```

`apps/server/src/realtime/turn-based.ts:69`. The payload type is `ServerGameStatePayload` from `@kyzen/shared/types` (`packages/shared/src/types/games/wire.ts`) - again a shared contract. Every broadcast game is passed through `withTimerFields` (`turn-based.ts:31`), which stamps the live `turnDeadline` and each player's `timeoutStrikes` onto the serialized `GameJson` so the board can render the countdown ring. If a seat was taken (`changed`), `broadcastGameCard` also updates the game-card message in the originating conversation so everyone in the chat sees the new player count.

### `handleMakeMove` - the round trip

This is the heart of the subsystem. Read it top to bottom:

```ts
export async function handleMakeMove(
  io: IOServer,
  socket: Socket,
  payload: ClientMakeMove,
): Promise<void> {
  const userId = socket.data.userId;
  if (!isGameCode(payload.gameId)) return err(socket, "Invalid game id");

  const gameRow = await games.getGameByCode(payload.gameId);
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

`apps/server/src/realtime/turn-based.ts:297`. Every line is a guard, and the ordering is the design:

1. **Identity is taken from the socket, not the payload** - `userId = socket.data.userId`, then `gameRow.players.find(p => p.userId === userId)`. There is no way for the client to claim to be another player; the player's `role` is looked up from the persisted seat, and that role is what gets passed to `reduce` as `{ role: player.role }`. A client cannot move on another seat's behalf.
2. **The game must be `active`** and the engine must actually accept moves (`def.engine.reduce` exists) - a realtime-only engine would have no `reduce`.
3. **The move is validated against the game-specific `def.moveSchema`** - this is the inner Zod check the envelope layer deferred. Note it validates `payload.moveData`, the `unknown` field from `clientMakeMoveSchema`.
4. **The stored state is *also* validated** against `def.stateSchema` before being fed to the engine. This is a subtle but deliberate defense: even data already in the database is treated as untrusted (`"Corrupt game state"`), so a bad migration or manual edit cannot crash the engine.
5. **`def.engine.reduce` is the authority.** It is a pure function from `(state, ctx, input) → ReduceResult` (defined in `packages/shared/src/types/games/engine.ts`). If the move is illegal *for this state* (wrong turn, occupied cell, etc.), it returns `{ ok: false, error }` (`turn-based.ts:325`) and we bounce the client with `result.error`. The server's verdict is final regardless of what the client's local copy of the same engine predicted.

Only after all five guards pass does `handleMakeMove` hand off to the shared `applyMove` helper (`turn-based.ts:152`) - the single persist-and-broadcast path used by **both** real moves and the turn timer's auto-moves:

```ts
  const moveNumber = await games.nextMoveNumber(gameRow.id);
  const moveRow = await games.addMove({
    gameId: gameRow.id,
    moveNumber,
    playerId: player.userId,
    moveData: parsedMove.data,
  });

  let updated = await games.updateGame(gameRow.id, { gameState: result.state });
  updated = await finalize(updated, result.outcome);

  if (!opts.auto) turnTimers.resetStrikes(gameRow.id, player.role);
  scheduleNext(io, updated);

  const move = serializeMove(moveRow, gameRow.code);
  const statePayload: ServerGameStatePayload = {
    game: withTimerFields(serializeGame(updated), updated.id),
    move: opts.auto ? { ...move, auto: true } : move,
  };
  emitToGame(io, gameRow.code, "game_state", statePayload);

  if (updated.status === "completed") {
    turnTimers.dispose(updated.id);
    emitToGame(io, gameRow.code, "game_over", { winner: updated.winner });
    await broadcastGameCard(io, updated.id);
  }
}
```

`apps/server/src/realtime/turn-based.ts:152`. The move is appended (one row in the `move` table, `moveData` stored as the **Zod-parsed** value, not the raw wire value), the new `gameState` is persisted, and `finalize` handles end-of-game. A *real* move resets that seat's timeout strikes (`!opts.auto`); an *auto* move does not (and is flagged `auto: true` on the wire). `scheduleNext` then re-arms the clock for whoever is next on the turn. `finalize` (`turn-based.ts:123`) only acts on a `completed` outcome: it resolves `winnerRole` back to a `winnerUserId` via the seat list, writes `status: "completed"` + `completedAt` + `winner` (or `"draw"`), and calls `profiles.bumpStats` once per player (`"won"` / `"lost"` / `"drawn"`).

Then come the broadcasts - and note there are **two audiences**:

- A **single `game_state`** carrying `{ game: serializeGame(updated), move: serializeMove(moveRow) }` goes to the **game room** `game:<code>` (everyone watching/playing the board) - the room is keyed by the game's public code, not the UUID. Per move the server emits the full game *plus the one new move as a delta*, not the entire move history. (`join_room` is the path that ships the full `moves[]` list, via `emitFullState`, for replay on a late join or reconnect.) There is no longer a separate `move_made` event - that was removed, along with the `ServerMoveMadePayload` type.
- On completion, `game_over` also goes to the game room, and `broadcastGameCard` pushes a `message_updated` event to the **originating conversation room** `conv:<conversationId>` (`apps/server/src/chat/game-card-broadcast.ts:7`), so the game card embedded in the chat updates to "completed" for people who never opened the board.

This cross-lane fan-out is the bridge between the two lanes: a *game-lane* action (`make_move`) produces a *chat-lane* effect (a `message_updated` over `CHAT_EVENTS.messageUpdated`). The `game_state` payload is `ServerGameStatePayload` (`{ game; moves?; move? }`) and the completion payload is `ServerGameOverPayload`, both from `@kyzen/shared/types` (`packages/shared/src/types/games/wire.ts:122`/`:128`). The shared game session replaces history from `payload.moves` for a full snapshot, or merges the single `payload.move` delta by move number (`packages/games-client/src/session.ts`). Boards receive the resulting ordered history.

### Full data-flow walkthrough: a player makes a winning move

```
Player clicks a cell in the React board (apps/web, @kyzen/games-client)
  -> client emits "make_move" { gameId, moveData } over the socket
  -> apps/server/src/realtime/index.ts:72  registerGameEvent("make_move", clientMakeMoveSchema, ...)
       clientMakeMoveSchema.safeParse(payload)            (envelope Zod, socket-util.ts:55)
         -> parse fails => cb?.("Invalid payload") + emit "game_error" and STOP
  -> run(data) == turn-based.ts:297  handleMakeMove(io, socket, data)   (called directly, no driver)
       userId = socket.data.userId                         (trusted identity, NOT payload)
       games.getGameByCode(data.gameId)                    (turn-based.ts:305)
       guards: game active? caller is a seated player? engine has reduce?
       def.moveSchema.safeParse(payload.moveData)          (game-specific Zod)
       def.stateSchema.safeParse(gameRow.gameState)        (stored state re-validated)
       def.engine.reduce(state, { role }, move)            (turn-based.ts:320, AUTHORITATIVE)
         -> result.ok === false  => err(socket, result.error) and STOP
         -> result.ok === true   => applyMove(io, gameRow, player, move)   (turn-based.ts:152)
  -> persist: games.addMove(...) + games.updateGame({ gameState })   (turn-based.ts:174)
  -> resetStrikes(seat) + scheduleNext(io, updated)        (re-arm the turn clock)
  -> finalize(updated, result.outcome)                     (turn-based.ts:183)
       outcome.status === "completed" => updateGame(status/winner) + profiles.bumpStats x N
  -> BROADCAST A (game room):
       emitToGame "game_state" { game, move }               -> room game:<code>  (rooms.ts:15)
       emitToGame "game_over" { winner }                    -> room game:<code>
  -> BROADCAST B (chat room):
       broadcastGameCard -> emitToConv "message_updated"    -> room conv:<convId>  (game-card-broadcast.ts:14)
  -> every board in game:<code> appends the new move to its authoritative game_state;
     every chat window in conv:<convId> updates the game card to "completed".
```

Contrast with how a game even comes to exist: that is a **chat-lane** action. `CHAT_EVENTS.createGameInConversation` (`apps/server/src/realtime/games-in-chat.ts:15`) validates with `clientCreateGameInConversationSchema`, then `createGameInConversation` (`apps/server/src/chat/games-in-chat-service.ts:66`) runs the one-live guard, validates the game's `configSchema`, seats the creator into role `engine.roles[0]`, creates the game with `engine.createInitialState`, posts a `game_card` message, and `notify`s the other members. A finished game's **rematch** is the same lane (`CHAT_EVENTS.rematch` → `rematchGame`) - see ["In-chat game creation, rematch & the one-live guard"](#in-chat-game-creation-rematch--the-one-live-guard) above. So creation/rematch flow over chat; play flows over the game lane; and they meet again at the game card.

## Matchmaking lane

Public matching uses the PostgreSQL queue in `games.joinMatchmaking`. The two queue events return acknowledgements, validate the envelope and registered config schema, and support two-player turn-based engines. A match is created with both seats already assigned and no permanent conversation. See [public matchmaking](matchmaking.md) for transactions, leases, anonymity, temporary chat, and consent.

The shared turn-based runner persists a move, its resulting state, terminal outcome, and player stats in one transaction. It locks the active game and checks the previous JSONB state before accepting the reduction, so simultaneous packets cannot both apply to the same turn. Timeout aborts also check the expected state before writing an outcome.

## Standalone-room lane (`room:create` / `room:join`)

A "room" is the product/UI name for a multiplayer game session; **internally a room is still a `game` row** (no `room` table, no rename). On the **Create** and **Join** buttons of the game page, the web app emits two rate-limited socket events wired in `attachRoomHandlers` (`apps/server/src/realtime/room-events.ts:24`, called from `index.ts:69`). They produce / locate a *standalone* game (one with no conversation) but they do **not** seat anyone authoritatively - that still happens through `join_room` → `ensureSeated`. They are advisory ack-shaped helpers.

Both events `safeParse` their payload against a shared Zod schema (`clientCreateRoomSchema` / `clientJoinByCodeSchema` from `@kyzen/shared/types`, `wire.ts:64`/`:72`) and apply a per-socket sliding-window rate limit (`rateLimiter`, `room-events.ts:13`; 10 creates and 30 joins per minute):

- **`room:create { gameType, config? }`** → ack `{ ok: true, code }` or `{ ok: false, error }`. It calls `createStandaloneGame` (`rooms-service.ts:10`): it requires an engine for the type, validates `config` against the game's `configSchema`, looks up the caller's profile, and creates a `game` with `conversationId: null`, `seatingMode: "open"`, the host pre-seated into `engine.roles[0]`, and a fresh `engine.createInitialState`. Because there is no conversation it **skips** the game-card announce and notifications entirely (those are conversation-scoped). The ack carries the new game's public `code`, and the web app navigates to `/play/<code>` as host.
- **`room:join { code }`** → ack `{ ok: true, code }` or `{ ok: false, error }` where `error` is one of `not_found | full | already_started | finished`. It calls `validateJoinByCode` (`rooms-service.ts:45`), which loads the game by code and returns: `not_found` if no such game (or its type has no engine), `finished` if it is over, `already_started` if it is `active`, `full` if the table is full or a `challenge` seat is reserved for someone else, and otherwise `{ ok: true, code }`. An already-seated caller short-circuits to `{ ok: true }` (or `finished`). This is a **pre-flight** check so a mistyped code shows an inline error instead of navigating to a dead `/play/<code>`; the real seating still happens when the shared session emits `join_room`.

Neither event is authoritative about seats. The seat race is resolved by `ensureSeated` / `seatPlayer`'s `ON CONFLICT DO NOTHING` (above): if the table fills between a `room:join` ack and the shared session's `join_room`, the joiner simply lands as a spectator. Standalone open rooms are board-only (no chat); friend challenges keep their conversation and still flow through the chat lane.

## Turn timer, auto-move & auto-abort

Every `active` turn-based game runs a **server-authoritative per-player clock**. The client only renders a countdown synced to a server-provided `turnDeadline` - a client-trusted clock would be trivially cheatable. The mechanism lives in `apps/server/src/realtime/turn-timer.ts` (pure helpers + the in-memory `TurnTimerManager` singleton `turnTimers`) and is integrated into `turn-based.ts`.

**Two optional engine hooks make a game timer-aware** (`packages/shared/src/types/games/engine.ts:26`): `currentRole(state)` returns whose turn it is (or `null` when terminal), and `autoMove(state, role)` returns a random *legal* move for that role. A game implementing neither has no clock. Tic-tac-toe implements both (`engine.ts:99`/`:108`).

**Per-player clocks with strikes.** Each seat tracks a `strikes` count (consecutive timeouts), held purely in memory in the `TurnTimerManager` (there is no DB column). `turnLimitMs` (`turn-timer.ts:6`) sets the limit: a seat's **first turn** is 30 seconds; every later turn is `30s - strikes * 5s`, floored at 10 seconds (so strikes 0 → 30s, 1 → 25s, 2 → 20s). A **real** move clears that seat's strikes (`applyMove` calls `resetStrikes` when `!opts.auto`, `turn-based.ts:185`); an auto-move does not.

**Scheduling.** `scheduleNext(io, gameRow)` (`turn-based.ts:50`) is called when a game goes `active` (on join or public assignment) and after every move (real or auto). It resolves the current role via `currentRoleOf` (which `safeParse`s the stored state and calls `engine.currentRole`), computes the limit, and `arm`s one pending deadline per game (`turnTimers.arm`, `turn-timer.ts:103`). When the game is not `active` or has no current role, it clears the timer instead.

**Timeout → auto-move or abort.** When a deadline fires, `onTurnTimeout` (`turn-based.ts:231`) re-loads the game, finds the role on the clock, and asks `decideTimeout` (`turn-timer.ts:18`): the seat's strike count increments, and once it would reach `ABORT_AT_STRIKES = 3` the seat is **aborted** instead of getting a fourth reduced turn; otherwise the timer plays the engine's `autoMove` through the normal `applyMove` path (validated by `moveSchema`, reduced, persisted, broadcast, flagged `auto: true`). A continuously-AFK seat therefore runs `30s → 25s → abort on the third timeout`; a seat that keeps responding stays at `30s → 30s → 30s → …`, independent of the opponent.

**Abort outcome** (terminal status `aborted`, written by `abortGame`, `turn-based.ts:202`): `abortOutcome` (`turn-timer.ts:24`) makes the **responding opponent win by forfeit** when the opponent's strikes are `0` (`winner = opponent`); if the opponent is *also* mid-AFK (strikes > 0) there is **no winner**. `abortGame` writes `status: "aborted"` + `completedAt` + `winner`, bumps stats only when there is a winner, disposes the timer, and emits `game_state` + `game_over` + the game-card broadcast. `aborted` is part of `gameStatusSchema` and `isGameOver` (`packages/shared/src/types/games/wire.ts:6`/`:136`), so the game-over modal treats it like any other finish.

**Wire fields.** Every broadcast `game_state` carries the live `turnDeadline` (a millisecond epoch, or `null`) and per-player `timeoutStrikes`, stamped by `withTimerFields` (`turn-based.ts:31`); both are optional fields on `GameJson` / `GamePlayerDto` (`wire.ts:107`/`:24`). The board's avatar **countdown ring** (`packages/games-client/src/ui/countdown-ring.tsx`) animates a depleting SVG arc from `turnDeadline - now` down to 0 with linear easing around whichever seat is on the clock (see [web.md](./web.md) and [games-client.md](./games-client.md)).

> **Known limitation.** The strikes and the pending deadline live in one node's memory, so a multi-node deployment assumes one node owns a game's clock. The `turnDeadline` on the wire is recomputed on every broadcast, so a reconnecting board recovers the live countdown, but cross-node durability (redis-backed deadlines + a sweeper, or per-room node affinity) is future hardening.

## Rooms

All multicast goes through named rooms, and the naming is centralized in `apps/server/src/realtime/rooms.ts`:

- `game:<code>` - `gameRoom` (`rooms.ts:3`), joined in `joinGameRoom` (`rooms.ts:7`), left in `leaveGameRoom` (`rooms.ts:11`), targeted by `emitToGame` (`rooms.ts:15`). Board state lives here. **The room is keyed by the game's public code, not the internal UUID** - the handler joins `game.code` and emits with `emitToGame(io, gameRow.code, …)` (`turn-based.ts:291`, `:193`). (`conv:<conversationId>` and `user:<userId>` below stay UUID-keyed.)
- `conv:<conversationId>` - `convRoom` (`rooms.ts:24`), `joinConvRoom`/`leaveConvRoom` (`rooms.ts:32`), `emitToConv` (`rooms.ts:40`). Chat messages, typing, and game-card updates live here.
- `user:<userId>` - `userRoom` (`rooms.ts:28`), `emitToUser` (`rooms.ts:49`). Per-user fan-out: notifications, presence, friend events. A user can have several sockets all in this one room (multiple tabs), which is exactly why presence reference-counts.

Because room membership lives in the Socket.IO adapter, `emitTo*` works the same whether the recipient is on this node or - with the Redis adapter - another.

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

`apps/server/src/realtime/redis.ts:11`. With no `REDIS_URL` the app runs single-node and the adapter is a no-op. The module keeps the pub connection in a module-level `pubClient` and exposes `redisStatus()` (`apps/server/src/realtime/redis.ts:33`) plus `getRedisPubClient()` (`apps/server/src/realtime/redis.ts:29`), which the `/health` readiness check uses to report `ok`/`off`/`error` (see [server-api.md](./server-api.md)). `/health` also runs `runHealthProbe()` (`apps/server/src/realtime/health.ts`), broadcasting a nonce-carrying `health_probe` event into the `health:probe` room - no client joins that room, so users receive nothing, but the adapter publishes the broadcast to Redis, and the probe verifies that round-trip itself: a one-shot subscriber (a `duplicate()` of `pubClient`) watches the adapter's room channel (`socket.io#/#health:probe#`) until the probe's nonce appears, so a broken emit-to-Redis pipeline turns `/health` into a `503`. The `smoke.yml` workflow additionally observes the same publish externally with a raw `PSUBSCRIBE socket.io#*`, and `apps/server/integration/health-probe-redis.test.ts` exercises the round-trip against a real Redis. With one set, `@socket.io/redis-adapter` is installed so that an `emitToGame`/`emitToConv`/`emitToUser` on **any** node reaches sockets connected to **every** node. Nothing in the handlers changes - they always call the same room helpers - which is the entire reason the room abstraction exists.

**Multiple nodes need sticky sessions.** The adapter fans out broadcasts but does **not** share the Socket.IO handshake session. The default transport opens with HTTP long-polling - several separate HTTP requests - before upgrading to WebSocket, and the session created on the first request lives in that one node's memory. A load balancer that round-robins those requests across nodes yields `"Session ID unknown"` errors and an endless reconnect loop. Pin each client to one node with session affinity (sticky sessions keyed on the `io` cookie or client IP), or force `transports: ["websocket"]` on the client so there is no polling phase to pin - at the cost of the long-polling fallback that some proxies require.

**Redis is a shared dependency, not a store.** If it becomes unreachable, each node silently degrades to local-only broadcasting - the split-brain the adapter exists to prevent - so run it with the availability you expect of the cluster. Pub/sub is fire-and-forget with no replay: a node briefly disconnected from Redis drops those messages. Durable game state is unaffected (Postgres is authoritative and `emitFullState` re-syncs on reconnect), but purely ephemeral broadcasts like typing and presence can be lost.

**Presence uses Redis directly, not just the adapter.** Beyond broadcast fan-out, the `PresenceStore` (`presence-store.ts`) keeps a per-user sorted set of live socket heartbeats in Redis so "who's online" is correct cluster-wide and self-heals when a node dies. It uses a dedicated command client (`getRedis()` in `redis-client.ts`), separate from the adapter's pub/sub connections. With no `REDIS_URL`, presence falls back to an in-process map and stays single-node.

## Gotchas, invariants & conventions

- **The client is never the authority.** The browser runs the same engine for prediction, but `make_move` is re-validated by `moveSchema`, by `stateSchema`, and finally by `engine.reduce` on the server (`turn-based.ts:320`). If the three disagree with the client, the server wins. Do not "optimize" by trusting client-supplied state.
- **One socket per tab carries both lanes.** The browser opens a single authenticated Socket.IO connection in the web app's `SocketProvider`; the shared game session owns `join_room` / `make_move` / `leave_room`, while boards receive state and a move callback - they do **not** call `io()` themselves. So the chat lane and the game lane always share one connection, one auth check, and one `socket.data.userId`. See [games-client](./games-client.md).
- **Identity comes from `socket.data.userId`, never from a payload.** Set once in the `io.use` middleware (`index.ts:51`). Any handler that reads a `userId` off the wire would be a security bug.
- **Two error/result conventions, one per lane.** Chat lane: ack callbacks shaped `{ ok, ... }` via `ack`/`ackErr`, wrapped by `register` (`socket-util.ts:26`). Game lane: a `"game_error"` emit *and* a string ack `cb?.(msg)`, wrapped by `registerGameEvent` (`socket-util.ts:46`). Follow the lane you are in.
- **Both lanes validate inbound payloads with shared Zod schemas.** The chat lane `safeParse`s every payload against a `client*Schema` from `@kyzen/shared/types` (`clientSendMessageSchema`, `clientFriendRequestSchema`, …) - there is no longer any hand-rolled `isObj`/`str`/`strArray` coercion. The game lane does the same with `clientJoinRoomSchema` / `clientMakeMoveSchema` inside `registerGameEvent`. In the game lane there is a *second* layer: the envelope schema only guarantees `{ gameId, moveData: unknown }`; the real move shape is the game's `moveSchema`, checked inside `handleMakeMove`. Skipping either game-lane layer is a hole.
- **The game lane keys on the public code, not the UUID.** The wire `gameId` is the game's short room **code** (validated by `gameCodeSchema`/`isGameCode`); the handler resolves it via `games.getGameByCode(...)` (`turn-based.ts:282`/`:305`) and joins/emits the `game:<code>` room. The internal UUID `game.id` is still used for DB writes and FK joins (`games.listMoves`, `games.addMove`, `games.updateGame` all take `gameRow.id`) but never appears on the wire. Conversation and user rooms remain UUID-keyed.
- **`join_room` ships the full snapshot; `make_move` ships a delta.** `emitFullState` (`turn-based.ts:69`, fired on join) sends the entire game + full `moves[]` list, so reconnects and late joiners are correct for free. Per move, `handleMakeMove` instead emits one `game_state` carrying the full `game` plus only the single new `move`; the shared session merges it into the ordered history. The `ServerGameStatePayload` type covers both shapes (`moves?` for the full list, `move?` for the delta) - a payload carries one or the other, never both. Don't turn the join-time snapshot into a diff without a resync story.
- **Seating happens on `join_room`, not on a separate "sit" event.** `intent: "spectate"`, a full table, or a reserved `challenge` seat all silently result in `changed: false` (`turn-based.ts:96`) - you watch instead of erroring. `room:create` / `room:join` are advisory pre-flight helpers, not authoritative seating.
- **Presence is Redis-backed; typing is still an in-process map.** Presence reads/writes go through a `PresenceStore` (`presence-store.ts`): a Redis sorted set per user (`presence:<userId>`, scored by heartbeat time) when `REDIS_URL` is set, or an in-process map for single-node dev. A per-node timer refreshes the live entries every `PRESENCE_HEARTBEAT_MS`, so a crashed node's users age out of reads within `PRESENCE_STALE_MS`. Durable last-seen lives in `user_profile.last_seen_at`, written on graceful disconnect and on a slower `PRESENCE_LASTSEEN_PERSIST_MS` timer while online. The live "went offline" push on a hard crash is not yet implemented (online reads still self-correct within the stale window). Typing (`typing.ts:11`) is still a per-node in-process map - treat it as best-effort, single-node-accurate.
- **`notify` self-suppresses** (`notify.ts:16`) and depends on `getIO()` being set - which `attachRealtime` guarantees at boot via `setIO(io)` (`apps/server/src/realtime/index.ts:37`). Calling `notify` before `attachRealtime` would persist the row but skip the live push (`if (!io) return`).
- **There is no driver layer.** `index.ts` calls `handleJoinRoom` / `handleMakeMove` from `turn-based.ts` directly via `registerGameEvent`; the `GameEngine` already distinguishes `mode: "turn-based" | "realtime"` (`packages/shared/src/types/games/engine.ts`), so a future realtime/tick-based engine would branch on that mode rather than reintroduce a `getDriver`-style indirection.
- **One live game per `(conversation, gameType)`; rematch is a chat-lane event.** Both `createGameInConversation` and `rematchGame` call `games.findLiveGameInConversation` first and return the existing live game rather than creating a duplicate, so concurrent "new game" / double-Rematch clicks converge. `game:rematch` only acts on a `completed` game with a conversation, pre-seats both prior players (loser-first via `computeRematchSeating`), links the new game with `seriesId = prev.seriesId`, and emits `rematchCreated { newGameId }` to the *old* game's room.
- **Stored state is treated as untrusted too.** `stateSchema.safeParse(gameRow.gameState)` returning failure yields `"Corrupt game state"` rather than a crash (`turn-based.ts:318`) - a deliberate guard against bad data in JSONB.
- **The turn timer is server-authoritative and in-memory.** Per-seat strikes and the pending deadline live in the `TurnTimerManager` (`turn-timer.ts`), not the DB; the client only renders a countdown synced to the `turnDeadline` on each `game_state`. A game opts in by implementing `engine.currentRole` + `engine.autoMove`; auto-moves run through the same validate/reduce/persist path as real moves, and three consecutive timeouts on a seat abort the game (`status: "aborted"`).
- **No comments in code.** This repo enforces a strict no-comments rule; the lone comment in this subsystem is a justified `biome-ignore` at `turn-based.ts:102`.

## Where to go next

- [Architecture overview](./README.md) - the monorepo map and how these pieces fit together.
- [Auth](./auth.md) - Better Auth, sessions, and the cookie the socket handshake reads.
- [Database](./database.md) - the repositories the driver calls (`games.*`, `profiles.*`) over the generic `game` / `move` / `game_player` tables.
- [games-core schemas](./games-core-schemas.md) - `clientJoinRoomSchema`, `clientMakeMoveSchema`, `moveSchema`/`stateSchema`, and the `ServerGameStatePayload` wire types.
- [games-core engine](./games-core-engine.md) - the `GameEngine` interface, `reduce`, `Outcome`, roles, and seat counts the driver depends on.
- [games-client](./games-client.md) - the shared session that manages room events and reconnects, and the boards that receive its state and move callback.
- [chat-core](./chat-core.md) - `CHAT_EVENTS`, the chat DTOs, and the socket event contract shared by both ends.
- [Server API](./server-api.md) - the shared Hono REST side that mounts `attachRealtime`.
- [Web](./web.md) - how the Next.js client connects the socket and wires Jotai state to these events.
- [Testing](./testing.md) - the `integration/game-driver.test.ts` suite drives the real `handleJoinRoom`/`handleMakeMove` against a live DB via a mock io/socket.

## Runtime mount and client ownership

`apps/server/src/http.ts` mounts this realtime layer on the same HTTP server as Next.js in the default runtime. The separate backend uses that same mount. See [deployment](../deployment.md).

Boards no longer join rooms or subscribe directly. `packages/games-client/src/use-game-session.ts` owns one session per play view, uses the application socket, filters snapshots by room, merges move history, and resynchronizes on reconnect. The board and overlays receive that session as props. Turn timers remain process-local, so deployment currently requires one persistent realtime instance.
