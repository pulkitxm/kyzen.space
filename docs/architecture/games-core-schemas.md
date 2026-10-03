# games-core: Zod Schemas, GameDefinition & Wire DTOs

## What this is / why it matters

`@kyzen/games-core` is the **contract layer** of the whole multiplayer system. It is a framework-agnostic TypeScript package - it contains **no React** and no `zod` (all types, schemas, and constants live in `@kyzen/shared`; `games-core` only imports from there). That constraint is deliberate and is the single most important fact about this package: because it has no UI dependencies, the **server can import it too**.

That gives the system one shared source of truth that both ends of the wire consult:

- The **server** (`apps/server`, Bun + Socket.IO) imports games-core to *authoritatively* validate every move and every stored game state before it touches the database.
- The **web client** (`apps/web`, Next.js) imports the *exact same* package - to render the lobby (`listGameMeta()`, `getDefinition()`), to type the data it receives over the socket (`GameJson`, `MoveJson`, the `Server*Payload` types), and to drive its own UI.

The payoff: **the client is never trusted**. The browser may *use* the engine to render an optimistic board or grey out illegal cells, but the server re-runs the identical `reduce` against the identical Zod-validated state and rejects anything that doesn't pass. There is no second, drifting copy of "what a legal Tic-tac-toe move is" living on the backend - there is one `ticTacToeMoveSchema`, and both sides import it.

This doc covers the **schema/contract half** of games-core: the `GameDefinition` shape (defined in `@kyzen/shared`), the `GameEngine` interface it references, the shared wire/socket Zod schemas, the category definitions, the public surface in `index.ts`, and a concrete per-game schema set (Tic-tac-toe) showing the `.strict()` discipline. The engine *behavior* itself is covered in [./games-core-engine.md](./games-core-engine.md).

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/constants/games.ts` | **Single source of truth for game slugs.** Declares each slug constant (e.g. `TIC_TAC_TOE`), the `GAME_TYPES` tuple. Exported via `@kyzen/shared/constants`. |
| `packages/shared/src/types/games/core.ts` | `GameType` union and `gameTypeSchema` (`z.enum(GAME_TYPES)`). All wire schemas that carry a `gameType` field validate against `gameTypeSchema`. Exported via `@kyzen/shared/types`. |
| `packages/shared/src/types/games/definition.ts` | `GameDefinition<S,I,C>`, `GameMeta` (`type: GameType`, not `string`), `ConfigField`, and `PublicQueue` - the self-describing manifest one game ships, including its public queue variants and board layout. Exported via `@kyzen/shared/types`. |
| `packages/shared/src/types/games/engine.ts` | `GameEngine<State,Input>`, `Outcome`, `ReduceResult`, `StepResult`, `Seat`, `SetupOptions`, `MoveContext`, `LobbySupport`, `BotDifficulty` - the behavioral contract a `GameDefinition` references. Exported via `@kyzen/shared/types`. |
| `packages/shared/src/types/games/lobby.ts` | The shared lobby config: `lobbyConfigSchema` (`{ mode: "ffa" \| "teams", teams: Record<userId, TeamId>, bots: LobbyBot[] }`, at most `LOBBY_MAX_BOTS` = 64 bots), `teamIdSchema` (one capital letter), `lobbyBotSchema` (`{ id: "bot:<n>", difficulty, team }`), and the `isBotId` / `botId` helpers. Lobby engines use it as their `configSchema`. Exported via `@kyzen/shared/types`. |
| `packages/shared/src/types/games/code.ts` | The **public game room code**: `GAME_CODE_ALPHABET`/`GAME_CODE_LENGTH`, `generateGameCode`, `normalizeGameCode`, `isGameCode`, and `gameCodeSchema` (normalizes then validates a 6-char Crockford-base32 code). The code is the public game id; the UUID `game.id` stays internal. Exported via `@kyzen/shared/types`. |
| `packages/shared/src/types/games/wire.ts` | Shared **wire/socket** Zod schemas: `gameStatusSchema`, `gamePlayerSchema`, `clientJoinRoomSchema`, `clientMakeMoveSchema`, the matchmaking-lane `clientQueueJoinSchema`/`clientQueueLeaveSchema`, the room-lane `clientCreateRoomSchema`/`clientJoinByCodeSchema`/`clientRoomConfigureSchema`/`clientRoomStartSchema`/`clientRoomLeaveSchema` (`{ gameId }`)/`clientRoomKickSchema` (`{ gameId, userId }`), `gameJsonSchema`/`GameJson`, `moveJsonSchema`/`MoveJson`, the server→client `Server*Payload` types (`ServerGameStatePayload`, `ServerGameOverPayload`, `ServerErrorPayload`, `ServerMatchFoundPayload`), and the pure helpers `isGameOver`/`isGameLive`/`resolveWinnerUsername`/`gameResultLabel`. The inbound envelopes validate `gameId` with `gameCodeSchema` (from `code.ts`). Exported via `@kyzen/shared/types`. |
| `packages/shared/src/types/games/categories.ts` | `GameCategoryDef` default interface and the `GameCategoryId` union (`GAME_CATEGORIES` ids). Both re-exported via the `types/games` barrel (`index.ts:1-4`). |
| `packages/shared/src/types/games/series.ts` | **Best-of-N "series" wire DTOs** (the rematch flow): `seriesScoreEntrySchema`/`seriesScoreSchema`, `seriesGameSummarySchema`, and `seriesDetailSchema` (+ inferred `SeriesScore`/`SeriesDetail`/…). What `GET /api/games/:gameId/series` returns. Exported via `@kyzen/shared/types`. |
| `packages/shared/src/constants/categories.ts` | The static `GAME_CATEGORIES` list used to group games in the lobby. Exported via `@kyzen/shared/constants`. |
| `packages/shared/src/types/games/tic-tac-toe/schemas.ts` | Per-game `stateSchema` / `moveSchema` / `configSchema`, each `.strict()`, with TS types derived via `z.infer`. The slug constant lives in `constants/games.ts`, not here. Exported via `@kyzen/shared/types`. |
| `packages/shared/src/types/games/tank-arena/schemas.ts` | Tank Arena's bounded state, move, and config schemas. Its config is `lobbyConfigSchema`. See [Tank Arena](../games/tank-arena.md). |
| `packages/games-core/src/registry.ts` | Derives `getDefinition`/`getEngine`/`hasEngine`/`listGameMeta`/`getCategoryGroups`/`listGameTypes`/`listDefinitions` from the single `GAMES` array. `hasEngine(type: string): type is GameType` is a type guard; `listGameTypes(): GameType[]` returns the narrowed list; `listDefinitions(): GameDefinition[]` returns the array itself. |
| `packages/games-core/src/games/index.ts` | The single `GAMES` array - the registry's source. |
| `packages/games-core/src/index.ts` | Public package surface: engines, definitions, and registry helpers. |
| `packages/games-core/tests/conformance.test.ts` | Generic suite that runs against every entry in `GAMES`, asserting each definition's schemas and engine agree. Includes a `"GAME_TYPES matches the registry exactly"` test so `GAME_TYPES` and the `GAMES` array can never drift. |

## The `GameDefinition`: one object that fully describes a game

A game is **not** spread across routes, tables, and socket events. It is a single object satisfying `GameDefinition<S, I, C>`, defined at `packages/shared/src/types/games/definition.ts`:

```ts
export interface GameDefinition<S = unknown, I = unknown, C = unknown> {
  meta: GameMeta;
  engine: GameEngine<S, I>;
  stateSchema: ZodType<S>;
  moveSchema: ZodType<I>;
  configSchema: ZodType<C>;
  configFields?: ConfigField[];
  queues?: PublicQueue[];
  layout?: "standard" | "wide";
}

export interface PublicQueue {
  id: string;
  label: string;
  description: string;
  config: unknown;
}
```

The three type parameters are, in order, **S**tate, **I**nput (a move), and **C**onfig. Notice the tight coupling enforced by the type system: `engine` is a `GameEngine<S, I>` and `stateSchema` is a `ZodType<S>` over the *same* `S`. You cannot ship a definition whose state schema validates a different shape than the engine produces - TypeScript rejects it at the definition site. The Tic-tac-toe binding makes this concrete (`packages/games-core/src/games/tic-tac-toe/index.ts:13`):

```ts
export const ticTacToeDefinition: GameDefinition<
  TicTacToeState,
  TicTacToeMove,
  TicTacToeConfig
> = {
  meta: ticTacToeMeta,
  engine: ticTacToeEngine,
  stateSchema: ticTacToeStateSchema,
  moveSchema: ticTacToeMoveSchema,
  configSchema: ticTacToeConfigSchema,
  configFields: [],
};
```

`GameMeta` (`packages/shared/src/types/games/definition.ts`) is the display/catalog metadata - `type` (a `GameType` slug, e.g. `"tic-tac-toe"`), `name`, `description`, `categoryId` (joins to `GAME_CATEGORIES`), and an optional `coverImage`. `ConfigField` describes one form control the lobby renders so a creator can configure a game before launch:

```ts
export type ConfigFieldType = "select" | "number" | "toggle";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  default: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}
```

`configFields` is the *presentation* of config; `configSchema` is the *validation* of config. They are kept separate on purpose - the lobby form is built from `configFields`, but the resulting object is only ever trusted after it passes `configSchema`. Tic-tac-toe has no options, so `configFields` is `[]` and `configSchema` is the empty strict object `z.object({}).strict()`.

`queues` lists the find-page variants of public matchmaking. Each variant sends its own `config` and is its own pool; the group size is `engine.playerCount?.(config) ?? 2`. Tank Arena ships `duel` (`{ mode: "ffa" }`, two players) and `teams` (`{ mode: "teams" }`, four players in teams `A` and `B`). A definition without `queues` has one default pool. `layout` picks the play page frame: `"standard"` (the default) keeps the board beside the side panels, and `"wide"` gives the board the full width, which Tank Arena uses.

## The `GameEngine` contract referenced by every definition

`packages/shared/src/types/games/engine.ts` defines the behavioral half. The key types:

```ts
export type BotDifficulty = "easy" | "normal" | "hard";

export type Outcome =
  | { status: "active" }
  | { status: "completed"; winnerRoles: string[]; draw: boolean };

export type Seat = { role: string; team: string; bot: BotDifficulty | null };

export type SetupOptions = { config: unknown; seed: number };

export type ReduceResult<State> =
  | { ok: true; state: State; outcome: Outcome }
  | { ok: false; error: string };

export type StepResult<State> = { state: State; outcome: Outcome };

export type MoveContext = { role: string };

export type LobbySupport = { teams: boolean; bots: boolean };
```

`Outcome` is a discriminated union: a move either leaves the game `"active"` or marks it `"completed"` with `winnerRoles` (*role* strings like `"X"` or `"p3"`, **not** user ids) and a `draw` flag. A solo win lists one role, a team win lists every role on the team, and a draw lists the drawing roles (or none). The server maps roles to user ids: `game.winners` holds every winning seat, and `game.winner` is the single winner's id, `"draw"`, or `null` for a shared win. A `Seat` carries its `team` (its own role outside team play) and a `bot` difficulty for lobby bots, and `SetupOptions` hands `createInitialState` the validated config plus a server-generated `seed`, so engines stay deterministic while hidden randomness comes from the server. `ReduceResult` is similarly a tagged union - `reduce` returns `{ ok: false, error }` for an illegal move instead of throwing, so the server can relay that string straight back to the client. This `ok`-tagging is the spine of the trust model: the server branches on `result.ok` and only persists when it is `true`.

The `GameEngine` interface (`packages/shared/src/types/games/engine.ts`):

```ts
export interface GameEngine<State, Input> {
  readonly type: string;
  readonly mode: "turn-based" | "simultaneous" | "realtime";
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly lobby?: LobbySupport;

  roleForSeat(index: number): string;
  createInitialState(seats: Seat[], options: SetupOptions): State;
  reduce?(state: State, ctx: MoveContext, input: Input): ReduceResult<State>;
  autoMove?(state: State, role: string, strikes: number): Input;
  currentRole?(state: State): string | null;
  roundOf?(state: State): number;
  pendingRoles?(state: State): string[];
  roundTimeMs?(state: State): number;
  botMove?(state: State, role: string, difficulty: BotDifficulty): Input;
  publicState?(state: State): unknown;
  publicMove?(state: State, move: Input): unknown;
  playerCount?(config: unknown): number;
  step?(state: State, inputs: Map<string, Input>, dt: number): StepResult<State>;
  readonly tickRate?: number;
}
```

`mode` selects the handler: turn-based and simultaneous games implement `reduce`, realtime games implement `step` (the platform has no realtime runner yet). The conformance suite enforces that the right one exists for the declared `mode`. `roleForSeat(index)` names seat *n*'s role; it must be distinct and stable for every index, and `maxPlayers` may be `Infinity`. The optional hooks:

- **Clocks:** turn-based engines expose `currentRole`; simultaneous engines expose `roundOf`, `pendingRoles` (living roles that still owe a move this round), and `roundTimeMs` (the round allowance). On a timeout the runner submits `autoMove(state, role, strikes)`.
- **Bots:** `botMove(state, role, difficulty)` returns a legal, deterministic move for a bot seat. Lobby engines that allow bots must provide it.
- **Hidden information:** `publicState` and `publicMove` redact state and moves for every broadcast, HTTP snapshot, and move history. Simultaneous engines hide locked plans until the round resolves.
- **Lobby and queues:** `lobby` declares whether a private lobby may use teams and bots; `playerCount(config)` sizes a public match for a queue config.

`MoveContext` carries only `{ role }`. The engine deliberately knows nothing about user ids, sessions, or sockets - the server resolves the authenticated user to a seat *role* before calling `reduce`, keeping the engine pure and trivially unit-testable.

## Shared wire & socket schemas (`wire.ts`)

This file is where the package earns the word "contract." It defines the Zod schemas for everything that crosses the network boundary, and derives the TypeScript types from them with `z.infer` so the types can never drift from the validators.

### Inbound (client → server) socket payloads

These are validated the instant a payload arrives, *before* any game logic runs. From `packages/shared/src/types/games/wire.ts`:

```ts
export const clientJoinRoomSchema = z
  .object({
    gameId: gameCodeSchema,
    intent: z.enum(["play", "spectate"]).optional(),
  })
  .strict();
export type ClientJoinRoom = z.infer<typeof clientJoinRoomSchema>;

export const clientMakeMoveSchema = z
  .object({
    gameId: gameCodeSchema,
    moveData: z.unknown(),
  })
  .strict();
export type ClientMakeMove = z.infer<typeof clientMakeMoveSchema>;
```

`clientJoinRoomSchema` validates two inbound events: `join_room` and `leave_room`. The latter only needs `{ gameId }` (it leaves the socket room and runs no game logic), so it reuses the same `.strict()` envelope rather than declaring its own (`apps/server/src/realtime/index.ts:78`).

Two things to internalize:

1. **`moveData` is `z.unknown()` here, on purpose.** The *envelope* schema (`clientMakeMoveSchema`) only knows there's a `gameId` and some opaque payload. It cannot validate the move's shape, because the generic socket handler doesn't know which game it is yet. The actual move validation is a **second pass**, done by the *per-game* `moveSchema` (below), after the server has looked up the `gameType`. This two-stage validation - generic envelope first, game-specific payload second - is the central design pattern of the realtime lane.
2. **`gameCodeSchema`** (`packages/shared/src/types/games/code.ts:24`) is the **public game room code** schema: it `transform`s the id through `normalizeGameCode` (uppercases, maps I/L→1 and O→0) then `refine`s it against `^[0-9A-HJKMNP-TV-Z]{6}$`. The same check is duplicated defensively on the server in `code.ts`'s `isGameCode`, which the turn-based handler calls as a belt-and-braces guard (`isGameCode(payload.gameId)`, `apps/server/src/realtime/turn-based.ts:135`) before resolving the game by code with `games.getGameByCode(...)`. (The internal UUID `game.id` is never serialized or accepted over the wire.)

The **matchmaking lane** adds two more inbound envelopes, validated the same way before any queue logic runs:

```ts
export const clientQueueJoinSchema = z
  .object({
    gameType: gameTypeSchema,
    config: z.unknown().optional(),
  })
  .strict();
export type ClientQueueJoin = z.infer<typeof clientQueueJoinSchema>;

export const clientQueueLeaveSchema = z
  .object({
    gameType: gameTypeSchema,
  })
  .strict();
export type ClientQueueLeave = z.infer<typeof clientQueueLeaveSchema>;
```

`clientQueueJoinSchema` backs the `game:queue_join` event and `clientQueueLeaveSchema` the `game:queue_leave` event (`apps/server/src/realtime/matchmaking.ts:122`, `:138`). Both carry only a `gameType` (validated by `gameTypeSchema`, so an unknown slug is rejected at the boundary); `config` on join is again `z.unknown()` because the matched game's engine validates it against its `configSchema` when the game is actually created. No `userId` is ever read off these payloads - the server uses `socket.data.userId`.

### Outbound (server → client) wire DTOs

`gameJsonSchema` and `moveJsonSchema` describe what a serialized game / move looks like on the wire (`packages/shared/src/types/games/wire.ts`):

```ts
export const gameJsonSchema = z.object({
  publicMatch: z.boolean().optional(),
  viewerId: z.string().nullable().optional(),
  config: z.unknown().optional(),
  winners: z.array(z.string()).optional(),
  id: z.string(),
  gameType: gameTypeSchema,
  status: gameStatusSchema,
  winner: z.string().nullable(),
  players: z.array(gamePlayerSchema),
  gameState: z.unknown(),
  conversationId: z.string().nullable().optional(),
  creatorUserId: z.string().nullable().optional(),
  seatingMode: seatingModeSchema.nullable().optional(),
  challengedUserId: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  turnDeadline: z.number().nullable().optional(),
});
export type GameJson = z.infer<typeof gameJsonSchema>;
```

`gameType` is validated by `gameTypeSchema` (a `z.enum(GAME_TYPES)` from `@kyzen/shared/types`) - an unknown game slug is rejected at the wire boundary, not silently passed through. The `GameType` union and `GAME_TYPES` tuple are the single source of truth (`@kyzen/shared/constants` and `@kyzen/shared/types`); adding a game to `GAME_TYPES` automatically widens the schema everywhere it is used. Again `gameState: z.unknown()` - the *outer* DTO is game-agnostic; the inner per-game state is validated separately by that game's `stateSchema`. `gameStatusSchema` is `z.enum(["waiting", "active", "completed", "abandoned", "aborted"])`; `winners` lists every winning seat and `winner` is the single winner, `"draw"`, or `null` for a shared win; `seatingModeSchema` is `z.enum(["open", "challenge"])`; and `gamePlayerSchema` is a `.strict()` object of `{ userId, username, role, avatar? }`, where `avatar` is the optional/nullable `avatarConfigSchema` (`packages/shared/src/types/games/wire.ts:22`, imported from `../avatar`). All live in `packages/shared/src/types/games/wire.ts`. (The server's DB-side `GamePlayer` value still constructs just `{ userId, username, role }` at `apps/server/src/realtime/turn-based.ts:59`; the optional `avatar` is part of the wire DTO contract.)

`GameJson` is the lingua franca of the system. The server *produces* it via `serializeGame` (`apps/server/src/api/serialize.ts:51`), which maps a Drizzle `GameRecord` row into this exact shape - note `id` is set to `row.code`, the public room code, never the internal UUID (`apps/server/src/api/serialize.ts:53`), so `GameJson.id` *is* the code clients put in URLs and socket payloads. The web app *consumes* it as the type of what `GET /api/games/:gameId` returns (`apps/web/app/play/[gameId]/page.tsx:42`). The same `z.infer`-derived type is the contract on both ends.

The server→client socket payload types are plain TS structural types (not Zod), since the server constructs them and the client only reads them (`packages/shared/src/types/games/wire.ts`):

```ts
export type ServerGameStatePayload = {
  game: GameJson;
  moves?: MoveJson[];
  move?: MoveJson;
};

export type ServerGameOverPayload = {
  winner: string | "draw" | null;
};

export type ServerErrorPayload = {
  message: string;
};

export type ServerMatchFoundPayload = {
  gameId: string;
};
```

These name the `game_state`, `game_over`, `game_error`, and `match_found` socket events. `ServerGameStatePayload` carries the full serialized `game` plus *either* `moves` (the entire history, sent on join via `emitFullState`) *or* a single `move` delta (the one new move, sent after each `make_move`); the client appends `move` when present, otherwise replaces its move list from `moves`. The handler builds a `ServerGameStatePayload` literally typed (`apps/server/src/realtime/turn-based.ts:26`, `:170`) so the compiler verifies the broadcast matches the contract the client expects. `ServerMatchFoundPayload` is the transient `match_found` emit the matchmaking lane sends to both paired players (`apps/server/src/realtime/matchmaking.ts:89`); it carries only the `gameId` (the public room code) the client navigates to. `wire.ts` also exports the pure helpers `isGameOver`/`isGameLive` (status predicates) and `resolveWinnerUsername` (maps a winner user id to a username against a players list), used by both ends to classify a game without re-deriving the rules.

### Series wire DTOs (`series.ts`)

The rematch flow strings consecutive games together into a **best-of-N series** (a `seriesId` shared by every game in the run). `packages/shared/src/types/games/series.ts` defines the Zod schemas for the series read model the client renders in the game-over overlay:

```ts
export const seriesDetailSchema = z.object({
  seriesId: z.string(),
  gameType: gameTypeSchema,
  score: seriesScoreSchema,
  games: z.array(seriesGameSummarySchema),
});
```

`seriesScoreSchema` carries per-player `entries` (`{ userId, username, wins, avatar? }`) plus running `draws`/`completedGames`/`totalGames` tallies; `seriesGameSummarySchema` is one row per game in the run (`gameId`, `gameNumber`, `status`, `winner`, `winnerUsername`, `completedAt`). Like the other wire schemas, the TS types are `z.infer`-derived (`SeriesDetail`, `SeriesScore`, `SeriesGameSummary`, `SeriesScoreEntry`), and `gameType` is validated with `gameTypeSchema`. The server *produces* a `SeriesDetail` via `serializeSeries` (`apps/server/src/api/serialize.ts:30`), which sets each summary's `gameId` to `g.code` (the public room code) and resolves `winnerUsername` with `resolveWinnerUsername`; it is returned by `GET /api/games/:gameId/series` (`apps/server/src/api/routes/games.ts:9`) and consumed by the web overlay (`apps/web/app/play/[gameId]/game-over-overlay.tsx:109`). These schemas are re-exported through the `types/games` barrel (`packages/shared/src/types/games/index.ts:28-37`).

## Per-game schemas and the `.strict()` discipline

Each game owns a `schemas.ts` under `packages/shared/src/types/games/<type>/` declaring its three Zod schemas (no slug constant here - the slug lives in `@kyzen/shared/constants`). Tic-tac-toe (`packages/shared/src/types/games/tic-tac-toe/schemas.ts`):

```ts
export const ticTacToeStateSchema = z
  .object({
    board: z.array(cellSchema).length(9),
    currentTurn: markSchema,
  })
  .strict();
export type TicTacToeState = z.infer<typeof ticTacToeStateSchema>;

export const ticTacToeMoveSchema = z
  .object({
    row: z.number().int().min(0).max(2),
    col: z.number().int().min(0).max(2),
  })
  .strict();
export type TicTacToeMove = z.infer<typeof ticTacToeMoveSchema>;

export const ticTacToeConfigSchema = z.object({}).strict();
export type TicTacToeConfig = z.infer<typeof ticTacToeConfigSchema>;
```

Note the patterns that recur across every game in the codebase:

- **`.strict()` everywhere.** A non-strict Zod object silently *passes through* unknown keys; `.strict()` makes any extra key a validation failure. For a layer whose job is to reject untrusted input, that default is the safe one - a client can't smuggle a `{ row, col, isAdmin: true }` move past the schema. The board is pinned to exactly nine cells with `.length(9)`, and row/col are bounded integers `0..2`. The schema encodes the rules a malicious client might otherwise ignore.
- **TS types derive from the schema, never the reverse.** Every `type Foo = z.infer<typeof fooSchema>` means the validator is the source of truth and the static type is a projection of it. Change the schema and the type changes with it; they cannot disagree. The engine (`TicTacToeState`, `TicTacToeMove`) and the definition's generics are all expressed in these inferred types.

## How the registry exposes definitions

Definitions are collected in one array (`packages/games-core/src/games/index.ts`):

```ts
export const GAMES = [
  ticTacToeDefinition,
  tankArenaDefinition,
] satisfies GameDefinition[];
```

`registry.ts` builds a `Map` from `meta.type` → definition and derives every lookup helper from it (`packages/games-core/src/registry.ts`). `getDefinition(type)` throws on an unknown type; `hasEngine(type)` is the soft check the chat service uses before creating a game; `listGameTypes()` returns the narrowed `GameType[]` (used by the conformance suite to assert `GAME_TYPES` matches the registry); `listGameMeta()` powers the lobby grid; `getCategoryGroups()` joins `GAMES` against `GAME_CATEGORIES` (from `@kyzen/shared/constants`) and drops empty categories. Adding a game is purely: declare its slug in `@kyzen/shared/constants`, write its schemas in `packages/shared/src/types/games/<type>/schemas.ts`, write the engine/meta/index in `packages/games-core/src/games/<type>/`, append to `GAMES`, export from `index.ts`. No new route, table, or socket event - see `docs/adding-a-game.md`.

## Data-flow walkthrough: a move, validated twice, trusted once

This is the core insight made concrete. Follow a single Tic-tac-toe move from the browser to a persisted, broadcast state. Note that the server validates **both** the inbound `moveData` *and* the state it loaded from the database, against the per-game Zod schemas, before trusting either.

1. User clicks a cell. The web client emits a `make_move` socket event with `{ gameId, moveData: { row, col } }`.
2. **Generic envelope validation.** The game-lane registration runs `clientMakeMoveSchema.safeParse(payload)` inside `registerGameEvent` (`apps/server/src/realtime/socket-util.ts:55`). If the envelope is malformed (bad `gameId`, extra keys), it emits `game_error` and stops. `moveData` is still `unknown` at this point.
3. On a valid envelope, `registerGameEvent` calls the registered runner, which invokes `handleMakeMove(io, socket, data)` from `./turn-based` directly (`apps/server/src/realtime/index.ts:69`) - there is no driver indirection.
4. **Authorization.** `handleMakeMove` (`apps/server/src/realtime/turn-based.ts`) resolves the code and calls `submitMove` (`apps/server/src/realtime/game-runner.ts`), which confirms under the game lock that the game is `active` and that the authenticated `socket.data.userId` holds a seat. The user is mapped to a *role* here.
5. **Per-game move validation.** `commitMoves` runs `def.moveSchema.safeParse(moveData)` - now the *real* game `moveSchema` validates the move's shape. Invalid → `game_error: "Invalid move"`.
6. **Stored-state validation.** `def.stateSchema.safeParse(row.gameState)` in `commitMoves`. The state pulled from Postgres JSONB is validated *too* - if it's somehow corrupt, the server bails with `"Corrupt game state"` rather than feeding garbage into the engine.
7. **Authoritative reduce.** `commitMoves` in `apps/server/src/realtime/game-runner.ts` runs `def.engine.reduce(state, { role }, move)`, the same engine the client could run, on server-validated inputs. It returns `{ ok: false, error }` (relayed verbatim) or `{ ok: true, state, outcome }`.
8. **Persist + broadcast.** On `ok`, `games.persistGameMoves` compares the previous state, writes the new state and the move, and on completion maps `outcome.winnerRoles` to `winners`, `winner`, and stats in one transaction. The runner then emits a single redacted `game_state` carrying `{ game, move }` to the room and lets pending bots move as one batch (one transaction, one broadcast whose `move` is the batch's last move).

Summarized: `cell click → socket make_move → socket-util.ts (envelope) → game-runner.ts commitMoves (moveSchema → stateSchema → engine.reduce) → persistGameMoves → broadcast game_state`. The client may have *anticipated* this result by running the same engine locally, but the server's copy is the only one that counts.

A parallel flow exists for game creation: the chat service validates the **config** with the same discipline - `definition.configSchema.safeParse(input.config ?? {})` at `apps/server/src/chat/games-in-chat-service.ts:90`, after a `hasEngine` gate (`:79`) - then builds the first state with `engine.createInitialState(seats, { config, seed })` once enough players are seated (lobby engines wait for the host's start).

## Gotchas, invariants & conventions

- **No React, ever, in games-core.** This is what lets the server import it. UI lives in `@kyzen/games-client`. If you reach for a React import here, you've broken the architecture - see [./games-client.md](./games-client.md).
- **`GameType` is a registry-derived union, not a free string.** The type slug lives once, in `@kyzen/shared/constants` (`GAME_TYPES` tuple → `GameType` union → `gameTypeSchema` in `@kyzen/shared/types`). `GameMeta.type` is `GameType`; `hasEngine(type: string): type is GameType` narrows a raw string; `GameRecord.gameType` on the server is narrowed to `GameType` at the repository boundary (the DB column stays `text`). Wire schemas that carry a `gameType` field (`gameJsonSchema`, and the chat schemas `gameCardMetaSchema` / `clientCreateGameInConversationSchema` / `notificationPayloadSchema` in `@kyzen/shared/types`, `packages/shared/src/types/chat/schemas.ts`) validate it with `gameTypeSchema`. `getDefinition`/`getEngine` still accept `string` as a defensive DB-boundary measure.
- **Two-stage validation is intentional.** `clientMakeMoveSchema.moveData` and `gameJsonSchema.gameState` are `z.unknown()` because the generic transport layer doesn't know the game type. The game-specific `moveSchema`/`stateSchema` are the second, authoritative pass. Don't try to "tighten" the envelope schemas to a specific game's shape.
- **The server validates *stored state*, not just incoming moves.** `def.stateSchema.safeParse(gameRow.gameState)` guards against corrupt/migrated JSONB. Treat persisted state as untrusted, just like client input.
- **`.strict()` on every per-game object schema.** Unknown keys must fail. A non-strict schema is a silent security hole here.
- **Types are inferred from schemas (`z.infer`), never hand-written alongside them.** This keeps the validator and the static type provably in sync.
- **`winnerRoles` are roles, not user ids.** `Outcome.winnerRoles` holds roles like `"X"` or `"p2"`; `games.persistGameMoves` maps them to user ids. `GameJson.winners` lists every winning seat (bots included), and `GameJson.winner` is the single winner's id, the literal `"draw"`, or `null` for a shared team win.
- **`roleForSeat` is load-bearing.** Seat *n* receives `roleForSeat(n)`, both when a player joins and when lobby or public seats are built; changing it reassigns seats in existing games.
- **`reduce` returns errors, it does not throw.** Use the `ReduceResult` `ok` tag; a thrown error would escape the handler's normal error-relay path.
- **`getDefinition` throws on unknown types; `hasEngine` does not.** Use `hasEngine` for soft "is this a real game?" checks (as the chat service does) and `getDefinition` once you know the type is valid.
- **One `GAMES` array is the only registration point.** The conformance suite (`packages/games-core/tests/conformance.test.ts`) iterates it and asserts `meta.type === engine.type`, coherent player bounds, the correct handler for the mode, that `createInitialState` validates against `stateSchema` and is seed-deterministic, that `moveSchema` rejects nonsense, that `configSchema` accepts the declared `configFields` defaults, that `roleForSeat` names distinct roles, that simultaneous engines provide their round hooks, that lobby engines with bots provide `botMove`, that public queue configs size a valid group, that `autoMove` and `botMove` return legal moves, and that completed outcomes name winners by seat role - plus that `meta.categoryId` joins to a real `GAME_CATEGORIES` id and media paths live under `/games/`. A new game gets these checks for free. (A companion `tests/registry.test.ts` covers the registry API itself.)
- **No comments in source.** This repo enforces a strict no-comments rule; the schema files are intentionally self-documenting. Only tooling directives (e.g. the `biome-ignore` at `apps/server/src/realtime/turn-based.ts:57`) are permitted.

## Where to go next

- [./README.md](./README.md) - architecture index and the big picture.
- [./games-core-engine.md](./games-core-engine.md) - the engine *behavior* (`reduce`/`step`, `Outcome`, the Tic-tac-toe implementation) that these schemas type.
- [./games-client.md](./games-client.md) - how the shared session consumes `GameJson`/`MoveJson` and supplies boards with state, ordered moves, and `makeMove`. Boards do not manage socket listeners or room membership.
- [./realtime.md](./realtime.md) - the Socket.IO lanes and the `join_room` / `make_move` handlers (`handleJoinRoom`/`handleMakeMove`) that perform the two-stage validation described above.
- [./server-api.md](./server-api.md) - the Hono REST surface, including `GET /api/games/:gameId` and `serializeGame`/`serializeMove`.
- [./chat-core.md](./chat-core.md) - the chat/social contracts (now part of `@kyzen/shared`, under `types/chat/`) and the `gameCardMetaSchema` / create-game-in-conversation flow.
- [./database-schema.md](./database-schema.md) - the generic `game` / `move` / `game_player` tables whose JSONB columns these per-game schemas validate.
