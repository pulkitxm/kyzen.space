# games-core: Engine, Registry & the GAMES Array

## What this is / why it matters

`@gamelobby/games-core` is the **framework-agnostic brain** of every game in the lobby. It is now **logic-only**: it contains no React, no Express, no socket code — just the concrete engines and a registry that turns a single hand-written array of game definitions into all the lookups the rest of the monorepo needs. The *contracts* it builds on — the `GameEngine<State, Input>` interface, the `GameDefinition` shape, and every game's strict Zod schemas + inferred types — live in **`@gamelobby/shared/types`**. games-core declares `@gamelobby/shared` as its only dependency and imports those types/schemas from there (`packages/games-core/package.json:14`).

This document covers the **logic + registry layer** specifically:

- **The `GameEngine<State, Input>` contract** (`packages/shared/src/types/games/engine.ts`) — `createInitialState`, `reduce` (turn-based), `step` (realtime), and the static descriptors `mode` / `roles` / `minPlayers` / `maxPlayers`.
- **A concrete engine** — tic-tac-toe's pure `reduce()` (in games-core): turn enforcement, win/draw detection, and an immutable next-state.
- **The assembly** — how `schemas + engine + meta` become one `GameDefinition`.
- **The single `GAMES` array** and the `registry.ts` lookups derived from it.
- **The conformance suite** — the invariants every game in `GAMES` is forced to satisfy.

Why it matters: because this code (and the shared contracts it builds on) is **pure and React-free, the same code runs on both sides of the wire**. The Next.js client imports `getDefinition()` to drive its UI; the Bun/Socket.IO server imports the *exact same* `getDefinition()` to authoritatively validate and apply moves. The client is never trusted — every move a client sends is re-validated against the engine's Zod schemas and re-run through the engine's `reduce()` on the server. The engine is the single source of truth, and the `reduce()` purity/determinism contract (below) is what makes that trust safe.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/types/games/engine.ts` | (shared) The `GameEngine<State, Input>` interface + the `Outcome` / `ReduceResult` / `StepResult` / `Seat` / `MoveContext` types |
| `packages/shared/src/types/games/definition.ts` | (shared) `GameDefinition` (engine + schemas + meta) and `GameMeta` / `ConfigField` types |
| `packages/shared/src/types/games/core.ts` | (shared) `gameTypeSchema` + the `GameType` union, derived from the `GAME_TYPES` tuple in `packages/shared/src/constants/games.ts` (which also defines the `TIC_TAC_TOE` slug) — **the single source of truth for every game's type id** |
| `packages/shared/src/types/games/tic-tac-toe/schemas.ts` | (shared) Strict Zod `stateSchema` / `moveSchema` / `configSchema`; TS types derived via `z.infer`. |
| `packages/games-core/src/games/tic-tac-toe/engine.ts` | Concrete pure engine: `createInitialState`, `reduce`, win/draw helpers |
| `packages/games-core/src/games/tic-tac-toe/meta.ts` | Display metadata (`name`, `description`, `categoryId`, `coverImage`) |
| `packages/games-core/src/games/tic-tac-toe/index.ts` | Assembles the four pieces into one `ticTacToeDefinition` |
| `packages/games-core/src/games/index.ts` | **The single `GAMES` array** — the one place every game is registered |
| `packages/shared/src/constants/categories.ts` | (shared) `GAME_CATEGORIES` object/record used for grouping in lobby UI |
| `packages/games-core/src/registry.ts` | Derives `byType` Map + `getDefinition` / `getEngine` / `hasEngine` / `listGameMeta` / `getCategoryGroups` from `GAMES` |
| `packages/games-core/src/index.ts` | Public barrel — re-exports the registry functions, `GAMES`, per-game engine symbols, and the `playing-cards/svg` card-rendering helpers (`CARD_WIDTH`/`cardSvg`/`jokerSvg`/…) (types/schemas come from `@gamelobby/shared/types`) |
| `packages/games-core/tests/conformance.test.ts` | Invariant suite run against *every* entry in `GAMES` |
| `packages/games-core/tests/tic-tac-toe.test.ts` | Focused engine tests for tic-tac-toe |
| `apps/server/src/realtime/turn-based.ts` | The server consumer — proves how the engine is trusted to validate/apply moves |

## The `GameEngine` contract

Everything starts with `engine.ts`. The whole file is small enough to read in one sitting, and that's deliberate — the contract is intentionally minimal.

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

These types (`packages/shared/src/types/games/engine.ts:1`) are the vocabulary of the whole system:

- **`Outcome`** is a discriminated union on `status`. A game is either `"active"` or `"completed"`. When completed, `draw` distinguishes a tie from a win, and `winnerRole` names the winning *role* (e.g. `"X"`), **not** a user id — the engine knows nothing about users, sessions, or the database. Mapping a `winnerRole` back to a `userId` is the server's job, and it does exactly that in `apps/server/src/realtime/turn-based.ts:83`.
- **`ReduceResult<State>`** is a result type, not an exception. A rejected move is a value (`{ ok: false, error }`), so the caller must explicitly handle failure — there's no throwing across the move path.
- **`MoveContext`** is the *trusted* context the server attaches: the role of the player making the move. The engine never has to figure out "who is this" — the server resolves the authenticated user to a seat/role first, then passes `{ role }` in.

The interface itself:

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

`packages/shared/src/types/games/engine.ts:15`. Key design points:

- **Two static identities of a game live here**: its `type` string (the registry key, e.g. `"tic-tac-toe"`) and its seating shape (`minPlayers`, `maxPlayers`, `roles`). The server reads `roles[players.length]` to assign the next seat (`apps/server/src/realtime/turn-based.ts:58`) and compares `players.length` against `minPlayers` / `maxPlayers` to decide when a game can start or is full (`apps/server/src/realtime/turn-based.ts:45`, `:61`).
- **`reduce` and `step` are both optional, and the `mode` field says which one to expect.** A `"turn-based"` game implements `reduce` (one player acts, state advances by one move); a `"realtime"` game would implement `step` (all queued inputs applied per tick, with `tickRate`). Today every game is turn-based, and the only server driver is the turn-based one — see [./realtime.md](./realtime.md). The conformance suite enforces the pairing (below).
- **`State` and `Input` are generic** so each engine is precisely typed, but the registry erases them to `unknown` (more on that under "Type erasure" below).

## A concrete engine: tic-tac-toe `reduce()`

`packages/games-core/src/games/tic-tac-toe/engine.ts` is the reference implementation new games should imitate. First the pure helpers — note these are exported so tests (and any other consumer) can use them directly:

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
  roles: ["X", "O"],

  createInitialState(_seats: Seat[]): TicTacToeState {
    return { board: emptyBoard(), currentTurn: "X" };
  },
```

(`packages/games-core/src/games/tic-tac-toe/engine.ts:59`). `createInitialState` ignores the seats here (tic-tac-toe's roles are fixed), but the parameter exists because other games need it — e.g. to randomize which seat is which role. Critically, it builds a **fresh** object every call (`emptyBoard()` allocates a new array at `:27`); the conformance suite checks this.

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

(`packages/games-core/src/games/tic-tac-toe/engine.ts:70`). Read it as a gauntlet of guards — every illegal situation is rejected as data *before* any state changes:

1. **Terminal check** — no moves after the game is decided.
2. **Role membership** — `ctx.role` must be a real role for this game.
3. **Turn check** — it must be that role's turn (`currentTurn`).
4. **Schema re-validation** — even though the server already validated `moveData` against `moveSchema`, the engine validates again. The engine never assumes its caller pre-checked anything; it owns its own correctness.
5. **Game-rule check** — the target cell must be empty.

Only after all guards pass does it produce the next state — and it does so **immutably**: `const board = [...state.board]` copies the array, the mutation lands on the copy, and a brand-new state object is returned. The input `state` is never touched. This is the single most important property in the package, so it gets its own section.

### The `reduce()` purity/determinism contract

`reduce` must be a **pure function**: `(state, ctx, input) -> ReduceResult`. Concretely the contract is:

- **No mutation of inputs.** The input `state` must be byte-for-byte unchanged after the call. Tic-tac-toe achieves this by copying before writing (`:90`). The conformance suite snapshots state with `JSON.parse(JSON.stringify(...))` and asserts equality afterward (`packages/games-core/tests/conformance.test.ts:82`), and the focused suite repeats it (`packages/games-core/tests/tic-tac-toe.test.ts:110`).
- **Determinism.** Same `(state, ctx, input)` ⇒ same result, every time. No `Date.now()`, no `Math.random()`, no network, no DB. (If a game needs randomness it must be seeded *into* the state by `createInitialState` and carried forward deterministically — never sampled inside `reduce`.)
- **Total over its result type.** Every branch returns a `ReduceResult`; failures are `{ ok: false, error }`, never thrown exceptions.

Why this matters so much: the server treats `reduce()` as the **authority**. It loads the stored state from Postgres, runs `reduce`, and if `ok`, persists `result.state` and broadcasts it. Because `reduce` is pure and deterministic, the server can trust that:

- It is reproducible — replaying the move log from the initial state yields the same state.
- It is safe to run against client-supplied input — the engine's guards + schema parse reject anything malformed or illegal, so a malicious client cannot place two marks, move out of turn, overwrite a cell, or move after the game ends.
- Client and server agree — the client can predict the next state with the same engine the server will authoritatively apply, so optimistic UI stays consistent.

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
}
```

The three generics line up: `S` = State, `I` = Input/Move, `C` = Config, and each Zod schema is typed `ZodType<S>` / `ZodType<I>` / `ZodType<C>` so the schema and the engine cannot drift apart at the type level. The meta (`packages/games-core/src/games/tic-tac-toe/meta.ts:4`) is pure display data — `name`, `description`, `categoryId`, `coverImage` — with `categoryId` referencing an id in `GAME_CATEGORIES` (`packages/shared/src/constants/categories.ts:4`). `configFields` describes the lobby's config form; tic-tac-toe has none, so it's `[]`.

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

(`packages/games-core/src/games/tic-tac-toe/index.ts:13`). The explicit `GameDefinition<TicTacToeState, TicTacToeMove, TicTacToeConfig>` annotation is what makes TypeScript verify the engine's `State`/`Input` match the schemas' inferred types. The Zod types are themselves *derived from* the schemas via `z.infer` (`packages/shared/src/types/games/tic-tac-toe/schemas.ts:15`, `:23`, `:26`) — the schema is the source, the TS type is a projection of it. See [./games-core-schemas.md](./games-core-schemas.md) for the schema layer in depth.

## The single `GAMES` array

This is the design decision the whole package hinges on. There is exactly **one** place every game is registered (`packages/games-core/src/games/index.ts`):

```ts
import type { GameDefinition } from "@gamelobby/shared/types";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES = [ticTacToeDefinition] satisfies GameDefinition[];
```

That's the entire file. Adding a game is appending one element to this array (after building its definition folder). No new route, endpoint, DB table, socket event, or driver — see [./README.md](./README.md) and `docs/adding-a-game.md`. Everything downstream is **derived** from `GAMES`, so a new entry automatically appears in the lobby, gets a working move pipeline, and is covered by the conformance suite.

## The registry: lookups derived from `GAMES`

`registry.ts` builds one index and exposes typed accessors over it. The index:

```ts
const byType: Map<string, GameDefinition> = new Map(
  GAMES.map((def) => [def.meta.type, def]),
);
```

(`packages/games-core/src/registry.ts:11`). Keying by `def.meta.type` is why `meta.type` must equal `engine.type` — the conformance suite enforces that (below), so a mismatch would mean the registry key and the engine's self-reported type disagree.

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

- **`hasEngine` is a type guard** — `hasEngine(type: string): type is GameType` narrows a raw string to the `GameType` union when the check passes. The server uses it as a soft "is this a real game?" check before creating a game.
- **`getDefinition` throws on an unknown type** — a missing game is a programming error, not a recoverable condition. (It still accepts `string` as a defensive DB-boundary measure, since the `gameType` column is `text` in Postgres.) The focused test pins the message: `getEngine("chess")` throws `"Unknown game type: chess"` (`packages/games-core/tests/tic-tac-toe.test.ts:332`).
- **`getEngine` erases the generics to `GameEngine<unknown, unknown>`.** See "Type erasure" below.
- **`listGameMeta()` / `listGameTypes()` / `listDefinitions()`** are simple maps over `GAMES` (`packages/games-core/src/registry.ts:29`–`:39`) — the lobby UI calls `listGameMeta()` to render the catalog. `listGameTypes()` returns `GameType[]`, not `string[]`, and is keyed off `def.meta.type` (which is itself `GameType`).

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

Each `GameDefinition` is precisely generic (`<TicTacToeState, TicTacToeMove, TicTacToeConfig>`), but the moment definitions land in a heterogeneous `GameDefinition[]` array, their distinct generics have to unify — so `GAMES` is typed `GameDefinition[]` (i.e. `GameDefinition<unknown, unknown, unknown>`), and `getEngine` returns `GameEngine<unknown, unknown>`. That's the right trade-off: at a *call site* you only know the `type` string at runtime, so you can't statically know which `State`/`Input` you'll get. The server therefore **re-narrows at the edge** by parsing through the definition's own Zod schemas (`def.moveSchema.safeParse`, `def.stateSchema.safeParse`) before calling `reduce` — Zod restores the type guarantee the array erased. This is the practical reason the schemas live *inside* the definition next to the engine.

## End-to-end: how a move flows through the engine (server-authoritative)

This is the payoff of the whole design — the same engine that informs the client is the thing that validates the move on the server. Walkthrough of a `make_move`, all in `apps/server/src/realtime/turn-based.ts`:

1. **Client emits `make_move`** with `{ gameId, moveData }`. `handleMakeMove` runs → `apps/server/src/realtime/turn-based.ts:125`.
2. **Load + gate** → it reads the authenticated `userId` from `socket.data`, validates the `gameId` shape, loads the `GameRecord` from Postgres, and rejects if the game isn't `active` (`:130`–`:135`).
3. **Resolve the seat** → `gameRow.players.find((p) => p.userId === userId)` maps the trusted user to a `role`; not seated ⇒ rejected (`:137`). The user→role mapping is the server's, never the client's.
4. **Look up the definition by type** → `const def = getDefinition(gameRow.gameType)` (`:140`) — the same registry call the web app uses, importing the identical games-core code. A turn-based game must expose `reduce`; a missing one ⇒ `"Game does not accept moves"` (`:141`).
5. **Validate the untrusted input** → `def.moveSchema.safeParse(payload.moveData)` (`:143`). Malformed ⇒ `"Invalid move"`, never reaches the engine.
6. **Validate the stored state** → `def.stateSchema.safeParse(gameRow.gameState)` (`:145`). This both re-narrows the JSONB blob to the engine's `State` type and guards against a `"Corrupt game state"`.
7. **Run the authoritative `reduce`** → `def.engine.reduce(parsedState.data, { role: player.role }, parsedMove.data)` (`:148`). The engine re-applies every rule (turn, occupancy, terminal) independently. `!result.ok` ⇒ the engine's own `error` string is sent straight back (`:153`).
8. **Persist + broadcast** → on success, append the move (`:156`), `updateGame(..., { gameState: result.state })` (`:163`), then `finalize(updated, result.outcome)` maps `outcome.winnerRole` → `winnerUserId`, marks `completed`/`draw`, and bumps player stats (`:74`–`:101`). Finally it emits `move_made` (`:166`) + `game_state` to the room (`:170`) and, if completed, `game_over` (`:173`).

So the path is: **client `make_move` -> `turn-based.ts:125` -> `getDefinition` `turn-based.ts:140` -> `moveSchema`/`stateSchema` parse `turn-based.ts:143`/`:145` -> `engine.reduce` `turn-based.ts:148` (which itself re-runs `tic-tac-toe/engine.ts:70`) -> persist + broadcast.** The client supplied data; the engine decided truth.

The seating side mirrors this: `ensureSeated` reads `engine.maxPlayers` to know if a seat is free, `engine.roles[players.length]` to assign the next role, and `engine.minPlayers` to flip the game to `active` (`apps/server/src/realtime/turn-based.ts:43`–`:72`). Its `gameState ?? engine.createInitialState(...)` line is a fallback only — the creator's seat already minted the starting state at creation (`apps/server/src/chat/games-in-chat-service.ts:75`).

## The conformance suite: invariants every game must satisfy

`packages/games-core/tests/conformance.test.ts` is generic — it loops over `GAMES` and asserts the contract for each one, so a new game is tested the moment it's added to the array (no per-game wiring). The invariants:

- **Registry sanity** — `GAMES` is non-empty and all `meta.type` values are unique (`:17`). Uniqueness must hold or the `byType` Map would silently collide.
- **`GAME_TYPES` matches the registry exactly** (`:23`) — `[...GAME_TYPES].sort()` must equal `listGameTypes().sort()`, so the shared `GAME_TYPES` tuple (`packages/shared/src/constants/games.ts`) and the `GAMES` array can never drift (added with the registry-typed `gameType` work).
- **`meta.type === engine.type`** (`:30`) — the registry key and the engine's self-id must agree.
- **Coherent player bounds** (`:34`) — `minPlayers >= 1`, `maxPlayers >= minPlayers`, and `roles.length >= maxPlayers` (there must be a distinct role for every possible seat — this is what makes `roles[players.length]` safe on the server).
- **Mode/handler pairing** (`:44`) — `turn-based` ⇒ `reduce` is a function; otherwise `step` is.
- **Initial state validates** (`:52`) — `createInitialState(minSeats(def))` must pass `stateSchema.safeParse`. So the engine cannot emit a state its own schema would reject.
- **Fresh state each call** (`:58`) — two `createInitialState` calls return non-identical objects (`a !== b`); no shared mutable singletons.
- **`moveSchema` rejects junk** (`:64`) — `undefined`, a string, and a bogus object all fail to parse.
- **`configSchema` accepts the declared defaults** (`:72`) — building a config object from each `configFields[].default` must parse, so the lobby's default form is always valid.
- **`reduce` does not mutate input state** (`:79`) — the purity check described above, asserted for every turn-based game.
- **`meta.categoryId` is a known category** (`:90`) — every game's `categoryId` joins to an id in `GAME_CATEGORIES`.
- **`roles` has no duplicates** (`:94`) — each declared role is distinct.
- **`coverImage`, when set, is a `/games/` path** (`:98`) — cover art lives under `public/games/`.

Here is the helper that makes the suite game-agnostic, plus the mutation invariant:

```ts
function minSeats(def: GameDefinition): Seat[] {
  return def.engine.roles
    .slice(0, def.engine.minPlayers)
    .map((role) => ({ role }));
}
```

```ts
    test("turn-based reduce does not mutate the input state", () => {
      if (def.engine.mode !== "turn-based" || !def.engine.reduce) return;
      const state = def.engine.createInitialState(minSeats(def));
      const snapshot = JSON.parse(JSON.stringify(state));
      const role = def.engine.roles[0];
      expect(role).toBeDefined();
      if (role === undefined) throw new Error("engine must declare a role");
      def.engine.reduce(state, { role }, {} as never);
      expect(state).toEqual(snapshot);
    });
```

(`packages/games-core/tests/conformance.test.ts:10` and `:79`). Note the empty `{}` move: a game must remain immutable even when handed a clearly-invalid input — proof that the guards reject *before* mutating.

The focused `tests/tic-tac-toe.test.ts` complements this with game-specific behavior: turn/role enforcement (`:64`), out-of-bounds and occupied-cell rejection (`:90`), all 8 win lines (`:118`), draw detection (`:188`), no-move-after-win (`:255`), and registry resolution (`:322`). New games should add a similar focused suite — conformance proves the contract, the focused suite proves the *rules*.

## Gotchas, invariants & conventions

- **No React, no I/O in this package — ever.** games-core is imported by the server, which has no DOM and must stay React-free. Keep game UI in `@gamelobby/games-client` (see [./games-client.md](./games-client.md)) and logic here.
- **`reduce` must be pure and deterministic.** No mutation of `state`/`input`, no `Date.now`/`Math.random`/network/DB. Copy-then-write; return a fresh state object. The server's trust model depends on it.
- **The engine validates everything itself.** Don't rely on the caller having pre-validated. tic-tac-toe re-runs `moveSchema.safeParse` *inside* `reduce` (`packages/games-core/src/games/tic-tac-toe/engine.ts:80`) even though the server already parsed — defense in depth, and it keeps the engine correct in isolation (tests call `reduce` directly).
- **Roles are not users.** `Outcome.winnerRole`, `MoveContext.role`, and `engine.roles` are all in role-space (`"X"`/`"O"`). The user↔role mapping lives entirely on the server (`apps/server/src/realtime/turn-based.ts:83`, `:137`).
- **The slug constant lives only in `@gamelobby/shared/constants`.** `meta.ts` and `engine.ts` import `TIC_TAC_TOE` from `@gamelobby/shared/constants` (`packages/shared/src/constants/games.ts`); it is never redeclared in a per-game file. `GameMeta.type` is `GameType` (not `string`); the shared `GAME_TYPES` tuple and the `GAMES` array must stay in sync — the conformance suite's `"GAME_TYPES matches the registry exactly"` test enforces this.
- **`meta.type` must equal `engine.type`, and types must be globally unique.** Both are enforced by conformance; both feed the `byType` registry key.
- **`roles.length >= maxPlayers`.** The server seats by index (`engine.roles[players.length]`), so there must be a role for each seat. Conformance guards it (`packages/games-core/tests/conformance.test.ts:39`).
- **Failures are values, not throws** — in `reduce` (`ReduceResult.error`). The *registry* is the exception: `getDefinition` throws on an unknown type because that's a bug, not a runtime condition.
- **Registry generics are erased to `unknown`.** `getEngine` / `GAMES` give you `unknown` State/Input; narrow at the boundary by parsing through the definition's Zod schemas before touching the engine.
- **`createInitialState` must allocate fresh state.** Returning a shared/mutable singleton breaks the "fresh object each call" invariant and would let one game's state leak into another.
- **Adding a game = append to `GAMES` + a definition folder.** No comments anywhere (repo-wide rule); write self-documenting code.

## Where to go next

- [./README.md](./README.md) — architecture overview and index of these docs
- [./games-core-schemas.md](./games-core-schemas.md) — the strict Zod schema layer (`stateSchema` / `moveSchema` / `configSchema`) and wire DTOs that this engine layer is paired with
- [./games-client.md](./games-client.md) — the React UI side that consumes `getDefinition()` / `getGameClient()` and renders the board. A board receives the app's shared Socket.IO connection (the `GameClientProps` contract now carries `socket` + `connected`) and emits `join_room` / `make_move` / `leave_room` over it
- [./realtime.md](./realtime.md) — the Socket.IO game lane and the turn-based driver (`apps/server/src/realtime/turn-based.ts`) that calls the engine authoritatively
- [./database-schema.md](./database-schema.md) — the generic `game` / `move` / `game_player` tables and the JSONB `game_state` column the engine's state is persisted to
- [./server-api.md](./server-api.md) — the Hono API layer, including `GET /api/games/:gameId`
- [./web.md](./web.md) — the Next.js lobby and play routes driven by `listGameMeta()` / `getDefinition()`
