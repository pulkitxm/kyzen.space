# Server: Express + Hono + Socket.IO Wiring & REST API

## What this is / why it matters

`apps/server` is a single Bun process that has to do three jobs at once:

1. Speak HTTP for REST-style data fetching (conversations, friends, profiles, notifications, GIFs, and the two game *read* endpoints - the game itself and its rematch series) and for the Better Auth session/OAuth surface.
2. Speak WebSocket for everything live: chat messages, presence, typing, friend events, and - critically - the **game lane** where moves are made and validated in real time.
3. Share the exact same game/chat logic the browser uses, so that the *client is never the authority*. The browser imports `@gamelobby/games-core` to render a board and predict legality; the server imports the **same** `GameEngine` + Zod schemas to authoritatively validate and apply each move. A tampered client cannot smuggle an illegal move past the server because the server re-validates against the identical schema.

The wiring that makes this work is deliberately layered. Express owns the raw HTTP socket and CORS; it hands `/api/*` to a **Hono** app (router-per-feature); Hono routes are thin and delegate to a **service layer** (`src/chat/*`, `src/services/*`) that returns a typed `ServiceResult`; services call **repositories** (`@gamelobby/database`) and never touch raw SQL. Socket.IO is attached to the *same* underlying Node HTTP server so realtime shares the process, the auth cookie, and the in-memory `io` reference.

This doc explains how that process is assembled (`index.ts`), how the REST surface is shaped (the Hono app + every route), how rows become DTOs (`serialize.ts`), and how the `routes -> services -> repositories` + `ServiceResult` pattern keeps HTTP plumbing out of business logic. It also explains the single most surprising design decision: **the only game REST endpoints are reads** (`GET /api/games/:gameId` for the game + moves, and `GET /api/games/:gameId/series` for its rematch series) - games are created, played, and rematched over the socket lane, not over HTTP.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/index.ts` | Process entry: Express + CORS + `/health`, forwards `/api/*` to Hono via `getRequestListener`, attaches Socket.IO to the same HTTP server, installs crash handlers. |
| `apps/server/src/env.ts` | Reads/validates env vars into a frozen `env` object; `googleConfigured()` gate for OAuth. |
| `apps/server/src/api/index.ts` | The Hono app: `basePath("/api")`, request-logger middleware, mounts Better Auth + one router per feature, global `onError`. |
| `apps/server/src/api/middleware/logger.ts` | Per-request pino child logger with a request id; logs method/path/status/duration at the right level. |
| `apps/server/src/api/middleware/auth.ts` | `requireAuth` middleware + `AuthEnv`: reads the Better Auth session from request headers, `401`s when absent, and stashes `userId`/`user`/`session` on the context. |
| `apps/server/src/api/auth-context.ts` | `readJson(c)` (safe body parse). |
| `apps/server/src/api/serialize.ts` | Pure row -> DTO mappers (`serializeGame`, `serializeMove`, `serializeMessage`, `serializeConversation`, `serializeSeries`, …). The `Date -> ISO string` boundary. |
| `apps/server/src/api/routes/account.ts` | Session management built on Better Auth: list/sign-out/revoke sessions. |
| `apps/server/src/api/routes/conversations.ts` | The largest router: list/create DMs & groups, messages, read receipts, members, rename, and `POST /:id/games`. Resolution for friendly URLs: `GET /with/:username` (→ DM) and `GET /group/:name` (→ group, member-gated). Group names are unique (enforced on create + rename in `conversations-service.ts`), so a name resolves to one group; `GET /:id` remains for internal id fetches. |
| `apps/server/src/api/routes/friends.ts` | Friends list, pending requests, user search with friend-state, send/accept/decline/remove. |
| `apps/server/src/api/routes/games.ts` | The two game REST reads: `GET /:gameId` (serialized game + its moves) and `GET /:gameId/series` (the rematch series via `serializeSeries` + `computeSeriesScore`). |
| `apps/server/src/api/routes/gifs.ts` | Proxy to the Klipy GIF provider: trending + search, with limit/offset clamping. |
| `apps/server/src/api/routes/messages.ts` | `DELETE /:id` (soft-delete a message). |
| `apps/server/src/api/routes/notifications.ts` | List / unread-count / mark-read / read-all. |
| `apps/server/src/api/routes/profiles.ts` | `me` profile, appearance/avatar/chat-layout updates, display-name + username changes (with live availability + suggestions + cooldown), public profile + recent games by username. |
| `apps/server/src/chat/result.ts` | The `ServiceResult<T>` discriminated union + `ok()` / `fail(error, status)` helpers. |
| `apps/server/src/chat/assemble.ts` | "Assemblers": hydrate repository rows into full DTOs (resolve senders, members, unread counts, live game-card status). |
| `apps/server/src/chat/conversations-service.ts` | DM/group lifecycle, membership rules, socket fan-out of conversation changes. |
| `apps/server/src/chat/friends-service.ts` | Friend-request state machine, realtime emits + persistent notifications. |
| `apps/server/src/chat/messages-service.ts` | Send/system/delete/mark-read message logic + room broadcasts. |
| `apps/server/src/chat/games-in-chat-service.ts` | `createGameInConversation` (validates config via the game's Zod schema, runs the one-live guard, seats the creator, persists, posts a game-card message - shared by REST and socket) and `rematchGame` (the socket-only rematch flow). |
| `apps/server/src/chat/game-card.ts` | `enrichGameCardMeta`: merges live game status/winner (and the `seriesScore`) into a game-card's metadata. |
| `apps/server/src/chat/series.ts` | `computeSeriesScore(games)`: the pure wins-per-player + draw tally over a series, used by both the series endpoint and the card enrichment. |
| `apps/server/src/chat/rematch-seating.ts` | `computeRematchSeating(prev)`: the single seam that orders the rematch roster (loser-first for 2 players; rotate for N > 2). |
| `apps/server/src/chat/game-card-broadcast.ts` | `broadcastGameCard`: re-emits an updated game-card message to its conversation room. |
| `apps/server/src/services/gif-provider.ts` | Klipy HTTP client: normalizes provider items to `GifJson`, paginates, times out. |
| `@gamelobby/shared` (`constants/theme.ts` + `types/theme.ts`) | Theme id + color-mode catalogs (`THEME_IDS`/`COLOR_MODES`) and `isValidTheme`/`isValidColorMode` guards. |
| `@gamelobby/shared` (`constants/pattern.ts` + `types/pattern.ts`) | Background-pattern id catalog (`PATTERN_IDS`) + `isValidPattern`. |
| `@gamelobby/shared` (`types/chat-layout.ts`) | Chat-layout types/constants + `validateChatModePref`. |
| `apps/server/src/realtime/index.ts` | `attachRealtime`: builds the Socket.IO server, auth middleware, and the `join_room`/`make_move` game lane. |
| `apps/server/src/realtime/io.ts` | Module-level `io` singleton (`setIO`/`getIO`) so services can emit without an `io` parameter. |
| `apps/server/src/realtime/rooms.ts` | Room-name helpers (`gameRoom`/`convRoom`/`userRoom`) + `emitTo*`. |

## How the process is assembled (`index.ts`)

The whole backend boots from one file. The ordering matters, so read it top-to-bottom.

```ts
const server = express();

server.use(
  cors({
    origin: env.webUrl,
    credentials: true,
  }),
);

server.get("/health", (_req, res) => {
  res.json({ ok: true, service: "gamelobby-server" });
});

const honoListener = getRequestListener(honoApp.fetch);
server.all(/^\/api(\/.*)?$/, (req, res) => {
  void honoListener(req, res);
});
```

Things to notice (`apps/server/src/index.ts:10`):

- **Express is the outer shell.** It owns CORS (`apps/server/src/index.ts:12`) with `credentials: true` so the browser will send the Better Auth session cookie cross-origin (`apps/server/src/env.ts:37` supplies `env.webUrl`). It serves `/health` directly (`apps/server/src/index.ts:19`) - a cheap liveness check that does not touch the DB.
- **Hono is mounted as a sub-application, not as Express middleware.** `getRequestListener(honoApp.fetch)` (`apps/server/src/index.ts:23`) adapts Hono's web-standard `fetch` handler into a Node `(req, res)` listener via `@hono/node-server`. Every request whose path matches `^/api(/.*)?$` is forwarded to Hono (`apps/server/src/index.ts:24`). Why this split? Hono gives us a clean web-standard `Request`/`Response` model (which Better Auth's `handler(c.req.raw)` consumes directly) while Express remains the boring, battle-tested HTTP front door. The two never fight over the same path because Express only delegates `/api/*`.
- **Socket.IO rides the *same* Node HTTP server.** `createServer(server)` wraps the Express app into a raw `http.Server` (`apps/server/src/index.ts:28`), and `attachRealtime(httpServer)` (`apps/server/src/index.ts:30`) attaches Socket.IO to it. That is why REST and WebSocket share one port (`env.port`, default 4000) and one cookie: the socket handshake carries the same Better Auth cookie the REST calls do.
- **Listen + crash safety.** The server binds `env.port`/`env.host` (`apps/server/src/index.ts:37`) and logs readiness. A `once("error")` handler exits on bind failure, and process-level `unhandledRejection`/`uncaughtException` handlers (`apps/server/src/index.ts:44`) log and (for uncaught exceptions) hard-exit so a supervisor can restart cleanly.

### Environment (`env.ts`)

`env.ts` is the single typed gateway to `process.env`. It exposes three tiny parsers - `required` (throws if missing, `apps/server/src/env.ts:3`), `optional` (trims, defaults, `apps/server/src/env.ts:11`), and `number` (`apps/server/src/env.ts:15`) - and assembles one frozen `as const` object (`apps/server/src/env.ts:22`). Two of these required vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`) make the process refuse to start if absent, which is the desired fail-fast behavior.

Two username vars feed profile editing: `NOT_ALLOWED_USERNAMES` (a comma-separated blocklist parsed by `parseUsernameCsv` from `username-rules.ts` into `env.notAllowedUsernames`) and `USERNAME_CHANGE_COOLDOWN_DAYS` (default `30`, `0` disables the cooldown). Both are optional. The realtime layer adds its own optional vars: `REDIS_URL` (enables the Socket.IO Redis adapter and the Redis-backed presence store), `PUBLIC_REALTIME_URL`, and the presence-timer tunables `PRESENCE_HEARTBEAT_MS` (default `10000`), `PRESENCE_STALE_MS` (default `25000`), and `PRESENCE_LASTSEEN_PERSIST_MS` (default `60000`) - see [realtime.md](./realtime.md).

`googleConfigured()` (`apps/server/src/env.ts:58`) returns whether both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. This is the gate `auth.ts` uses to decide whether to register the Google social provider at all (`apps/server/src/auth.ts:15`) - Google OAuth is optional, so a dev `.env` without Google keys still boots with email/session auth.

Per the repo's CLAUDE.md, Turbo declares all env vars in `globalEnv`; adding a new var here without adding it to `turbo.json` means builds won't see it.

## The Hono app (`api/index.ts`)

```ts
const authApp = new Hono().all("*", (c) => getAuth().handler(c.req.raw));

export const app = new Hono<LoggerEnv>()
  .basePath("/api")
  .use("*", requestLogger)
  .route("/auth", authApp)
  .route("/account", accountRouter)
  .route("/games", gamesRouter)
  .route("/profiles", profilesRouter)
  .route("/friends", friendsRouter)
  .route("/conversations", conversationsRouter)
  .route("/messages", messagesRouter)
  .route("/notifications", notificationsRouter)
  .route("/gifs", gifsRouter);
```

Key points (`apps/server/src/api/index.ts:14`):

- **`basePath("/api")`** means every mounted route is implicitly prefixed, e.g. `conversationsRouter`'s `.get("/")` becomes `GET /api/conversations`. The Express regex forwards `/api/*` here, so the prefixes line up exactly.
- **Better Auth is a catch-all sub-app.** `authApp` (`apps/server/src/api/index.ts:14`) forwards *every* method+path under `/api/auth/*` straight into Better Auth's own handler via `getAuth().handler(c.req.raw)`. Better Auth implements its own routing internally (sign-in, OAuth callback, session, etc.), so the server just gives it the raw web `Request`. The session cookie it sets is what every other route later reads.
- **Router-per-feature.** Each domain is an isolated `Hono` instance imported and `.route()`-mounted. This keeps each file small and lets routers carry their own typed env (`gamesRouter` is `new Hono<LoggerEnv>()`, `apps/server/src/api/routes/games.ts:8`).
- **One global error boundary.** `app.onError` (`apps/server/src/api/index.ts:29`) catches any thrown error, logs it with the request-scoped logger if present (`c.get("log") ?? logger`), and returns a generic `500` - never leaking internals to the client.

### Request logging middleware (`middleware/logger.ts`)

`requestLogger` runs first for every `/api/*` request (`apps/server/src/api/index.ts:18`). It mints or reuses a request id (`x-request-id`), attaches a pino **child logger** carrying that id to the Hono context as `log`, echoes the id back in the response header, then times the handler:

```ts
export const requestLogger: MiddlewareHandler<LoggerEnv> = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? randomUUID();
  const log = logger.child({ requestId });
  c.set("requestId", requestId);
  c.set("log", log);
  c.header("x-request-id", requestId);

  const start = performance.now();
  try {
    await next();
  } finally {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const status = c.res.status;
    const fields = {
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs,
    };
    if (status >= 500) log.error(fields, "request failed");
    else if (status >= 400) log.warn(fields, "request error");
    else log.info(fields, "request");
  }
};
```

The `LoggerEnv` type (`apps/server/src/api/middleware/logger.ts:6`) is what makes `c.get("log")` type-safe in any router declared `new Hono<LoggerEnv>()`. The base `logger` (`apps/server/src/logger.ts:4`) redacts cookies, auth headers, and any `*.password`/`*.token`/`*.secret` field - so request logs can never spill the session cookie that every route depends on.

## Authentication on the REST surface (`middleware/auth.ts`)

Auth is a **Hono middleware**, `requireAuth` (`apps/server/src/api/middleware/auth.ts`). It calls `getAuth().api.getSession({ headers: c.req.raw.headers })`, returns `401` when there's no `user.id`, and otherwise stashes the identity on the context - `userId`, the `user`, and the `session` - typed via `AuthEnv` so handlers read `c.get("userId")` (a guaranteed `string`) without repeating the gate:

```ts
const userId = c.get("userId");
```

Routers whose every route needs a session apply it once at the top - `new Hono<AuthEnv>().use("*", requireAuth)` - covering `conversations`, `friends`, `messages`, `notifications`, and `gifs`. `profiles` is **mixed**: the authenticated `/me*` routes opt in per-route (`.put("/me/avatar", requireAuth, …)`) while the public ones (`GET /api/profiles/:username`, `apps/server/src/api/routes/profiles.ts`) stay open. `games` (`GET /api/games/:gameId`) is intentionally public and applies nothing.

Two surfaces deliberately keep their own `getSession` calls instead of `requireAuth`: Better Auth owns `/api/auth/*` end-to-end, and `account` (`apps/server/src/api/routes/account.ts`) is session-management itself - it reads the `session` token, calls `listSessions`/`revokeSession`, and signs out, so the session object is its domain payload, not just a gate.

`readJson(c)` (`apps/server/src/api/auth-context.ts`) is the body helper: it `try/catch`-parses the JSON body and returns `null` on failure or a non-object, so routes write `const body = await readJson(c)` and then defensively pull fields. `isUuid(value)` (`apps/server/src/lib/uuid.ts`) is the shared UUID guard used by the conversation routes; the **game** route and the realtime game lane instead validate the public room **code** with `isGameCode` (`@gamelobby/shared/types`).

## Row -> DTO serialization (`serialize.ts`)

`serialize.ts` is the **boundary where database rows become wire DTOs.** Every function here is pure (no I/O), which is why it's safe for both the REST routes and the chat assemblers to import.

```ts
export function serializeGame(row: GameRecord): GameJson {
  return {
    id: row.code,
    gameType: row.gameType,
    status: row.status,
    winner: row.winner,
    players: row.players,
    gameState: row.gameState ?? null,
    conversationId: row.conversationId,
    creatorUserId: row.creatorUserId,
    seatingMode: row.seatingMode,
    challengedUserId: row.challengedUserId,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
```

Two conventions worth internalizing:

- **`GameJson.id` is the public room `code`, not the UUID.** `serializeGame` sets `id: row.code` (`apps/server/src/api/serialize.ts:53`), so the internal `game.id` UUID is never serialized - clients only ever see the short shareable code (and `serializeMove(row, gameCode)` likewise sets `gameId: gameCode`, `serialize.ts:73`). The web builds `/play/<code>` from it and sends it back as the socket `gameId`.
- **`Date -> ISO string` happens exactly here**, via the `iso()` helper (`apps/server/src/api/serialize.ts:26`), which returns `null` for nullish dates. DTOs are JSON-safe by construction, so nothing downstream needs to know about `Date` objects.
- **The DTO types are imported from `@gamelobby/shared/types`** - `GameJson`/`MoveJson` and `ConversationJson`/`MessageJson`/etc. all live there now, while the DB **row** types (`GameRecord`, `MessageRow`, …) come from `@gamelobby/database` (`apps/server/src/api/serialize.ts:1`). This is the same insight that powers move validation: the wire shapes live in `packages/`, so the web client and the server agree on them by construction. The serializer's job is just to project a DB row onto that shared shape.

Notice the privacy-aware mappers: `serializeMessage` (`apps/server/src/api/serialize.ts:111`) nulls out `body`/`metadata` when `deletedAt` is set (a soft-deleted message keeps its row but reveals nothing); `serializeConversation` (`apps/server/src/api/serialize.ts:130`) computes a *per-viewer* display name for DMs by finding "the other member."

## The `routes -> services -> repositories` layering + `ServiceResult`

This is the spine of the chat/social side. The contract is the `ServiceResult<T>` discriminated union (`apps/server/src/chat/result.ts:3`):

```ts
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: ErrorStatus };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function fail(
  error: string,
  status: ErrorStatus = 400,
): { ok: false; error: string; status: ErrorStatus } {
  return { ok: false, error, status };
}
```

The division of labor:

- **Routes (`api/routes/*`) are thin adapters.** The `requireAuth` middleware has already authenticated; the handler reads `c.get("userId")`, pulls/validates the request shape into primitives, calls exactly one service function, and translates the `ServiceResult` into an HTTP response. The translation is mechanical and identical everywhere:

  ```ts
  const res = await conversationsService.createDm(userId, targetId);
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ conversation: res.value });
  ```

  (`apps/server/src/api/routes/conversations.ts:36`). Because `fail()` carries the HTTP status code, the route never has to *decide* whether a failure is a 403 or a 404 - the service already encoded the right status as a domain fact.

- **Services (`chat/*`) own the business rules** and any side effects (DB writes, socket emits, notifications). For example `createDm` (`apps/server/src/chat/conversations-service.ts:28`) enforces "you can only DM friends" (`fail("You can only message friends", 403)`), creates-or-gets the DM, and *fans the new conversation out over the socket* to both members before returning a DTO. The route knows none of this.

- **Repositories (imported as namespaces like `conversations`, `friends`, `games` from `@gamelobby/database`)** are the only code that touches Drizzle/SQL. Services call `conversations.getOrCreateDm(...)`, `friends.areFriends(...)`, etc. The repository layer is re-exported from `packages/database/src/index.ts` (`export * as games from "./repositories/games"` and friends, `packages/database/src/index.ts:27`).

Why a hand-rolled `Result` type instead of throwing? Three reasons. (1) **The HTTP status is part of the domain answer** - "not your request" is a 403, "already friends" is a 409 - and encoding it in the return value keeps that decision next to the rule that produced it. (2) **The same service is called from two transports**: `createGameInConversation` is invoked from the REST route (`apps/server/src/api/routes/conversations.ts:129`) *and* from a socket handler (`apps/server/src/realtime/games-in-chat.ts:15`); a thrown exception would have to be caught and re-mapped in two places, whereas a `ServiceResult` is just inspected with `if (!res.ok)`. (3) **Expected failures stay off the exception path**, so the global `onError` boundary is reserved for genuinely unexpected bugs.

### Assemblers: the read-side hydration layer (`assemble.ts`)

There's a fourth layer that sits *beside* services on the read path. Repository rows are skeletal (foreign keys, not embedded objects). The **assemblers** in `chat/assemble.ts` turn those skeletons into rich DTOs by resolving related data, then calling the pure `serialize*` functions.

For example `assembleConversation` (`apps/server/src/chat/assemble.ts:88`) fetches member rows, resolves each member's public user, finds the last message, computes the viewer's unread count, and only then calls `serializeConversation`. The batch variant `assembleMessages` (`apps/server/src/chat/assemble.ts:70`) avoids N+1 queries by collecting all distinct `senderId`s and fetching them in one `profiles.getPublicUsers(ids)` call.

The most subtle assembler is `withGameCardStatus` (`apps/server/src/chat/assemble.ts:29`): when a message is a `game_card`, it loads the referenced game (by the FK `row.gameId`, which is the internal UUID) and merges live `status`/`winner`/`players` into the card's metadata via `enrichGameCardMeta`. It also computes the game's **series score** - `computeSeriesScore` over `getSeriesGames(game.seriesId)` (or just `[game]` when there is somehow no series, falling back to `[game]` if that read throws), folding it in as `seriesScore` on the *latest* card and flagging older cards `seriesSuperseded` - so the card can render the scoreboard once a rematch exists (`apps/server/src/chat/assemble.ts:39`). It also rewrites the wire `gameId` to the game's public `code` (`apps/server/src/chat/assemble.ts:52`) so the client links to `/play/<code>`, even though the message's `game_id` FK column stays the UUID. This is why a game card in chat always shows the *current* game state (and series standing) even though the message row was written once at creation time - the live status is computed at read time, not stored on the message.

## Why the only game REST endpoints are reads

`gamesRouter` is tiny on purpose - two `GET`s, both read-only (`apps/server/src/api/routes/games.ts:8`):

```ts
export const gamesRouter = new Hono<LoggerEnv>()
  .get("/:gameId/series", async (c) => {
    const code = c.req.param("gameId");
    if (!isGameCode(code)) return c.json({ error: "Not found" }, 404);
    const found = await games.getGameByCode(code);
    if (!found?.seriesId) return c.json({ error: "Not found" }, 404);
    const seriesGames = await games.getSeriesGames(found.seriesId);
    const score = computeSeriesScore(seriesGames);
    return c.json(
      serializeSeries(found.seriesId, found.gameType, seriesGames, score),
    );
  })
  .get("/:gameId", async (c) => {
    const code = c.req.param("gameId");
    if (!isGameCode(code)) return c.json({ error: "Not found" }, 404);
    const found = await games.getGameByCode(code);
    if (!found) return c.json({ error: "Not found" }, 404);
    const moves = await games.listMoves(found.id);
    return c.json({
      game: serializeGame(found),
      moves: moves.map((m) => serializeMove(m, found.code)),
    });
  });
```

There is **no** `POST /api/games`, no `PATCH`, no move endpoint, and even rematch is *not* REST. The reason is the core architectural insight stated at the top: **games are created, played, and rematched over the socket lane, not over HTTP.**

### The series read: `GET /api/games/:gameId/series`

The one game read the web added for the rematch feature resolves the `:gameId` **code**, follows its `seriesId`, and returns a `SeriesDetail`. The route guards with `isGameCode`, loads the game with `getGameByCode`, and `404`s when the game has no `seriesId` (`apps/server/src/api/routes/games.ts:13`). It then fetches every game in the series with `games.getSeriesGames(found.seriesId)` (ordered by `createdAt`), computes the running score with the **pure** `computeSeriesScore` helper (`apps/server/src/chat/series.ts:4` - each `completed` game adds to the winner's `wins`, or to `draws` when `winner === "draw"`; in-progress games are listed but not counted), and projects it with `serializeSeries` (`apps/server/src/api/serialize.ts:30`), which assigns each game a 1-based `gameNumber`, maps `id → code`, and resolves `winnerUsername` from the seats. The web's game-over modal and the "View series" modal both fetch this endpoint; the chat game card instead reads a `seriesScore` already merged into its metadata at assembly time (so the card and the modal agree). The endpoint lives under `/api/*`, so it adds no top-level web route and needs no `RESERVED_USERNAMES` entry.

- **Creation** goes through `createGameInConversation` (`apps/server/src/chat/games-in-chat-service.ts:66`). That service is reachable two ways - `POST /api/conversations/:id/games` (`apps/server/src/api/routes/conversations.ts:130`) for the "create a game in this chat" REST action, and the `CHAT_EVENTS.createGameInConversation` socket event (`apps/server/src/realtime/games-in-chat.ts:15`). Both transports first narrow the client-supplied `gameType` to a registered game: the REST route does `gameTypeSchema.safeParse(body?.gameType)` (`apps/server/src/api/routes/conversations.ts:135`, the registry-backed `z.enum` exported from `@gamelobby/shared/types`) and returns `400 Unsupported game type` on a miss, so the service's `gameType` parameter is a typed `GameType`, not a free-form string. The service then enforces the **one-live-game-per-`(conversation, gameType)`** rule - `findLiveGameInConversation` short-circuits to an existing `waiting | active` game rather than creating a duplicate - before validating the config with the game's own Zod schema, seeding the initial state from the engine, persisting, and posting a game-card message. Its result is `{ game; message? }` (no new `message` on a short-circuit). It is *not* a generic game-resource POST; it's a chat action that happens to spawn (or resume) a game.
- **Rematch** also goes over the socket, not REST: `CHAT_EVENTS.rematch` → `rematchGame` (`apps/server/src/chat/games-in-chat-service.ts:150`) re-spawns a finished game into the same series (shared `seriesId`) with both players pre-seated in loser-first order, applies the same one-live guard, and emits `rematchCreated` to the old game's room. See [realtime.md](./realtime.md).
- **Playing** (making moves) happens exclusively over the socket `make_move` event (`apps/server/src/realtime/index.ts:98`), routed through a driver that re-validates the move and stored state against the game's Zod schemas before applying `reduce`. A move is inherently a low-latency, broadcast-to-the-room operation; modeling it as an idempotent HTTP resource would be the wrong shape and would also bypass the realtime fan-out every other player needs.
- **Reading** is the one thing that genuinely benefits from a plain request/response: the web app's `/play/[gameId]` page does an SSR/RSC fetch of the current game + move history to render the board before the socket connects. That's exactly what this endpoint serves. The `:gameId` path param is the game's public room **code**, so the route guards with `isGameCode` (cheap rejection of garbage) and resolves via `getGameByCode`, returning `404` for unknown codes so it never leaks whether an id format is valid-but-missing vs. malformed.

In short: HTTP is for fetching durable, cacheable read state; the socket is for the live, authoritative, broadcast lifecycle. The same engine and schemas back both lanes, so neither lane trusts the client.

### Creating a game over chat: a representative service

`createGameInConversation` is worth reading in full because it demonstrates the whole layering and the "server is authoritative" principle in one function:

```ts
if (!hasEngine(input.gameType)) return fail("Unsupported game type", 400);

const existingLive = await games.findLiveGameInConversation(
  input.conversationId,
  input.gameType,
);
if (existingLive) {
  return ok({ game: serializeGame(existingLive) });
}

const definition = getDefinition(input.gameType);
const parsedConfig = definition.configSchema.safeParse(input.config ?? {});
if (!parsedConfig.success) return fail("Invalid game config", 400);
```

(`apps/server/src/chat/games-in-chat-service.ts:79`). Its `input.gameType` is already a typed `GameType` (the caller narrowed it via `gameTypeSchema`), so `hasEngine(input.gameType)` looks the game up in the shared games-core registry; if a live game of that type already exists in the conversation it returns *that* one (the one-live guard) instead of creating a duplicate, otherwise it validates the client-supplied config against that game's **`configSchema`** (the same schema the web lobby form is built from), after first enforcing conversation membership (`apps/server/src/chat/games-in-chat-service.ts:76`) and, for group chats, seating rules (`apps/server/src/chat/games-in-chat-service.ts:101`). It then seeds initial state via `engine.createInitialState` (`apps/server/src/chat/games-in-chat-service.ts:130`), persists through the `games` repository, posts a `game_card` message via `announceGame`/`sendMessage`, and fans out `game_started`/`game_challenge` notifications to the other members via `notify`. On success it returns `ok({ game: serializeGame(created), message: announced.value })` - already serialized for either transport (`message` is omitted when it short-circuited to an existing live game).

## Other notable services

- **`messages-service.ts`** - `sendMessage` (`apps/server/src/chat/messages-service.ts:14`) gates on membership, rejects empty text, inserts, touches the conversation's `lastMessage`, then broadcasts `CHAT_EVENTS.messageNew` to the conversation room via `emitToConv`. `deleteMessage` (`apps/server/src/chat/messages-service.ts:74`) enforces "only your own messages" (403), soft-deletes, and broadcasts `messageDeleted`. Every write here is "persist then broadcast over the socket."
- **`friends-service.ts`** - `sendFriendRequest` (`apps/server/src/chat/friends-service.ts:10`) is a small state machine: it auto-accepts if the other party already sent you a pending request, reopens a previously-declined edge, or creates a fresh request, and in each case emits the right realtime event and writes a persistent `notify(...)` record. This is why the friends *route* is so thin - all the branching lives in the service.
- **`conversations-service.ts`** - every mutation calls `fanoutConversation` (`apps/server/src/chat/conversations-service.ts:10`), which both joins each member's per-user room into the conversation room (`io.in(userRoom(uid)).socketsJoin(convRoom(...))`) and emits a freshly-assembled, *per-viewer* conversation DTO to each member. Membership changes and room membership are kept in lockstep.

### How services reach the socket without an `io` parameter

Services emit realtime events, but they're plain async functions with no `io` argument. They get the live server via the module-level singleton `getIO()` (`apps/server/src/realtime/io.ts:9`), which `attachRealtime` populated with `setIO(io)` at startup (`apps/server/src/realtime/index.ts:32`). Services guard with `const io = getIO(); if (io) { ... }` so they remain callable in unit tests where no socket server exists. Room targeting goes through the helpers in `apps/server/src/realtime/rooms.ts` - `emitToConv`, `emitToUser`, `emitToGame` - which encode the room-naming convention (`conv:<id>`, `user:<id>`, `game:<id>`).

## The GIF proxy (`gifs.ts` + `services/gif-provider.ts`)

The GIF routes are a thin, auth-gated proxy to Klipy. `gifsRouter` (`apps/server/src/api/routes/gifs.ts:15`) clamps `limit` to `[1,50]` (`clampLimit`, `apps/server/src/api/routes/gifs.ts:5`) and floors `offset` at 0, requires a logged-in user, and wraps the provider call in `try/catch` to return a `502 GIF service unavailable` instead of a 500 when Klipy is down. `gif-provider.ts` is the actual HTTP client: `fetchKlipy` (`apps/server/src/services/gif-provider.ts:40`) builds the URL with the API key, uses `AbortSignal.timeout(8000)` so a slow upstream can't hang the request, and `normalize` (`apps/server/src/services/gif-provider.ts:24`) maps Klipy's nested size variants down to the shared `GifJson` shape (preview + full url, dimensions). This is the same pattern as the chat side - a route that translates HTTP details into a service call - but the "service" here is an external API rather than a repository.

## The profile-config validators (from `@gamelobby/shared`)

`profilesRouter` validates user-chosen appearance values against small allow-lists rather than free-form strings. These catalogs + guards used to live in `apps/server/src/lib/`; they now live in `@gamelobby/shared` and are imported by the route from `@gamelobby/shared/types` + `@gamelobby/shared/constants` (`apps/server/src/api/routes/profiles.ts:3`):

- **theme** - the `THEME_IDS` tuple (`packages/shared/src/constants/theme.ts:3`) + `COLOR_MODES` + `isValidTheme`/`isValidColorMode` guards (`z.enum(...).safeParse`, `packages/shared/src/types/theme.ts:10`).
- **pattern** - `PATTERN_IDS` (`packages/shared/src/constants/pattern.ts:3`) + `isValidPattern` (`packages/shared/src/types/pattern.ts:7`).
- **chat layout** - `validateChatModePref` (`packages/shared/src/types/chat-layout.ts:16`) coerces arbitrary input to `{ mode: "popout" | "mounted" }`.

`PUT /api/profiles/me/appearance` (`apps/server/src/api/routes/profiles.ts:92`) applies these guards field-by-field, building a partial `patch` and rejecting unknown values with `400 Invalid theme` / `Invalid colorMode` / `Invalid pattern`, and a `400 Nothing to update` if the body changes nothing. The avatar route validates with `validateAvatarConfig` from `@gamelobby/avatar` (`apps/server/src/api/routes/profiles.ts:145`). These are exported pure functions specifically so they're unit-testable without HTTP, matching the repo's test conventions.

### Name & username changes

Identity edits share the same pure-helper discipline. The format/normalize/reserved rules now live in `@gamelobby/shared`: `normalizeUsername` (trim + lowercase), `isValidUsernameFormat`, and `isReservedUsername` in `@gamelobby/shared/types` (`packages/shared/src/types/username.ts:11`), backed by `USERNAME_PATTERN` (`/^[a-z0-9_]{3,30}$/`) and `RESERVED_USERNAMES` in `@gamelobby/shared/constants` (`packages/shared/src/constants/username.ts:3`). `apps/server/src/username-rules.ts` keeps the *server-only* pure helpers (no env/DB imports, so they unit-test without mocking): `parseUsernameCsv`, `slugifyBase`, `buildUsernameCandidates`, `selectSuggestions`, and `usernameEditableAt` (cooldown math). `username.ts` wires both to env + DB as `isUsernameBlocked` (reserved ∪ `NOT_ALLOWED_USERNAMES`) and `suggestUsernames` (batch-checks `getTakenUsernames`, returns valid free variants); the same helpers power first-sign-in provisioning so an auto-assigned name is never reserved or blocked.

- `PUT /api/profiles/me/name` - trims and bounds the display name to 1–50 chars, then `setDisplayName`.
- `GET /api/profiles/me/username-available?u=` - returns `{ available }`, or `{ available: false, reason: "format" | "reserved" | "taken", suggestions }` (up to 5). The caller's current username always reads as available.
- `PUT /api/profiles/me/username` - validates format (`400`) → reserved/blocked (`400`) → cooldown (`429` with `nextChangeAt`) → uniqueness (`409`), then `updateUsername` (which stamps `username_changed_at`). Changing to your current name is a no-op `200`. `GET /api/profiles/me` exposes the precomputed `usernameEditableAt` (so the client can lock the field before a save attempt) and `usernameChangeCooldownDays` (so the client's confirm dialog can state the window).

## End-to-end data-flow walkthrough: sending a chat message via REST

A concrete trace from HTTP request to broadcast, showing every layer:

1. Browser `POST /api/conversations/<uuid>/messages` with `{ body: "hi" }` and the session cookie.
2. Express CORS + the `/api/*` regex forward it to Hono - `apps/server/src/index.ts:24`.
3. `requestLogger` mints a request id and attaches the child logger - `apps/server/src/api/middleware/logger.ts:13`.
4. `conversationsRouter`'s `requireAuth` middleware reads the Better Auth session from the cookie and stashes `userId` on the context - `apps/server/src/api/middleware/auth.ts`. (`401` if absent.)
5. Hono matches the `POST /:id/messages` handler, which reads `c.get("userId")` - `apps/server/src/api/routes/conversations.ts`.
6. Handler validates the path id is a UUID (`isUuid`) and parses the body with `readJson` - `apps/server/src/api/routes/conversations.ts`.
7. Handler calls the service: `messagesService.sendMessage({ conversationId, senderId, kind, body, ... })` - `apps/server/src/chat/messages-service.ts:14`.
8. Service enforces the rule (`conversations.isMember` -> `403` if not a member), rejects empty text, then inserts via the `messages` repository and `conversations.touchLastMessage` - `apps/server/src/chat/messages-service.ts:23`.
9. Service hydrates the row into a DTO via `assembleMessage` (resolves sender, applies game-card status) - `apps/server/src/chat/assemble.ts:63`.
10. Service broadcasts over the socket: `emitToConv(io, conversationId, CHAT_EVENTS.messageNew, { message, clientId })` reaches every other connected member in the `conv:<id>` room - `apps/server/src/chat/messages-service.ts:49`.
11. Service returns `ok(message)` - `apps/server/src/chat/messages-service.ts:54`.
12. Handler maps the `ServiceResult`: `return c.json({ message: res.value }, 201)` - `apps/server/src/api/routes/conversations.ts:117`.
13. `requestLogger`'s `finally` logs `{ method, path, status: 201, durationMs }` at `info` - `apps/server/src/api/middleware/logger.ts:23`.

The sender gets the message back in the HTTP `201` response; every *other* member gets it pushed over their socket in step 10. The `clientId` echo lets the sender's own client de-duplicate its optimistic copy against the broadcast.

## Gotchas, invariants & conventions

- **`/api` prefix lives in two places that must agree.** Express forwards `^/api(/.*)?$` (`apps/server/src/index.ts:24`) and Hono declares `basePath("/api")` (`apps/server/src/api/index.ts:17`). Route files use *un-prefixed* paths (`.get("/")`, `.get("/:id")`) - the prefix is added by the basePath, not by the router.
- **Auth is `requireAuth` middleware, applied per router.** Fully-authed routers call `.use("*", requireAuth)` once at the top (so any route added to them is guarded by default); `profiles` opts in per-route on `/me*` and leaves its public routes open; `games` is public. A *new* router is only protected if it applies the middleware - declaring `Hono<AuthEnv>` types `c.get("userId")` as `string`, but the runtime guarantee comes from the `.use`/per-route `requireAuth`, so the two must go together.
- **Better Auth owns `/api/auth/*` entirely.** Don't add routes under that prefix - `authApp` (`apps/server/src/api/index.ts`) swallows all methods/paths there. To read the session elsewhere, go through `requireAuth` (or `getSession` directly, as `account` does for session management), never re-implement cookie parsing.
- **`fail()`'s status is the HTTP status.** The route does `c.json({ error: res.error }, res.status)` verbatim, so a service returning the wrong `ErrorStatus` produces the wrong HTTP code. Statuses are constrained to the `ErrorStatus` union (`apps/server/src/chat/result.ts:1`) - you can't return a 418.
- **`serialize*` must stay pure (no I/O).** They're imported by both routes and assemblers; adding a DB call inside one would create hidden N+1s and break the read-side batching the assemblers rely on.
- **All dates cross the wire as ISO strings via `iso()`.** Never put a raw `Date` in a DTO; `iso()` (`apps/server/src/api/serialize.ts:26`) returns `null` for nullish inputs.
- **`getIO()` can return `null`.** Services guard `if (io)` before emitting (`apps/server/src/chat/messages-service.ts:48`). This is deliberate so service functions are unit-testable without a running socket server; don't assume `io` is non-null.
- **Games have no write REST endpoint.** Do not add `POST /api/games` or a move endpoint. Creation routes through `createGameInConversation` (REST `POST /api/conversations/:id/games` *or* the socket event); moves go through the socket `make_move` lane only.
- **The same service is multi-transport.** `createGameInConversation` is called from both REST and socket; keep its contract a `ServiceResult` (not thrown errors) so both callers can handle failures uniformly.
- **Manual id gating.** Routes reject malformed ids with `404` *before* hitting the DB: conversation routes call the shared `isUuid` guard (`apps/server/src/lib/uuid.ts`) - the many `if (!isUuid(id))` checks in `conversations.ts` - while the game route guards the public room **code** with `isGameCode` (`apps/server/src/api/routes/games.ts:11`). New id-taking routes should follow suit with the matching guard.
- **Logs redact secrets.** The pino config (`apps/server/src/logger.ts:8`) redacts cookies/auth headers/`*.token`/`*.secret`. Don't log raw request headers expecting to see the session - it's `[redacted]`.
- **`game_card` status is computed at read time.** It's merged in by `withGameCardStatus`/`enrichGameCardMeta` during assembly, not stored on the message row. When a game ends, push the updated card with `broadcastGameCard` (`apps/server/src/chat/game-card-broadcast.ts:7`).
- **GIF and profile-config validation are intentionally allow-list based.** Reject unknown themes/patterns/layouts with `400`; clamp GIF limits; never pass user strings straight to the provider or DB.

## Where to go next

- [Architecture overview / index](./README.md) - start here for the whole-system map.
- [Authentication (Better Auth, sessions, OAuth)](./auth.md) - what `getAuth()`/`getSession` actually do and how the socket handshake reuses the cookie.
- [Realtime (Socket.IO lanes, drivers, rooms)](./realtime.md) - the other half of this process: the chat lane and the game `join_room`/`make_move` driver lane.
- [Database (repositories + data access)](./database.md) - the repository layer these services call over the generic `game`/`move`/`game_player` tables.
- [chat-core (DTOs + socket contract)](./chat-core.md) - the shared `MessageJson`/`ConversationJson`/`CHAT_EVENTS` shapes the serializers and services target.
- [games-core schemas](./games-core-schemas.md) - the `GameJson`/`MoveJson` + `configSchema` that `serialize.ts` and `createGameInConversation` rely on.
- [games-core engine](./games-core-engine.md) - `GameEngine`, `createInitialState`, and `reduce`, the authoritative logic shared with the client.
- [Web app](./web.md) - how the Next.js frontend consumes this REST surface (`serverFetch*`/`clientFetch*`) and the socket lane.
- [Testing](./testing.md) - the DB-backed `integration/` suite exercises these routes/services and the shared `createGameInConversation` flow end to end.
