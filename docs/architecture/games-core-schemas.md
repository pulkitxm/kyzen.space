# games-core: Zod Schemas, GameDefinition & Wire DTOs

## What this is / why it matters

`@gamelobby/games-core` is the **contract layer** of the whole multiplayer system. It is a framework-agnostic TypeScript package — its only runtime dependency is `zod` (see `packages/games-core/package.json`), and it contains **no React**. That constraint is deliberate and is the single most important fact about this package: because it has no UI dependencies, the **server can import it too**.

That gives the system one shared source of truth that both ends of the wire consult:

- The **server** (`apps/server`, Bun + Socket.IO) imports games-core to *authoritatively* validate every move and every stored game state before it touches the database.
- The **web client** (`apps/web`, Next.js) imports the *exact same* package — to render the lobby (`listGameMeta()`, `getDefinition()`), to type the data it receives over the socket (`GameJson`, `MoveJson`, the `Server*Payload` types), and to drive its own UI.

The payoff: **the client is never trusted**. The browser may *use* the engine to render an optimistic board or grey out illegal cells, but the server re-runs the identical `reduce` against the identical Zod-validated state and rejects anything that doesn't pass. There is no second, drifting copy of "what a legal Tic-tac-toe move is" living on the backend — there is one `ticTacToeMoveSchema`, and both sides import it.

This doc covers the **schema/contract half** of games-core: the `GameDefinition` shape, the `GameEngine` interface it references, the shared wire/socket Zod schemas in `schemas.ts`, the category definitions, the public surface in `index.ts`, and a concrete per-game schema set (Tic-tac-toe) showing the `.strict()` discipline. The engine *behavior* itself is covered in [./games-core-engine.md](./games-core-engine.md).

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/games-core/src/game-types.ts` | **Single source of truth for game slugs.** Declares each slug constant (e.g. `TIC_TAC_TOE`), the `GAME_TYPES` tuple, the `GameType` union, and `gameTypeSchema` (`z.enum(GAME_TYPES)`). All wire schemas that carry a `gameType` field validate against `gameTypeSchema`. |
| `packages/games-core/src/definition.ts` | `GameDefinition<S,I,C>`, `GameMeta` (`type: GameType`, not `string`), `ConfigField` — the self-describing manifest one game ships. |
| `packages/games-core/src/engine.ts` | `GameEngine<State,Input>`, `Outcome`, `ReduceResult`, `StepResult`, `Seat`, `MoveContext` — the behavioral contract a `GameDefinition` references. |
| `packages/games-core/src/schemas.ts` | Shared **wire/socket** Zod schemas: `uuidSchema`, `gameStatusSchema`, `gamePlayerSchema`, `clientJoinRoomSchema`, `clientMakeMoveSchema`, `gameJsonSchema`/`GameJson`, `moveJsonSchema`/`MoveJson`, and the server→client `Server*Payload` types. `gameJsonSchema.gameType` is validated by `gameTypeSchema`. |
| `packages/games-core/src/categories.ts` | `GameCategoryDef` + the static `GAME_CATEGORIES` list used to group games in the lobby. |
| `packages/games-core/src/registry.ts` | Derives `getDefinition`/`getEngine`/`hasEngine`/`listGameMeta`/`getCategoryGroups`/`listGameTypes` from the single `GAMES` array. `hasEngine(type: string): type is GameType` is a type guard; `listGameTypes(): GameType[]` returns the narrowed list. |
| `packages/games-core/src/games/index.ts` | The single `GAMES: GameDefinition[]` array — the registry's source. |
| `packages/games-core/src/index.ts` | Public package surface (every export consumers may use). |
| `packages/games-core/src/games/tic-tac-toe/schemas.ts` | A worked example: per-game `stateSchema` / `moveSchema` / `configSchema`, each `.strict()`, with TS types derived via `z.infer`. The slug constant lives in `game-types.ts`, not here. |
| `packages/games-core/tests/conformance.test.ts` | Generic suite that runs against every entry in `GAMES`, asserting each definition's schemas and engine agree. Includes a `"GAME_TYPES matches the registry exactly"` test so `GAME_TYPES` and the `GAMES` array can never drift. |

## The `GameDefinition`: one object that fully describes a game

A game is **not** spread across routes, tables, and socket events. It is a single object satisfying `GameDefinition<S, I, C>`, defined at `packages/games-core/src/definition.ts:25`:

```ts
export interface GameDefinition<S = unknown, I = unknown, C = unknown> {
  meta: GameMeta;
  engine: GameEngine<S, I>;
  stateSchema: ZodType<S>;
  moveSchema: ZodType<I>;
  configSchema: ZodType<C>;
  configFields?: ConfigField[];
}
```

The three type parameters are, in order, **S**tate, **I**nput (a move), and **C**onfig. Notice the tight coupling enforced by the type system: `engine` is a `GameEngine<S, I>` and `stateSchema` is a `ZodType<S>` over the *same* `S`. You cannot ship a definition whose state schema validates a different shape than the engine produces — TypeScript rejects it at the definition site. The Tic-tac-toe binding makes this concrete (`packages/games-core/src/games/tic-tac-toe/index.ts:13`):

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

`GameMeta` (`packages/games-core/src/definition.ts:5`) is the display/catalog metadata — `type` (a `GameType` slug, e.g. `"tic-tac-toe"`), `name`, `description`, `categoryId` (joins to `GAME_CATEGORIES`), and an optional `coverImage`. `ConfigField` (`packages/games-core/src/definition.ts:15`) describes one form control the lobby renders so a creator can configure a game before launch:

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

`configFields` is the *presentation* of config; `configSchema` is the *validation* of config. They are kept separate on purpose — the lobby form is built from `configFields`, but the resulting object is only ever trusted after it passes `configSchema`. Tic-tac-toe has no options, so `configFields` is `[]` and `configSchema` is the empty strict object `z.object({}).strict()`.

## The `GameEngine` contract referenced by every definition

`engine.ts` defines the behavioral half. The key types (`packages/games-core/src/engine.ts:1`):

```ts
export type Outcome =
  | { status: "active" }
  | { status: "completed"; winnerRole: string | null; draw: boolean };

export type Seat = { role: string };

export type ReduceResult<State> =
  | { ok: true; state: State; outcome: Outcome }
  | { ok: false; error: string };

export type StepResult<State> = { state: State; outcome: Outcome };

export type MoveContext = { role: string };
```

`Outcome` is a discriminated union: a move either leaves the game `"active"` or marks it `"completed"` with a `winnerRole` (a *role* string like `"X"`, **not** a user id) and a `draw` flag. `ReduceResult` is similarly a tagged union — `reduce` returns `{ ok: false, error }` for an illegal move instead of throwing, so the server can relay that string straight back to the client. This `ok`-tagging is the spine of the trust model: the server branches on `result.ok` and only persists when it is `true`.

The `GameEngine` interface (`packages/games-core/src/engine.ts:15`):

```ts
export interface GameEngine<State, Input> {
  readonly type: string;
  readonly mode: "turn-based" | "realtime";
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly roles: readonly string[];

  createInitialState(seats: Seat[]): State;

  reduce?(state: State, ctx: MoveContext, input: Input): ReduceResult<State>;

  step?(
    state: State,
    inputs: Map<string, Input>,
    dt: number,
  ): StepResult<State>;

  readonly tickRate?: number;
}
```

Both `reduce` and `step` are optional because `mode` selects which one applies: turn-based games implement `reduce` (one move at a time), realtime games implement `step` (batched inputs per tick). The conformance suite enforces that the right one exists for the declared `mode` (`packages/games-core/tests/conformance.test.ts:46`). `roles` is an ordered list — seat *n* gets `roles[n]`, which is how the join handler assigns a role to a newly seated player (`apps/server/src/realtime/turn-based.ts:53`).

`MoveContext` carries only `{ role }`. The engine deliberately knows nothing about user ids, sessions, or sockets — the server resolves the authenticated user to a seat *role* before calling `reduce`, keeping the engine pure and trivially unit-testable.

## Shared wire & socket schemas (`schemas.ts`)

This file is where the package earns the word "contract." It defines the Zod schemas for everything that crosses the network boundary, and derives the TypeScript types from them with `z.infer` so the types can never drift from the validators.

### Inbound (client → server) socket payloads

These are validated the instant a payload arrives, *before* any game logic runs. From `packages/games-core/src/schemas.ts:29`:

```ts
export const clientJoinRoomSchema = z
  .object({
    gameId: uuidSchema,
    intent: z.enum(["play", "spectate"]).optional(),
  })
  .strict();
export type ClientJoinRoom = z.infer<typeof clientJoinRoomSchema>;

export const clientMakeMoveSchema = z
  .object({
    gameId: uuidSchema,
    moveData: z.unknown(),
  })
  .strict();
export type ClientMakeMove = z.infer<typeof clientMakeMoveSchema>;
```

`clientJoinRoomSchema` validates two inbound events: `join_room` and `leave_room`. The latter only needs `{ gameId }` (it leaves the socket room and runs no game logic), so it reuses the same `.strict()` envelope rather than declaring its own (`apps/server/src/realtime/index.ts:130`).

Two things to internalize:

1. **`moveData` is `z.unknown()` here, on purpose.** The *envelope* schema (`clientMakeMoveSchema`) only knows there's a `gameId` and some opaque payload. It cannot validate the move's shape, because the generic socket handler doesn't know which game it is yet. The actual move validation is a **second pass**, done by the *per-game* `moveSchema` (below), after the server has looked up the `gameType`. This two-stage validation — generic envelope first, game-specific payload second — is the central design pattern of the realtime lane.
2. **`uuidSchema`** (`packages/games-core/src/schemas.ts:7`) is `z.string().regex(UUID_RE, "Invalid id")`. The same UUID regex is duplicated defensively on the server in `apps/server/src/lib/uuid.ts:1` (`isUuid`), which the driver calls as a belt-and-braces guard (`isUuid(payload.gameId)`, `apps/server/src/realtime/turn-based.ts:126`).

### Outbound (server → client) wire DTOs

`gameJsonSchema` and `moveJsonSchema` describe what a serialized game / move looks like on the wire (`packages/games-core/src/schemas.ts:45`):

```ts
export const gameJsonSchema = z.object({
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
});
export type GameJson = z.infer<typeof gameJsonSchema>;
```

`gameType` is validated by `gameTypeSchema` (a `z.enum(GAME_TYPES)` from `game-types.ts`) — an unknown game slug is rejected at the wire boundary, not silently passed through. The `GameType` union and `GAME_TYPES` tuple are the single source of truth; adding a game to `GAME_TYPES` automatically widens the schema everywhere it is used. Again `gameState: z.unknown()` — the *outer* DTO is game-agnostic; the inner per-game state is validated separately by that game's `stateSchema`. `gameStatusSchema` (`packages/games-core/src/schemas.ts:9`) is `z.enum(["waiting", "active", "completed", "abandoned"])`; `seatingModeSchema` (`packages/games-core/src/schemas.ts:17`) is `z.enum(["open", "challenge"])`; and `gamePlayerSchema` (`packages/games-core/src/schemas.ts:20`) is a `.strict()` object of `{ userId, username, role }`.

`GameJson` is the lingua franca of the system. The server *produces* it via `serializeGame` (`apps/server/src/api/serialize.ts:25`), which maps a Drizzle `GameRecord` row into this exact shape; the web app *consumes* it as the type of what `GET /api/games/:gameId` returns (`apps/web/app/play/[gameId]/page.tsx:31`). The same `z.infer`-derived type is the contract on both ends.

The server→client socket payload types are plain TS structural types (not Zod), since the server constructs them and the client only reads them (`packages/games-core/src/schemas.ts:73`):

```ts
export type ServerGameStatePayload = {
  game: GameJson;
  moves: MoveJson[];
};

export type ServerMoveMadePayload = {
  move: MoveJson;
  gameState: unknown;
};

export type ServerGameOverPayload = {
  winner: string | "draw" | null;
};

export type ServerErrorPayload = {
  message: string;
};
```

These name the `game_state`, `move_made`, `game_over`, and `game_error` socket events. The driver builds a `ServerGameStatePayload` literally typed (`apps/server/src/realtime/turn-based.ts:21`) so the compiler verifies the broadcast matches the contract the client expects.

## Per-game schemas and the `.strict()` discipline

Each game owns a `schemas.ts` declaring its three Zod schemas (no slug constant here — the slug lives in `game-types.ts`). Tic-tac-toe (`packages/games-core/src/games/tic-tac-toe/schemas.ts:9`):

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

- **`.strict()` everywhere.** A non-strict Zod object silently *passes through* unknown keys; `.strict()` makes any extra key a validation failure. For a layer whose job is to reject untrusted input, that default is the safe one — a client can't smuggle a `{ row, col, isAdmin: true }` move past the schema. The board is pinned to exactly nine cells with `.length(9)`, and row/col are bounded integers `0..2`. The schema encodes the rules a malicious client might otherwise ignore.
- **TS types derive from the schema, never the reverse.** Every `type Foo = z.infer<typeof fooSchema>` means the validator is the source of truth and the static type is a projection of it. Change the schema and the type changes with it; they cannot disagree. The engine (`TicTacToeState`, `TicTacToeMove`) and the definition's generics are all expressed in these inferred types.

## How the registry exposes definitions

Definitions are collected in one array (`packages/games-core/src/games/index.ts:4`):

```ts
export const GAMES: GameDefinition[] = [ticTacToeDefinition];
```

`registry.ts` builds a `Map` from `meta.type` → definition and derives every lookup helper from it (`packages/games-core/src/registry.ts:7`). `getDefinition(type)` throws on an unknown type; `hasEngine(type)` is the soft check the chat service uses before creating a game; `listGameTypes()` returns the narrowed `GameType[]` (used by the conformance suite to assert `GAME_TYPES` matches the registry); `listGameMeta()` powers the lobby grid; `getCategoryGroups()` joins `GAMES` against `GAME_CATEGORIES` (`packages/games-core/src/categories.ts:6`) and drops empty categories. Adding a game is purely: declare its slug in `game-types.ts`, write its `schemas/engine/meta/index`, append to `GAMES`, export from `index.ts` (`packages/games-core/src/index.ts`). No new route, table, socket event, or driver — see `docs/adding-a-game.md`.

## Data-flow walkthrough: a move, validated twice, trusted once

This is the core insight made concrete. Follow a single Tic-tac-toe move from the browser to a persisted, broadcast state. Note that the server validates **both** the inbound `moveData` *and* the state it loaded from the database, against the per-game Zod schemas, before trusting either.

1. User clicks a cell. The web client emits a `make_move` socket event with `{ gameId, moveData: { row, col } }`.
2. **Generic envelope validation.** The socket handler runs `clientMakeMoveSchema.safeParse(payload)` (`apps/server/src/realtime/index.ts:98`). If the envelope is malformed (bad `gameId`, extra keys), it emits `game_error` and stops. `moveData` is still `unknown` at this point.
3. The handler looks up the game's `gameType` from the DB, picks a driver via `getDriver(...)` (`apps/server/src/realtime/index.ts:109`; currently always the turn-based driver, `apps/server/src/realtime/drivers.ts:25`), and calls `driver.makeMove(io, socket, data)`.
4. **Authorization.** `handleMakeMove` (`apps/server/src/realtime/turn-based.ts:120`) confirms the game is `active` and that the authenticated `socket.data.userId` actually holds a seat (`gameRow.players.find(...)`). The user is mapped to a *role* here.
5. **Per-game move validation.** `def.moveSchema.safeParse(payload.moveData)` (`apps/server/src/realtime/turn-based.ts:138`) — now the *real* Tic-tac-toe `moveSchema` validates the move's shape. Invalid → `game_error: "Invalid move"`.
6. **Stored-state validation.** `def.stateSchema.safeParse(gameRow.gameState)` (`apps/server/src/realtime/turn-based.ts:140`). The state pulled from Postgres JSONB is validated *too* — if it's somehow corrupt, the server bails with `"Corrupt game state"` rather than feeding garbage into the engine.
7. **Authoritative reduce.** `def.engine.reduce(parsedState.data, { role: player.role }, parsedMove.data)` (`apps/server/src/realtime/turn-based.ts:143`) runs the same engine the client could run, but on server-validated inputs. It returns `{ ok: false, error }` (relayed verbatim) or `{ ok: true, state, outcome }`.
8. **Persist + broadcast.** On `ok`, the server records the move (`games.addMove`), writes `result.state` back (`games.updateGame`), runs `finalize` for completion/stats, then emits `move_made` and a fresh `game_state` (`ServerGameStatePayload`) to the room (`apps/server/src/realtime/turn-based.ts:161`).

Summarized: `cell click → socket make_move → index.ts:98 (envelope) → turn-based.ts:138 (moveSchema) → turn-based.ts:140 (stateSchema) → turn-based.ts:143 (engine.reduce) → DB write → broadcast game_state`. The client may have *anticipated* this result by running the same engine locally, but the server's copy is the only one that counts.

A parallel flow exists for game creation: the chat service validates the **config** with the same discipline — `definition.configSchema.safeParse(input.config ?? {})` at `apps/server/src/chat/games-in-chat-service.ts:30`, after a `hasEngine` gate (`:27`) — then seeds the first seat's state with `engine.createInitialState` (`:70`).

## Gotchas, invariants & conventions

- **No React, ever, in games-core.** This is what lets the server import it. UI lives in `@gamelobby/games-client`. If you reach for a React import here, you've broken the architecture — see [./games-client.md](./games-client.md).
- **`GameType` is a registry-derived union, not a free string.** The type slug lives once, in `packages/games-core/src/game-types.ts` (`GAME_TYPES` tuple → `GameType` union → `gameTypeSchema`). `GameMeta.type` is `GameType`; `hasEngine(type: string): type is GameType` narrows a raw string; `GameRecord.gameType` on the server is narrowed to `GameType` at the repository boundary (the DB column stays `text`). Wire schemas that carry a `gameType` field (`gameJsonSchema`, chat-core's `gameCardMetaSchema` / `clientCreateGameInConversationSchema` / `notificationPayloadSchema`) validate it with `gameTypeSchema`. `getDefinition`/`getEngine` still accept `string` as a defensive DB-boundary measure.
- **Two-stage validation is intentional.** `clientMakeMoveSchema.moveData` and `gameJsonSchema.gameState` are `z.unknown()` because the generic transport layer doesn't know the game type. The game-specific `moveSchema`/`stateSchema` are the second, authoritative pass. Don't try to "tighten" the envelope schemas to a specific game's shape.
- **The server validates *stored state*, not just incoming moves.** `def.stateSchema.safeParse(gameRow.gameState)` guards against corrupt/migrated JSONB. Treat persisted state as untrusted, just like client input.
- **`.strict()` on every per-game object schema.** Unknown keys must fail. A non-strict schema is a silent security hole here.
- **Types are inferred from schemas (`z.infer`), never hand-written alongside them.** This keeps the validator and the static type provably in sync.
- **`winnerRole` is a role, not a user id.** `Outcome.winnerRole` is `"X"`/`"O"`; the driver maps role → `userId` in `finalize` (`apps/server/src/realtime/turn-based.ts:79`). `GameJson.winner`, by contrast, is the resolved user id (or the literal `"draw"`).
- **`roles` ordering is load-bearing.** Seat *n* receives `roles[n]`. The join handler relies on `engine.roles[players.length]` (`apps/server/src/realtime/turn-based.ts:53`); reordering `roles` reassigns seats.
- **`reduce` returns errors, it does not throw.** Use the `ReduceResult` `ok` tag; a thrown error would escape the driver's normal error-relay path.
- **`getDefinition` throws on unknown types; `hasEngine` does not.** Use `hasEngine` for soft "is this a real game?" checks (as the chat service does) and `getDefinition` once you know the type is valid.
- **One `GAMES` array is the only registration point.** The conformance suite (`packages/games-core/tests/conformance.test.ts`) iterates it and asserts `meta.type === engine.type`, coherent player bounds, the correct handler for the mode, that `createInitialState` validates against `stateSchema`, that `moveSchema` rejects nonsense, and that `configSchema` accepts the declared `configFields` defaults — plus (added this round) that `meta.categoryId` joins to a real `GAME_CATEGORIES` id, `roles` has no duplicates, and `coverImage` (when set) is a `/games/` path. A new game gets these checks for free. (A companion `tests/registry.test.ts` covers the registry API itself.)
- **No comments in source.** This repo enforces a strict no-comments rule; the schema files are intentionally self-documenting. Only tooling directives (e.g. the `biome-ignore` at `apps/server/src/realtime/turn-based.ts:52`) are permitted.

## Where to go next

- [./README.md](./README.md) — architecture index and the big picture.
- [./games-core-engine.md](./games-core-engine.md) — the engine *behavior* (`reduce`/`step`, `Outcome`, the Tic-tac-toe implementation) that these schemas type.
- [./games-client.md](./games-client.md) — how the React UI consumes `GameJson`/`MoveJson` and renders boards from the same definitions. Boards no longer open their own socket: the `GameClientProps` contract now passes the app's shared Socket.IO connection (`socket` + `connected`), over which the board emits `join_room` / `make_move` / `leave_room`.
- [./realtime.md](./realtime.md) — the Socket.IO lanes, drivers, and the `join_room` / `make_move` handlers that perform the two-stage validation described above.
- [./server-api.md](./server-api.md) — the Hono REST surface, including `GET /api/games/:gameId` and `serializeGame`/`serializeMove`.
- [./chat-core.md](./chat-core.md) — the parallel chat/social contract package and the `gameCardMetaSchema` / create-game-in-conversation flow.
- [./database.md](./database.md) — the generic `game` / `move` / `game_player` tables whose JSONB columns these per-game schemas validate.
