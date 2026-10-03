# Realtime: Socket.IO & the Two Lanes

## What this is / why it matters

Everything live in this app - chat messages, typing dots, presence, friend requests, notifications, and the moment-to-moment play of a game - rides over **one Socket.IO connection per browser tab**. The realtime layer lives entirely in `apps/server/src/realtime/`. It does three jobs:

1. **Authenticates the socket once, from the Better Auth session cookie** carried in the WebSocket handshake, and stamps `socket.data.userId` so every downstream handler knows who is talking without re-checking auth.
2. **Multiplexes two logically separate "lanes" onto that single connection** - a **chat lane** (chat, friends, typing, presence, in-chat game creation, notifications) and a **game lane** (`join_room` / `make_move` / `leave_room`). They share a connection but are wired and validated independently - **both lanes validate every inbound payload with shared Zod schemas**. The browser opens **one** Socket.IO connection (the web app's `SocketProvider`); the shared game session uses it rather than boards dialing their own - see [games-client](./games-client.md).
3. **Runs every game action through the authoritative game runner** (`handleJoinRoom` / `handleMakeMove` in `turn-based.ts`, transitions in `game-runner.ts`) that serializes each game's transitions behind a process-local lock, validates the payload *and the stored state* against the game's strict Zod schemas (the same schemas the client uses), applies the pure engine `reduce`, persists with compare-and-swap, runs bots and clocks, and broadcasts a redacted state. Turn-based and simultaneous-round engines share this path.

The reason this matters - and the single most important idea in the whole subsystem - is that **the client is never trusted**. The browser imports `@kyzen/games-core` to render a board and *predict* legality, but the server imports the *exact same* `GameDefinition` (engine + `moveSchema` + `stateSchema`) and re-validates everything. The frontend's copy of the engine is a UX convenience; the server's copy is the source of truth. A hand-crafted `make_move` packet hits `clientMakeMoveSchema.safeParse`, then `def.moveSchema.safeParse`, then `def.engine.reduce` returning `{ ok: false }` - three independent rejections before any database write happens.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/realtime/index.ts` | `attachRealtime`: build the `IOServer`, attach the Redis adapter, install the handshake-cookie auth middleware, and on each connection wire every chat-lane handler plus the three game-lane listeners (`join_room`, `make_move`, `leave_room`). |
| `apps/server/src/realtime/io.ts` | `setIO` / `getIO` singleton so non-socket code (e.g. `notify`) can emit without holding a `socket` reference. |
| `apps/server/src/realtime/rooms.ts` | Room name helpers + emit helpers: `gameRoom`/`convRoom`/`userRoom` naming and `emitToGame`/`emitToConv`/`emitToUser`. |
| `apps/server/src/realtime/turn-based.ts` | The game-lane socket handlers: `handleJoinRoom` (seating, including lobby seats) and `handleMakeMove` (resolve the code, then `submitMove`). |
| `apps/server/src/realtime/game-runner.ts` | The generalized runner: `submitMove` (lock, reload, reduce, compare-and-swap persist, retry), `settle` (pending bot moves, then clocks), the keyed turn and round clocks with their timeout handlers, `ensureClock`, `emitFullState`, and N-player aborts. |
| `apps/server/src/realtime/game-lock.ts` | `withGameLock(gameId, fn)`: a process-local per-game async mutex wrapped around every transition (join seating, move, timeout, bot move, lobby configure/start, abort). |
| `apps/server/src/realtime/simultaneous.ts` | Pure helpers for simultaneous engines: acting roles, the round clock key and allowance, and pending human/bot seats. |
| `apps/server/src/realtime/setup.ts` | Seat construction: fresh seeds, initial states, lobby settings, lobby seats (humans then bots, team assignment), public group sizes and seats, bot difficulty lookup. |
| `apps/server/src/realtime/lobby.ts` | `configureRoom`, `startRoom`, `leaveRoom`, and `kickPlayer` services behind `room:configure` / `room:start` / `room:leave` / `room:kick`. |
| `apps/server/src/realtime/turn-timer.ts` | The server-authoritative clock: pure helpers (`turnLimitMs`, `decideTimeout`, `abortWinners`) + the in-memory `TurnTimerManager` (`turnTimers` singleton) that tracks per-seat strikes and one keyed deadline per active game. |
| `apps/server/src/realtime/room-events.ts` | `attachRoomHandlers`: the standalone-room events `room:create` / `room:join` / `room:configure` / `room:start` / `room:leave` / `room:kick` (all rate-limited), each parsed against a shared Zod schema. |
| `apps/server/src/realtime/rooms-service.ts` | `createStandaloneGame` (conversation-less game, host pre-seated, lobby engines start with no state) and `validateJoinByCode` (typed `not_found`/`full`/`already_started`/`finished` checks, counting configured bots). |
| `apps/server/src/realtime/matchmaking.ts` | `game:queue_join` / `game:queue_leave`: validates the queue config, sizes the group, and starts the match clock. |
| `apps/server/src/realtime/match-chat.ts` | `match:message` and `match:friend` for games without a conversation. |
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

The payoff: no handler ever re-reads the cookie or accepts a `userId` from the wire. `const userId = socket.data.userId` is trusted identity everywhere downstream (`turn-based.ts`, `chat.ts:28`, `friends.ts:12`, `typing.ts:43`, `presence.ts:63`, `games-in-chat.ts:25`). A forged `userId` in a payload is simply ignored - the only `userId` that exists came from a verified session.

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

1. Load the finished game by code; require `status === "completed"` and that the requester was one of its players. A game without a conversation takes the private-room path below; public matches are rejected.
2. Run the **same one-live guard** (`findLiveGameInConversation`, `:163`): if a rematch is already live, return it - so two players both clicking Rematch converge on one game.
3. Compute fair turn order via the single seam `computeRematchSeating(prev) → orderedUserIds` (`apps/server/src/chat/rematch-seating.ts`): for 2 players the **loser goes first** (on a draw, the first mover swaps from the previous game's first mover); for N > 2 it rotates the starting seat by one. Seat `i` gets `engine.roleForSeat(i)`.
4. Create the new game in the same conversation with `seriesId = prev.seriesId` (linking it into the series), `config` copied from the parent, a fresh initial state, and **every prior player pre-seated** in the arranged order - so it starts `active` immediately. Lobby engines instead get a new **waiting lobby** with the same config, every prior human pre-seated in the previous seat order, no bots seated yet, and no state; the requester becomes the host who starts it.
5. `announceGame` posts the rematch's own `game_card` and notifies the other member(s).

**Private rooms.** For a standalone room (no conversation, not public), `rematchRoom` (`rooms-service.ts`) calls `games.createRematch`, which takes a transaction advisory lock on the series id and returns the live (waiting or active) game of that series when one exists. Otherwise it creates a new waiting room in the same series with the same config (so the same bots, and the same teams for players who rejoin) and the requester seated as host. Concurrent clicks therefore converge on one room. Only the click that created the room invites anyone: the handler emits `CHAT_EVENTS.rematchCreated` `{ newGameId, previousGameId }` to every other human participant's user room, and every caller is acked `{ ok: true, gameId }`.

Back in the handler, on success for a conversation game it emits `CHAT_EVENTS.rematchCreated` (`game:rematch_created`, payload `{ newGameId, previousGameId }`) to the **old** game's room (`emitToGame(io, parsed.data.gameId, …)`, `games-in-chat.ts:58`) so an open game-over modal there can flip its button to **Go to rematch**, and acks `{ ok: true, gameId }` - the new game's public code - to the caller, who navigates to `/play/<code>`. The card-side series score is enriched at assembly time (see [chat-core](./chat-core.md) and [server-api](./server-api.md)).

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

The envelope schemas are strict and tiny - `clientMakeMoveSchema` is `{ gameId: gameCodeSchema, moveData: unknown }.strict()` (`packages/shared/src/types/games/wire.ts:35`); the *contents* of `moveData` are validated later by the game-specific `moveSchema` inside `handleMakeMove`, because the envelope layer cannot know what shape a Reversi vs. a Tic-Tac-Toe move takes. `clientJoinRoomSchema` adds an optional `intent: "play" | "spectate"` (`wire.ts:27`). Both envelopes key off `gameId` - now the game's **public code** (validated and normalized by `gameCodeSchema`), not the internal UUID - not a `gameType`; the registry-typed `gameTypeSchema` (from `@kyzen/shared/types`) that validates `gameType` guards the game-card DTOs and game creation, while the handler resolves both the game (via `games.getGameByCode` in `turn-based.ts`) and its type from the stored `gameRow.gameType` (`game-runner.ts`).

`join_room` and `make_move` report failures *twice*: through the ack callback (`cb?.(msg)`) for the specific caller, and as a `"game_error"` emit (`socket-util.ts:59`/`:79`). They also wrap the body in `try/catch` and log a `durationMs` on success (`socket-util.ts:66`) - the game lane's own version of the safety/observability that `register` gives the chat lane. (`leave_room` only acks; it has nothing to fail at beyond payload validation.)

## The authoritative game flow

This is where the "never trust the client" principle is enforced. The game-lane handlers live in `turn-based.ts`; every state transition goes through `game-runner.ts` inside `withGameLock(gameId, ...)`.

### `handleJoinRoom` and seating

`handleJoinRoom` validates the room code, loads the game, and hides public matches from non-participants. Inside the game lock it re-reads the row and calls `ensureSeated`:

- A user is seated only if they are not already a player, the game is `waiting`, they did not ask to `spectate`, a `challenge` seat is not reserved for someone else, and `players + configured bots < engine.maxPlayers` (`maxPlayers` may be `Infinity`).
- The seat's role is `engine.roleForSeat(players.length)`. `games.seatPlayer` locks the waiting game row, refuses an occupied seat order, and inserts with `ON CONFLICT (game_id, user_id) DO NOTHING`, so duplicate joins and two different joiners racing for the same seat cannot both win.
- **Lobby engines** (`engine.lobby` set) only gain a seat; the game stays `waiting` with `gameState: null` until the host starts it.
- **Other engines** flip to `active` once `minPlayers` are seated and get a fresh `createInitialState(seats, { config, seed })`.

When the game is active, the handler then runs `settle` (pending bot moves and the clock; both are idempotent), joins the socket to `game:<code>`, and broadcasts the full redacted snapshot with `emitFullState`. A seat change also refreshes the conversation game card.

### `handleMakeMove` and `submitMove`

`handleMakeMove` resolves the room code and calls `submitMove(io, gameId, userId, moveData)`, which holds the game lock and loops at most four times (one attempt plus three retries):

1. Re-read the game by id; reject `"Game not found"`, `"Game is not active"`, or `"Not a player in this game"`. Identity comes from `socket.data.userId`; the role from the persisted seat.
2. `commitMoves` validates `moveData` with `def.moveSchema` (`"Invalid move"`), re-validates the stored state with `def.stateSchema` (`"Corrupt game state"`), and runs `def.engine.reduce(state, { role }, move)`. A rejection is relayed verbatim.
3. `games.persistGameMoves` locks the row, compares the previous JSONB state, writes the new state, appends the moves with consecutive numbers, and on completion writes `status`, `completedAt`, `winners`, `winner`, and human stats in the same transaction. A compare-and-swap miss means another process changed the game, so the runner reloads and reduces again. Two players locking at the same instant therefore both persist: in-process they queue on the lock; across processes the loser of the CAS retries on the new state.
4. A real (non-auto) move resets that seat's strikes. The clock is re-armed, then one `game_state` `{ game, move }` is emitted to the room. A completed game disposes its clock, emits `game_over { winner }`, and refreshes the game card.
5. `settle` computes `botMove` for every pending bot seat on the same state, reduces them in memory, persists them in one `persistGameMoves` transaction, emits one `game_state` whose `move` is the batch's last move, and re-arms the clock. A bot whose move is rejected ends the batch; the earlier bots stay saved. When no human is pending, `settle` does not submit the next round's bots; the bot clock below does, after the presentation delay. Clients that need every move of a batch read the full list from `join_room` or `GET /api/games/:code`.

**Completion.** `Outcome.winnerRoles` maps to user ids in `game.winners`; `game.winner` is the single winner's id, `"draw"` for any draw, or `null` for a shared (team) win. Stats per human seat: drawn on a draw when the seat is listed or nobody is listed, won when not a draw and listed, otherwise lost. Bot ids (`bot:<n>`) never receive stats, profiles, friendships, notifications, or chat.

### Broadcasts and redaction

Every serialized game passes through `serializeGame`, which applies `engine.publicState(state)` when defined, adds `config` and `winners`, and aliases public-match identities; `withTimerFields` (`turn-timer.ts`) then adds the live `turnDeadline` and per-player `timeoutStrikes`. Moves pass through `serializeMoves` / `serializeMove`, which apply `engine.publicMove(currentState, moveData)`. The HTTP snapshot (`GET /api/games/:code`, including `turnDeadline` and `timeoutStrikes`, so a reloading client sees the deadline at once), `join_room` snapshots, move deltas, and `game_over` all use these serializers; `game_over` carries only the winner summary. Broadcasts stay one shared payload per room, so engines must not put per-viewer secrets into public state.

There are **two audiences**: `game_state` / `game_over` go to the game room `game:<code>`; `broadcastGameCard` pushes `message_updated` to the originating conversation room so the embedded card follows the game.

### Full data-flow walkthrough: a winning move

```
make_move { gameId, moveData }
  -> registerGameEvent("make_move", clientMakeMoveSchema)        envelope Zod
  -> handleMakeMove: games.getGameByCode(code)
  -> submitMove: withGameLock(game.id)
       games.getGameById(id), seat lookup by socket.data.userId
       moveSchema / stateSchema safeParse, engine.reduce(state, { role }, move)
       games.persistGameMoves (row lock + state CAS + winners + stats)
         -> CAS miss: reload and retry (up to 3 retries)
       resetStrikes, schedule clock
       emitToGame "game_state" { game, move }                     redacted
       completed -> dispose clock, emitToGame "game_over", broadcastGameCard
       settle -> one batch for every pending bot seat (one transaction,
                 one broadcast), or the bot clock when no human is pending
```

Creation is a chat-lane or room-lane action: `createGameInConversation`, `room:create`, and public matchmaking create the game; play flows over the game lane; they meet again at the game card.

## Matchmaking lane

Public matching uses the PostgreSQL queue in `games.joinMatchmaking`. The two queue events return acknowledgements and validate the envelope and the definition's `configSchema`. Turn-based and simultaneous engines are supported; the group size is `engine.playerCount?.(config) ?? 2` and must fit the engine's player bounds. A match is created with every seat assigned, no bots, and no permanent conversation, and `ensureClock` starts its clock. See [public matchmaking](matchmaking.md) for transactions, leases, teams, anonymity, temporary chat, and consent.

## Standalone-room lane (`room:create` / `room:join` / `room:configure` / `room:start` / `room:leave` / `room:kick`)

A "room" is the product/UI name for a multiplayer game session; **internally a room is still a `game` row**. `attachRoomHandlers(io, socket)` (`room-events.ts`) wires six rate-limited, ack-shaped events, each parsed with a shared Zod schema. `room:create` and `room:start` allow 10 per minute per socket, `room:join` 30, and `room:configure`, `room:leave`, and `room:kick` share 60:

- **`room:create { gameType, config? }`** → `{ ok: true, code }` or `{ ok: false, error }`. `createStandaloneGame` validates `config` with the definition's `configSchema` and creates a conversation-less game with the host seated as `roleForSeat(0)`. Lobby engines start with `gameState: null`; other engines get an initial state immediately. No game card or notification is sent.
- **`room:join { code }`** → `{ ok: true, code }` or `{ ok: false, error }` with `not_found | full | already_started | finished`. `validateJoinByCode` is a pre-flight check; `full` counts configured lobby bots, so lobbies accept any number of humans up to `maxPlayers`. Real seating still happens on `join_room`.
- **`room:configure { gameId, config }`** → `{ ok: true }` or `{ ok: false, error }`. Host only (`creatorUserId`), waiting only. The config must parse with the definition's `configSchema` (the shared `lobbyConfigSchema` caps `bots` at `LOBBY_MAX_BOTS` = 64); bots and team mode are allowed only when `engine.lobby` declares them, every `teams` key must be a seated user or a configured bot id (`"Teams can only list seated players and bots"`), seated humans plus bots may not exceed `maxPlayers`, and in teams mode two or more seats must span at least two teams (`"Teams mode needs players on at least two teams"`). Humans are not capped. The config is persisted and a full snapshot is broadcast. Games in chat lobbies use the same event.
- **`room:start { gameId }`** → `{ ok: true }` or `{ ok: false, error }`. Host only, waiting only; a second start reports `"Game already started"`. Seats are humans in seat order, then bots in config order, with `role = roleForSeat(index)`. In `mode: "teams"` each seat takes its configured team (`teams[userId]` or the bot's `team`), and unassigned seats join the less populated of `A` and `B`; otherwise each seat's team is its role. `minPlayers` counts bots, and teams mode needs at least two distinct teams. The server creates the state with a fresh seed, and `games.startLobby` locks the waiting row, verifies the seated humans and config did not change, inserts bot `game_player` rows (`user_id = bot:<n>`, username `"Bot <n> (<Difficulty>)"` where `n` is the 1-based position in `config.bots`), and sets `active` / `startedAt`. Bots then move, the clock is armed, and the snapshot is broadcast.
- **`room:leave { gameId }`** → `{ ok: true }` or `{ ok: false, error }`. A seated non-host leaves a waiting lobby: `games.removeLobbyPlayer` locks the waiting row, deletes their `game_player` row, compacts seat order and roles, and drops their `teams` entry. Their sockets leave `game:<code>`, and the room gets a full snapshot. The host cannot leave (`"The host cannot leave the lobby"`); closing the tab is enough.
- **`room:kick { gameId, userId }`** → `{ ok: true }` or `{ ok: false, error }`. Host only, waiting only, with the same effect for the target, who also receives `game_error { message: "Removed from the room" }` on their user room.

Standalone rooms (and public matches) have temporary participant-only match chat, readable and writable by seated players from the lobby on; see [public matchmaking](matchmaking.md). Friend challenges keep their conversation and still flow through the chat lane.

## Turn timer, round clock, auto-move & auto-abort

Every active game with clock hooks runs a **server-authoritative** deadline; the client only renders a countdown from `turnDeadline`. `turnTimers` (`turn-timer.ts`) keeps one keyed deadline per game plus per-seat strikes in memory. `schedule` arms it after every transition and is idempotent: the same key with a live deadline is left alone.

**Turn-based engines** (`currentRole` + `autoMove`). The key is the current state, so a timeout armed for an earlier state is ignored when it fires late. A seat's first turn is 30 seconds; later turns are `30s - strikes * 5s`, floored at 10 seconds. On timeout the seat's strike count increments and the runner plays `autoMove(state, role, strikes)` (flagged `auto: true`); the third consecutive timeout **aborts** instead. `abortWinners` makes every other seat with zero strikes a winner by forfeit (for two players: the attentive opponent), and nobody wins if everyone else is also absent. `abortActiveGame` writes `aborted`, `winners`, `winner`, and stats only when someone won.

**Simultaneous engines** (`roundOf` + `pendingRoles` + `roundTimeMs` + `autoMove`). The key is `round:<roundOf(state)>`, so the clock re-arms exactly when the round changes, with `roundTimeMs(state)` as the full allowance (including replay playback). On expiry the runner re-checks the key (a stale round is ignored), then submits `autoMove(state, role, strikes)` for every still-pending human in one batch (one transaction, one broadcast) and bumps that role's strikes; `strikes` is the count of earlier consecutive timeouts. Pending bots whose `botMove` failed fall back to `autoMove` without strikes. A real submit resets the role's strikes. Simultaneous games never abort; the engine decides what absentees forfeit. Disconnects do not pause the clock, and `join_room` returns the full public snapshot.

**Bot clock.** When only bots are pending (every human is eliminated or out) and the engine's `resultDelayMs(state)` is positive, the clock is armed with key `bots:round:<n>` for that delay, the replay of the latest resolution plus the results banner. When it fires, the runner re-checks the key (stale timers are ignored), submits every bot's move as one batch, and arms the next round's bot clock, so spectators and eliminated players watch each round at normal pace. `turnDeadline` shows when the bots will lock. Engines without `resultDelayMs` (or a delay of 0, such as right after tank select) let bots lock immediately.

**Wire fields.** Every broadcast `game_state` carries `turnDeadline` (the turn or round deadline in epoch ms, or `null`) and per-player `timeoutStrikes`.

> **Known limitation.** Strikes and deadlines live in one node's memory, so a multi-node deployment assumes one node owns a game's clock. Moves are safe across processes (row lock + compare-and-swap), and a restarted process re-arms a full deadline when the game is next joined or matched.

## Rooms

All multicast goes through named rooms, and the naming is centralized in `apps/server/src/realtime/rooms.ts`:

- `game:<code>` - `gameRoom` (`rooms.ts:3`), joined in `joinGameRoom` (`rooms.ts:7`), left in `leaveGameRoom` (`rooms.ts:11`), targeted by `emitToGame` (`rooms.ts:15`). Board state lives here. **The room is keyed by the game's public code, not the internal UUID** - the handler joins `game.code` and emits with `emitToGame(io, gameRow.code, …)` (`turn-based.ts`, `game-runner.ts`). (`conv:<conversationId>` and `user:<userId>` below stay UUID-keyed.)
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

- **The client is never the authority.** The browser runs the same engine for prediction, but `make_move` is re-validated by `moveSchema`, by `stateSchema`, and finally by `engine.reduce` on the server (`game-runner.ts`). If the three disagree with the client, the server wins. Do not "optimize" by trusting client-supplied state.
- **One socket per tab carries both lanes.** The browser opens a single authenticated Socket.IO connection in the web app's `SocketProvider`; the shared game session owns `join_room` / `make_move` / `leave_room`, while boards receive state and a move callback - they do **not** call `io()` themselves. So the chat lane and the game lane always share one connection, one auth check, and one `socket.data.userId`. See [games-client](./games-client.md).
- **Identity comes from `socket.data.userId`, never from a payload.** Set once in the `io.use` middleware (`index.ts:51`). Any handler that reads a `userId` off the wire would be a security bug.
- **Two error/result conventions, one per lane.** Chat lane: ack callbacks shaped `{ ok, ... }` via `ack`/`ackErr`, wrapped by `register` (`socket-util.ts:26`). Game lane: a `"game_error"` emit *and* a string ack `cb?.(msg)`, wrapped by `registerGameEvent` (`socket-util.ts:46`). Follow the lane you are in.
- **Both lanes validate inbound payloads with shared Zod schemas.** The chat lane `safeParse`s every payload against a `client*Schema` from `@kyzen/shared/types` (`clientSendMessageSchema`, `clientFriendRequestSchema`, …) - there is no longer any hand-rolled `isObj`/`str`/`strArray` coercion. The game lane does the same with `clientJoinRoomSchema` / `clientMakeMoveSchema` inside `registerGameEvent`. In the game lane there is a *second* layer: the envelope schema only guarantees `{ gameId, moveData: unknown }`; the real move shape is the game's `moveSchema`, checked inside `handleMakeMove`. Skipping either game-lane layer is a hole.
- **The game lane keys on the public code, not the UUID.** The wire `gameId` is the game's short room **code** (validated by `gameCodeSchema`/`isGameCode`); the handler resolves it via `games.getGameByCode(...)` (`turn-based.ts`) and joins/emits the `game:<code>` room. The internal UUID `game.id` is still used for DB writes and FK joins (`games.listMoves`, `games.addMove`, `games.updateGame` all take `gameRow.id`) but never appears on the wire. Conversation and user rooms remain UUID-keyed.
- **`join_room` ships the full snapshot; `make_move` ships a delta.** `emitFullState` (`game-runner.ts`, fired on join, configure, and start) sends the entire game + full `moves[]` list, so reconnects and late joiners are correct for free. Per move, `handleMakeMove` instead emits one `game_state` carrying the full `game` plus only the single new `move`; the shared session merges it into the ordered history. The `ServerGameStatePayload` type covers both shapes (`moves?` for the full list, `move?` for the delta) - a payload carries one or the other, never both. Don't turn the join-time snapshot into a diff without a resync story.
- **Seating happens on `join_room`, not on a separate "sit" event.** `intent: "spectate"`, a full table, or a reserved `challenge` seat all silently result in `changed: false` (`turn-based.ts`) - you watch instead of erroring. `room:create` / `room:join` are advisory pre-flight helpers, not authoritative seating; `room:start` seats only bots.
- **Presence is Redis-backed; typing is still an in-process map.** Presence reads/writes go through a `PresenceStore` (`presence-store.ts`): a Redis sorted set per user (`presence:<userId>`, scored by heartbeat time) when `REDIS_URL` is set, or an in-process map for single-node dev. A per-node timer refreshes the live entries every `PRESENCE_HEARTBEAT_MS`, so a crashed node's users age out of reads within `PRESENCE_STALE_MS`. Durable last-seen lives in `user_profile.last_seen_at`, written on graceful disconnect and on a slower `PRESENCE_LASTSEEN_PERSIST_MS` timer while online. The live "went offline" push on a hard crash is not yet implemented (online reads still self-correct within the stale window). Typing (`typing.ts:11`) is still a per-node in-process map - treat it as best-effort, single-node-accurate.
- **`notify` self-suppresses** (`notify.ts:16`) and depends on `getIO()` being set - which `attachRealtime` guarantees at boot via `setIO(io)` (`apps/server/src/realtime/index.ts:37`). Calling `notify` before `attachRealtime` would persist the row but skip the live push (`if (!io) return`).
- **There is no driver layer.** `index.ts` calls `handleJoinRoom` / `handleMakeMove` from `turn-based.ts` directly via `registerGameEvent`; the runner branches on `engine.mode` (`turn-based` or `simultaneous`) only for clocks and pending roles. A realtime/tick-based engine would add a loop for that mode rather than a `getDriver`-style indirection.
- **Every transition holds the game lock.** Never call a locked entry point (`submitMove`, `ensureClock`, `startRoom`, `configureRoom`, `leaveRoom`, `kickPlayer`, the timeout and bot clock handlers) from inside another locked section of the same game; internal helpers (`commitMoves`, `settle`, `schedule`) assume the lock is held.
- **One live game per `(conversation, gameType)`; rematch is a chat-lane event.** Both `createGameInConversation` and `rematchGame` call `games.findLiveGameInConversation` first and return the existing live game rather than creating a duplicate, so concurrent "new game" / double-Rematch clicks converge. `game:rematch` acts on a `completed` game. With a conversation it pre-seats the prior players (loser-first via `computeRematchSeating`; lobby engines get a waiting lobby with the prior humans and the same config), links the new game with `seriesId = prev.seriesId`, and emits `rematchCreated { newGameId, previousGameId }` to the *old* game's room. A private standalone room instead gets one waiting room per series (`games.createRematch`) hosted by the first requester, and the other humans are invited through their user rooms.
- **Stored state is treated as untrusted too.** `stateSchema.safeParse(gameRow.gameState)` returning failure yields `"Corrupt game state"` rather than a crash (`game-runner.ts`) - a deliberate guard against bad data in JSONB.
- **The clock is server-authoritative and in-memory.** Per-seat strikes and the keyed deadline live in the `TurnTimerManager` (`turn-timer.ts`), not the DB. Auto-moves and bot moves run through the same validate/reduce/persist path as real moves.
- **No comments in code.** This repo enforces a strict no-comments rule.

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
