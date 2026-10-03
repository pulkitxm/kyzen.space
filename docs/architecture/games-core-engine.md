# games-core: Engine, Registry & the GAMES Array

## What this is / why it matters

`@kyzen/games-core` is the **framework-agnostic brain** of every game in the lobby. It is now **logic-only**: it contains no React, no Express, no socket code - just the concrete engines and a registry that turns a single hand-written array of game definitions into all the lookups the rest of the monorepo needs. The *contracts* it builds on - the `GameEngine<State, Input>` interface, the `GameDefinition` shape, and every game's strict Zod schemas + inferred types - live in **`@kyzen/shared/types`**. games-core declares `@kyzen/shared` as its only dependency and imports those types/schemas from there (`packages/games-core/package.json:14`).

This document covers the **logic + registry layer** specifically:

- **The `GameEngine<State, Input>` contract** (`packages/shared/src/types/games/engine.ts`) - `roleForSeat`, `createInitialState`, `reduce` (turn-based and simultaneous), the round, bot, and redaction hooks, `step` (realtime), and the static descriptors `mode` / `minPlayers` / `maxPlayers` / `lobby`.
- **A concrete engine** - tic-tac-toe's pure `reduce()` (in games-core): turn enforcement, win/draw detection, and an immutable next-state.
- **The assembly** - how `schemas + engine + meta` become one `GameDefinition`.
- **The single `GAMES` array** and the `registry.ts` lookups derived from it.
- **The conformance suite** - the invariants every game in `GAMES` is forced to satisfy.

Why it matters: because this code (and the shared contracts it builds on) is **pure and React-free, the same code runs on both sides of the wire**. The Next.js client imports `getDefinition()` to drive its UI; the Bun/Socket.IO server imports the *exact same* `getDefinition()` to authoritatively validate and apply moves. The client is never trusted - every move a client sends is re-validated against the engine's Zod schemas and re-run through the engine's `reduce()` on the server. The engine is the single source of truth, and the `reduce()` purity/determinism contract (below) is what makes that trust safe.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/types/games/engine.ts` | (shared) The `GameEngine<State, Input>` interface + the `Outcome` / `ReduceResult` / `StepResult` / `Seat` / `SetupOptions` / `BotDifficulty` / `MoveContext` types |
| `packages/shared/src/types/games/definition.ts` | (shared) `GameDefinition` (engine + schemas + meta + optional public `queues` and `layout`) and `GameMeta` / `ConfigField` / `PublicQueue` types |
| `packages/shared/src/types/games/lobby.ts` | (shared) `lobbyConfigSchema` (mode, teams, bots) for lobby engines, plus `isBotId` / `botId` |
| `packages/shared/src/types/games/core.ts` | (shared) `gameTypeSchema` + the `GameType` union, derived from the `GAME_TYPES` tuple in `packages/shared/src/constants/games.ts` (which also defines the `TIC_TAC_TOE` slug) - **the single source of truth for every game's type id** |
| `packages/shared/src/types/games/tic-tac-toe/schemas.ts` | (shared) Strict Zod `stateSchema` / `moveSchema` / `configSchema`; TS types derived via `z.infer`. |
| `packages/games-core/src/games/tic-tac-toe/engine.ts` | Concrete pure engine: `createInitialState`, `reduce`, win/draw helpers |
| `packages/games-core/src/games/tic-tac-toe/meta.ts` | Display metadata (`name`, `description`, `categoryId`, `coverImage`) |
| `packages/games-core/src/games/tic-tac-toe/index.ts` | Assembles the four pieces into one `ticTacToeDefinition` |
| `packages/games-core/src/games/index.ts` | **The single `GAMES` array** - the one place every game is registered |
| `packages/shared/src/constants/categories.ts` | (shared) `GAME_CATEGORIES` object/record used for grouping in lobby UI |
| `packages/games-core/src/registry.ts` | Derives `byType` Map + `getDefinition` / `getEngine` / `hasEngine` / `listGameMeta` / `getCategoryGroups` from `GAMES` |
| `packages/games-core/src/index.ts` | Public barrel - re-exports the registry functions, `GAMES`, per-game engine symbols, and the `playing-cards/svg` card-rendering helpers (`CARD_WIDTH`/`cardSvg`/`jokerSvg`/…) (types/schemas come from `@kyzen/shared/types`) |
| `packages/games-core/tests/conformance.test.ts` | Invariant suite run against *every* entry in `GAMES` |
| `packages/games-core/tests/tic-tac-toe.test.ts` | Focused engine tests for tic-tac-toe |
| `apps/server/src/realtime/turn-based.ts` | The server consumer - proves how the engine is trusted to validate/apply moves |

## The `GameEngine` contract

Everything starts with `engine.ts`. The contract stays small: a pure engine maps seats to roles, builds a state, and reduces inputs. Optional hooks opt a game into platform features.

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

export type MoveContext = { role: string };
```

- **`Outcome`** names winners by *role*, never by user id. `{ draw: false, winnerRoles }` means those roles won and every other seat lost (a team win lists every role on the team). `{ draw: true, winnerRoles }` means the listed roles share a draw and every other seat lost; an empty `winnerRoles` on a draw means every seat drew. Tic-tac-toe returns `[mark]` for a win and `[]` for a draw. The server maps roles to user ids (`game.winners`) and summarizes `game.winner` as the single winner's id, `"draw"` for any draw, or `null` for a shared win.
- **`ReduceResult<State>`** is a result type, not an exception. A rejected move is a value (`{ ok: false, error }`).
- **`MoveContext`** is the *trusted* role the server attaches after resolving the authenticated user to a seat.
- **`Seat`** is what `createInitialState` receives: the seat's role, its team (the role itself outside team play), and the bot difficulty for bot seats. **`SetupOptions`** carries the validated config and a server-chosen seed (`crypto.randomInt(2 ** 31)`). Engines store the seed in state and never call `Math.random` inside `reduce`.

The interface:

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

Key design points:

- **Seating.** `roleForSeat(index)` names the role of seat `index`; the server seats players in order and never asks the client. `maxPlayers` may be `Number.POSITIVE_INFINITY`. `minPlayers` decides when a non-lobby game starts and is checked again (counting bots) when a lobby starts.
- **Modes.** `"turn-based"` engines implement `reduce` plus optional `currentRole` and `autoMove` for the turn clock. `"simultaneous"` engines also implement `reduce`, but every pending role submits each round: `pendingRoles(state)` lists roles that still owe an input, `roundOf(state)` is a monotonic round number (the platform re-arms the round clock whenever it changes), `roundTimeMs(state)` is the full allowance for the round that just opened (including any replay playback of the previous resolution), and `autoMove(state, role, strikes)` produces the input submitted for a human who misses the deadline. `strikes` is the number of consecutive earlier rounds that role already timed out (0 on the first timeout), so the engine decides what a long-absent player does. Duplicate and stale-round inputs must be rejected by `reduce`. `"realtime"` engines implement `step`; no server loop runs them yet.
- **Bots and lobbies.** `lobby: { teams, bots }` makes private rooms wait for the host to configure and start them (see [realtime.md](./realtime.md)). `botMove(state, role, difficulty)` returns a bot seat's input; the platform submits it as soon as that role is pending.
- **Hidden information.** `publicState(state)` returns what every viewer may see; `publicMove(state, move)` redacts a persisted move given the *current* state (for example "locked" until its round resolves, then the full move so clients can verify replays). The server applies both to every snapshot, move delta, and HTTP response.
- **Public queues.** `playerCount(config)` sizes a public match group (default 2). `GameDefinition.queues` lists find-page variants, each with the config sent with `game:queue_join`.

## A concrete engine: tic-tac-toe `reduce()`

`packages/games-core/src/games/tic-tac-toe/engine.ts` is the reference implementation new games should imitate. First the pure helpers - note these are exported so tests (and any other consumer) can use them directly:

```ts
export function lineWinner(board: Cell[]): Mark | null {
  for (const [a, b, c] of WIN_LINES) {
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return v;
  }
  return null;
}

export function isBoardFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}
```

(`packages/games-core/src/games/tic-tac-toe/engine.ts:31`). `WIN_LINES` is a static table of the 8 winning triples (`:16`), and `outcomeFor()` (`:47`) folds `lineWinner` + `isBoardFull` into a single `Outcome`: a winner ⇒ `completed`/win, a full board ⇒ `completed`/draw, otherwise `active`.

The engine object wires the static descriptors and the two functions:

```ts
export const ticTacToeEngine: GameEngine<TicTacToeState, TicTacToeMove> = {
  type: TIC_TAC_TOE,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 2,

  roleForSeat(index): Mark {
    return index % 2 === 0 ? "X" : "O";
  },

  createInitialState(): TicTacToeState {
    return { board: emptyBoard(), currentTurn: "X" };
  },
```

(`packages/games-core/src/games/tic-tac-toe/engine.ts:59`). `createInitialState` ignores the seats, teams, bots, and seed here (tic-tac-toe's roles are fixed), but other games use them, for example to place teams or derive a deterministic map from the seed. Critically, it builds a **fresh** object every call (`emptyBoard()` allocates a new array at `:27`); the conformance suite checks this.

Now the heart of the system, `reduce()`:

```ts
  reduce(state, ctx, input): ReduceResult<TicTacToeState> {
    if (isTerminal(state)) {
      return { ok: false, error: "Game is not active" };
    }
    if (!isMark(ctx.role)) {
      return { ok: false, error: "Not a player in this game" };
    }
    if (state.currentTurn !== ctx.role) {
      return { ok: false, error: "Not your turn" };
    }
    const parsed = ticTacToeMoveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid move" };
    }
    const { row, col } = parsed.data;
    const idx = row * 3 + col;
    if (state.board[idx] !== null) {
      return { ok: false, error: "Cell occupied" };
    }

    const board = [...state.board];
    board[idx] = ctx.role;
    const nextState: TicTacToeState = {
      board,
      currentTurn: ctx.role === "X" ? "O" : "X",
    };
    return { ok: true, state: nextState, outcome: outcomeFor(nextState) };
  },
```

(`packages/games-core/src/games/tic-tac-toe/engine.ts:70`). Read it as a gauntlet of guards - every illegal situation is rejected as data *before* any state changes:

1. **Terminal check** - no moves after the game is decided.
2. **Role membership** - `ctx.role` must be a real role for this game.
3. **Turn check** - it must be that role's turn (`currentTurn`).
4. **Schema re-validation** - even though the server already validated `moveData` against `moveSchema`, the engine validates again. The engine never assumes its caller pre-checked anything; it owns its own correctness.
5. **Game-rule check** - the target cell must be empty.

Only after all guards pass does it produce the next state - and it does so **immutably**: `const board = [...state.board]` copies the array, the mutation lands on the copy, and a brand-new state object is returned. The input `state` is never touched. This is the single most important property in the package, so it gets its own section.

### The `reduce()` purity/determinism contract

`reduce` must be a **pure function**: `(state, ctx, input) -> ReduceResult`. Concretely the contract is:

- **No mutation of inputs.** The input `state` must be byte-for-byte unchanged after the call. Tic-tac-toe achieves this by copying before writing (`:90`). The conformance suite snapshots state with `JSON.parse(JSON.stringify(...))` and asserts equality afterward (`packages/games-core/tests/conformance.test.ts:82`), and the focused suite repeats it (`packages/games-core/tests/tic-tac-toe.test.ts:110`).
- **Determinism.** Same `(state, ctx, input)` ⇒ same result, every time. No `Date.now()`, no `Math.random()`, no network, no DB. A game that needs randomness stores `SetupOptions.seed` in its initial state and derives every random choice from it, so replaying the move log from the initial state reproduces the final state.
- **Total over its result type.** Every branch returns a `ReduceResult`; failures are `{ ok: false, error }`, never thrown exceptions.

Why this matters so much: the server treats `reduce()` as the **authority**. It loads the stored state from Postgres, runs `reduce`, and if `ok`, persists `result.state` and broadcasts it. Because `reduce` is pure and deterministic, the server can trust that:

- It is reproducible - replaying the move log from the initial state yields the same state.
- It is safe to run against client-supplied input - the engine's guards + schema parse reject anything malformed or illegal, so a malicious client cannot place two marks, move out of turn, overwrite a cell, or move after the game ends.
- Client and server agree - the client can predict the next state with the same engine the server will authoritatively apply, so optimistic UI stays consistent.

## Assembling a `GameDefinition`

A game is **not** just an engine. It's a `GameDefinition` (`packages/shared/src/types/games/definition.ts:26`):

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
```

`queues` lists public matchmaking variants (each with a label and the config sent with `game:queue_join`); `layout: "wide"` asks the play shell to give the board the full available area. Lobby engines use `lobbyConfigSchema` (`mode`, `teams`, `bots`) as their config or as part of it.

The three generics line up: `S` = State, `I` = Input/Move, `C` = Config, and each Zod schema is typed `ZodType<S>` / `ZodType<I>` / `ZodType<C>` so the schema and the engine cannot drift apart at the type level. The meta (`packages/games-core/src/games/tic-tac-toe/meta.ts:4`) is pure display data - `name`, `description`, `categoryId`, `coverImage` - with `categoryId` referencing an id in `GAME_CATEGORIES` (`packages/shared/src/constants/categories.ts:4`). `configFields` describes the lobby's config form; tic-tac-toe has none, so it's `[]`.

The per-game `index.ts` is the glue that snaps the four parts together:

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

(`packages/games-core/src/games/tic-tac-toe/index.ts:13`). The explicit `GameDefinition<TicTacToeState, TicTacToeMove, TicTacToeConfig>` annotation is what makes TypeScript verify the engine's `State`/`Input` match the schemas' inferred types. The Zod types are themselves *derived from* the schemas via `z.infer` (`packages/shared/src/types/games/tic-tac-toe/schemas.ts:15`, `:23`, `:26`) - the schema is the source, the TS type is a projection of it. See [./games-core-schemas.md](./games-core-schemas.md) for the schema layer in depth.

## The single `GAMES` array

This is the design decision the whole package hinges on. There is exactly **one** place every game is registered (`packages/games-core/src/games/index.ts`):

```ts
import type { GameDefinition } from "@kyzen/shared/types";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES = [ticTacToeDefinition] satisfies GameDefinition[];
```

That's the entire file. Adding a game is appending one element to this array (after building its definition folder). No new route, endpoint, DB table, or socket event - see [./README.md](./README.md) and `docs/adding-a-game.md`. Everything downstream is **derived** from `GAMES`, so a new entry automatically appears in the lobby, gets a working move pipeline, and is covered by the conformance suite.

## The registry: lookups derived from `GAMES`

`registry.ts` builds one index and exposes typed accessors over it. The index:

```ts
const byType: Map<string, GameDefinition> = new Map(
  GAMES.map((def) => [def.meta.type, def]),
);
```

(`packages/games-core/src/registry.ts:11`). Keying by `def.meta.type` is why `meta.type` must equal `engine.type` - the conformance suite enforces that (below), so a mismatch would mean the registry key and the engine's self-reported type disagree.

The accessors:

```ts
export function hasEngine(type: string): type is GameType {
  return byType.has(type);
}

export function getDefinition(type: string): GameDefinition {
  const def = byType.get(type);
  if (!def) throw new Error(`Unknown game type: ${type}`);
  return def;
}

export function getEngine(type: string): GameEngine<unknown, unknown> {
  return getDefinition(type).engine as GameEngine<unknown, unknown>;
}

export function listGameTypes(): GameType[] {
  return GAMES.map((def) => def.meta.type);
}
```

(`packages/games-core/src/registry.ts:15`). Notes:

- **`hasEngine` is a type guard** - `hasEngine(type: string): type is GameType` narrows a raw string to the `GameType` union when the check passes. The server uses it as a soft "is this a real game?" check before creating a game.
- **`getDefinition` throws on an unknown type** - a missing game is a programming error, not a recoverable condition. (It still accepts `string` as a defensive DB-boundary measure, since the `gameType` column is `text` in Postgres.) The focused test pins the message: `getEngine("chess")` throws `"Unknown game type: chess"` (`packages/games-core/tests/tic-tac-toe.test.ts:332`).
- **`getEngine` erases the generics to `GameEngine<unknown, unknown>`.** See "Type erasure" below.
- **`listGameMeta()` / `listGameTypes()` / `listDefinitions()`** are simple maps over `GAMES` (`packages/games-core/src/registry.ts:29`–`:39`) - the lobby UI calls `listGameMeta()` to render the catalog. `listGameTypes()` returns `GameType[]`, not `string[]`, and is keyed off `def.meta.type` (which is itself `GameType`).

`getCategoryGroups()` joins `GAMES` against `GAME_CATEGORIES` for the grouped lobby view:

```ts
export function getCategoryGroups(): {
  category: GameCategoryDef;
  games: GameMeta[];
}[] {
  return Object.values(GAME_CATEGORIES)
    .map((category) => ({
      category,
      games: GAMES.filter((def) => def.meta.categoryId === category.id).map(
        (def) => def.meta,
      ),
    }))
    .filter((group) => group.games.length > 0);
}
```

(`packages/games-core/src/registry.ts:41`). `GAME_CATEGORIES` is a keyed object/record, so `getCategoryGroups` iterates it with `Object.values(...)`; it preserves the insertion order of that object, attaches each category's matching game metas, and **drops empty categories** (the trailing `.filter`) so the UI never renders a category with no games.

### Type erasure at the registry boundary

Each `GameDefinition` is precisely generic (`<TicTacToeState, TicTacToeMove, TicTacToeConfig>`), but the moment definitions land in a heterogeneous `GameDefinition[]` array, their distinct generics have to unify - so `GAMES` is typed `GameDefinition[]` (i.e. `GameDefinition<unknown, unknown, unknown>`), and `getEngine` returns `GameEngine<unknown, unknown>`. That's the right trade-off: at a *call site* you only know the `type` string at runtime, so you can't statically know which `State`/`Input` you'll get. The server therefore **re-narrows at the edge** by parsing through the definition's own Zod schemas (`def.moveSchema.safeParse`, `def.stateSchema.safeParse`) before calling `reduce` - Zod restores the type guarantee the array erased. This is the practical reason the schemas live *inside* the definition next to the engine.

## End-to-end: how a move flows through the engine (server-authoritative)

The same engine that informs the client validates the move on the server. Walkthrough of a `make_move`:

1. **Client emits `make_move`** with `{ gameId, moveData }`. `handleMakeMove` (`apps/server/src/realtime/turn-based.ts`) resolves the room code and calls `submitMove` (`apps/server/src/realtime/game-runner.ts`).
2. **Lock and reload** - `submitMove` runs inside the per-game mutex (`game-lock.ts`), re-reads the game by id, and rejects an inactive game or a caller without a seat. The user→role mapping is the server's, never the client's.
3. **Validate** - `def.moveSchema` parses the untrusted input (`"Invalid move"`), and `def.stateSchema` re-narrows the stored JSONB (`"Corrupt game state"`).
4. **Run the authoritative `reduce`** with `{ role }`. `!result.ok` sends the engine's own error back.
5. **Persist with compare-and-swap** - `games.persistGameMove` locks the row, checks the previous state, appends the move, writes the new state, and on completion maps `winnerRoles` to user ids (`game.winners`, `game.winner`) and updates human stats in the same transaction. A miss caused by another process reloads and retries up to three times.
6. **Clock, broadcast, bots** - the runner re-arms the turn or round clock, emits one redacted `game_state` `{ game, move }`, emits `game_over` on completion, and then submits `botMove` inputs for any pending bot seats.

Seating mirrors this: `ensureSeated` checks `maxPlayers` (counting configured bots in a lobby), assigns `engine.roleForSeat(players.length)`, and, for non-lobby games, starts the game with a fresh `createInitialState(seats, { config, seed })` once `minPlayers` are seated. Lobby games start only through `room:start`, which builds every seat (humans, then bots) and creates the state once. A **rematch** pre-seats the prior players before the first `join_room`; see [`realtime.md`](./realtime.md).

## The conformance suite: invariants every game must satisfy

`packages/games-core/tests/conformance.test.ts` is generic - it loops over `GAMES` and asserts the contract for each one, so a new game is tested the moment it's added to the array (no per-game wiring). The invariants:

- **Registry sanity** - `GAMES` is non-empty and all `meta.type` values are unique (`:17`). Uniqueness must hold or the `byType` Map would silently collide.
- **`GAME_TYPES` matches the registry exactly** (`:23`) - `[...GAME_TYPES].sort()` must equal `listGameTypes().sort()`, so the shared `GAME_TYPES` tuple (`packages/shared/src/constants/games.ts`) and the `GAMES` array can never drift (added with the registry-typed `gameType` work).
- **`meta.type === engine.type`** (`:30`) - the registry key and the engine's self-id must agree.
- **Coherent player bounds** - `minPlayers >= 1`, `maxPlayers >= minPlayers`, and `maxPlayers` is an integer or `Infinity`.
- **Distinct roles** - `roleForSeat` returns a stable, non-empty, distinct role for every seat (sampled up to eight seats).
- **Mode/handler pairing** - `turn-based` and `simultaneous` ⇒ `reduce`; `realtime` ⇒ `step`. Simultaneous engines must also provide `roundOf`, `pendingRoles`, `roundTimeMs`, and `autoMove`; lobby engines with bots must provide `botMove`.
- **Initial state validates and is seed-deterministic** - `createInitialState(minSeats(def), { config, seed })` passes `stateSchema`, and two calls with the same seed are equal but not the same object.
- **`moveSchema` rejects junk** - `undefined`, a string, and a bogus object all fail to parse.
- **`configSchema` accepts the declared defaults**, and every public queue config parses and sizes a group within the player bounds.
- **`reduce` does not mutate input state** - the purity check described above.
- **Hooks return legal input** - `autoMove` (at several strike counts) and `botMove` (at every difficulty) produce moves that parse and that `reduce` accepts for the acting role; a simultaneous opening round has pending roles and a positive finite deadline.
- **Outcome shape** - an `autoMove` playout that completes names only seat roles in `winnerRoles`, and a decisive result names at least one winner.
- **`meta.categoryId` is a known category**.
- **`coverImage`, when set, is a `/games/` path** (`:98`) - cover art lives under `public/games/`.

Here is the helper that makes the suite game-agnostic, plus the mutation invariant:

```ts
function minSeats(def: GameDefinition): Seat[] {
  return seatRoles(def, def.engine.minPlayers).map((role) => ({
    role,
    team: role,
    bot: null,
  }));
}
```

```ts
    test("reduce does not mutate the input state", () => {
      if (!def.engine.reduce) return;
      const state = initial(def);
      const snapshot = JSON.parse(JSON.stringify(state));
      def.engine.reduce(state, { role: def.engine.roleForSeat(0) }, {} as never);
      expect(state).toEqual(snapshot);
    });
```

(`packages/games-core/tests/conformance.test.ts`). Note the empty `{}` move: a game must remain immutable even when handed a clearly-invalid input - proof that the guards reject *before* mutating.

The focused `tests/tic-tac-toe.test.ts` complements this with game-specific behavior: turn/role enforcement (`:64`), out-of-bounds and occupied-cell rejection (`:90`), all 8 win lines (`:118`), draw detection (`:188`), no-move-after-win (`:255`), and registry resolution (`:322`). New games should add a similar focused suite - conformance proves the contract, the focused suite proves the *rules*.

## Gotchas, invariants & conventions

- **No React, no I/O in this package - ever.** games-core is imported by the server, which has no DOM and must stay React-free. Keep game UI in `@kyzen/games-client` (see [./games-client.md](./games-client.md)) and logic here.
- **`reduce` must be pure and deterministic.** No mutation of `state`/`input`, no `Date.now`/`Math.random`/network/DB. Copy-then-write; return a fresh state object. The server's trust model depends on it.
- **The engine validates everything itself.** Don't rely on the caller having pre-validated. tic-tac-toe re-runs `moveSchema.safeParse` *inside* `reduce` (`packages/games-core/src/games/tic-tac-toe/engine.ts:80`) even though the server already parsed - defense in depth, and it keeps the engine correct in isolation (tests call `reduce` directly).
- **Roles are not users.** `Outcome.winnerRoles`, `MoveContext.role`, and `roleForSeat` are all in role-space (`"X"`/`"O"`). The user↔role mapping lives entirely on the server, and bot seats are just roles whose seat carries a difficulty.
- **The slug constant lives only in `@kyzen/shared/constants`.** `meta.ts` and `engine.ts` import `TIC_TAC_TOE` from `@kyzen/shared/constants` (`packages/shared/src/constants/games.ts`); it is never redeclared in a per-game file. `GameMeta.type` is `GameType` (not `string`); the shared `GAME_TYPES` tuple and the `GAMES` array must stay in sync - the conformance suite's `"GAME_TYPES matches the registry exactly"` test enforces this.
- **`meta.type` must equal `engine.type`, and types must be globally unique.** Both are enforced by conformance; both feed the `byType` registry key.
- **`roleForSeat` must be total and distinct.** The server seats by index (`engine.roleForSeat(players.length)`), so every index up to `maxPlayers` needs its own role.
- **Hidden information belongs to the engine.** Never rely on clients ignoring fields: anything a viewer must not see is removed by `publicState` / `publicMove`.
- **Failures are values, not throws** - in `reduce` (`ReduceResult.error`). The *registry* is the exception: `getDefinition` throws on an unknown type because that's a bug, not a runtime condition.
- **Registry generics are erased to `unknown`.** `getEngine` / `GAMES` give you `unknown` State/Input; narrow at the boundary by parsing through the definition's Zod schemas before touching the engine.
- **`createInitialState` must allocate fresh state.** Returning a shared/mutable singleton breaks the "fresh object each call" invariant and would let one game's state leak into another.
- **Adding a game = append to `GAMES` + a definition folder.** No comments anywhere (repo-wide rule); write self-documenting code.

## Where to go next

- [./README.md](./README.md) - architecture overview and index of these docs
- [./games-core-schemas.md](./games-core-schemas.md) - the strict Zod schema layer (`stateSchema` / `moveSchema` / `configSchema`) and wire DTOs that this engine layer is paired with
- [./games-client.md](./games-client.md) - registered React boards receive state and a move callback. The shared play session manages room events and reconnects over the application socket.
- [./realtime.md](./realtime.md) - the Socket.IO game lane and the turn-based handlers (`apps/server/src/realtime/turn-based.ts`) that call the engine authoritatively
- [./database-schema.md](./database-schema.md) - the generic `game` / `move` / `game_player` tables and the JSONB `game_state` column the engine's state is persisted to
- [./server-api.md](./server-api.md) - the Hono API layer, including `GET /api/games/:gameId`
- [./web.md](./web.md) - the Next.js lobby and play routes driven by `listGameMeta()` / `getDefinition()`
