# The Generic Game Schema — How One Schema Fits Every Game

## What this is / why it matters

Every game in the lobby — tic-tac-toe today, anything else tomorrow — stores its state in exactly the same three Postgres tables: `game`, `move`, and `game_player`. There are no per-game tables. This page explains **how that model works in practice**: what each column holds, how the `GameDefinition` from `packages/games-core` determines the shape of the JSONB blobs, and what a real game looks like in the database row-by-row.

If you want to know how the Drizzle declarations look, see [`database-schema.md`](./database-schema.md). If you want to understand the Zod schemas that own the blob shapes, see [`games-core-schemas.md`](./games-core-schemas.md). This page is the bridge between the two.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/db/schema.ts:98` | `game` table declaration |
| `apps/server/src/db/schema.ts:123` | `move` table declaration |
| `apps/server/src/db/schema.ts:138` | `game_player` table declaration |
| `packages/games-core/src/definition.ts` | `GameDefinition<S,I,C>` — the self-describing game unit |
| `packages/games-core/src/engine.ts` | `GameEngine<State,Input>` — the `reduce` contract |
| `packages/games-core/src/games/tic-tac-toe/schemas.ts` | The Zod schemas that own tic-tac-toe's blob shapes |
| `packages/games-core/src/games/tic-tac-toe/engine.ts` | The authoritative move reducer |
| `apps/server/src/realtime/turn-based.ts` | The driver that ties the three together: validate → reduce → persist |

## The three tables and what goes in them

```
┌────────────────────────────────────────────────────────────────┐
│  game                                                          │
│  id (uuid PK)                                                  │
│  game_type   → "tic-tac-toe"  (looks up the GameDefinition)   │
│  status      → "waiting" | "active" | "completed" | …         │
│  game_state  → JSONB  ← stateSchema owns its shape            │
│  config      → JSONB  ← configSchema owns its shape           │
│  conversation_id (nullable FK)                                 │
└──────────────────────────────┬─────────────────────────────────┘
                               │ 1:N
         ┌─────────────────────┴─────────────────────┐
         ▼                                           ▼
┌────────────────────────┐          ┌────────────────────────────┐
│  game_player           │          │  move                      │
│  id (uuid PK)          │          │  id (uuid PK)              │
│  game_id (FK→game)     │          │  game_id (FK→game)         │
│  user_id (FK→user)     │          │  user_id (FK→user)         │
│  role  → "X" | "O"    │          │  move_number (sequential)  │
│  seat_order (int)      │          │  move_data  → JSONB        │
│  joined_at (timestamp) │          │              ← moveSchema  │
└────────────────────────┘          │  created_at                │
                                    └────────────────────────────┘
```

Every JSONB column — `game_state`, `config`, `move_data` — is declared as `jsonb(...).$type<unknown>()`. The database stores bytes; it never inspects or validates the shape. The shape contract lives entirely in the game's Zod schemas inside `packages/games-core`.

## How a `GameDefinition` maps to the columns

Every registered game exports one `GameDefinition<S, I, C>` (`packages/games-core/src/definition.ts`):

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

The mapping to the database is direct:

| `GameDefinition` field | Column it populates | When |
| --- | --- | --- |
| `meta.type` (e.g. `"tic-tac-toe"`) | `game.game_type` | At game creation |
| `configSchema.parse(config)` | `game.config` | At game creation (validated before write) |
| `engine.createInitialState(seats)` result | `game.game_state` | When the last seat fills |
| `stateSchema.safeParse(row.gameState)` | reads `game.game_state` | Before every `reduce` call |
| `moveSchema.safeParse(payload.moveData)` result | `move.move_data` | After `reduce` accepts the move |
| `engine.roles[joinOrder]` | `game_player.role` | When each player joins |

The engine and its Zod schemas are the same code the web client imports (`apps/web` → `@gamelobby/games-core`) — the server never has a separate validation step. Zod is the single source of truth for what's a valid `game_state` or `move_data`.

## Worked example — tic-tac-toe in the database

Tic-tac-toe's schemas (`packages/games-core/src/games/tic-tac-toe/schemas.ts`):

```ts
export const ticTacToeStateSchema = z.object({
  board: z.array(cellSchema).length(9),
  currentTurn: markSchema,
}).strict();

export const ticTacToeMoveSchema = z.object({
  row: z.number().int().min(0).max(2),
  col: z.number().int().min(0).max(2),
}).strict();

export const ticTacToeConfigSchema = z.object({}).strict();
```

`cellSchema = z.enum(["X", "O"]).nullable()`, `markSchema = z.enum(["X", "O"])`.

The engine (`packages/games-core/src/games/tic-tac-toe/engine.ts`):

```ts
readonly type = "tic-tac-toe";
readonly mode = "turn-based";
readonly minPlayers = 2;
readonly maxPlayers = 2;
readonly roles = ["X", "O"] as const;
```

### Phase 1 — game created (status: `"waiting"`)

Alice creates a game. One row appears; `game_state` is `null` because `createInitialState` has not run yet — the game needs both seats.

```
game row
  id           : "g-001"
  game_type    : "tic-tac-toe"
  status       : "waiting"
  game_state   : null
  config       : {}
```

`config` is `{}` — the result of `ticTacToeConfigSchema.parse({})`. An empty object is still a legal value; it occupies the column so future games that **do** use config (e.g. a board-size setting) write their validated config here.

### Phase 2 — Alice joins (seat 0, role `"X"`)

The server runs `engine.roles[players.length]` before Alice is inserted (`apps/server/src/realtime/turn-based.ts:53`). `players.length` is `0` at this moment, so `roles[0]` → `"X"`.

```
game_player row
  id         : "gp-001"
  game_id    : "g-001"
  user_id    : "u-alice"
  role       : "X"
  seat_order : 0
```

### Phase 3 — Bob joins, last seat fills (status: `"active"`)

`roles[1]` → `"O"`. The last-seat branch fires. The driver calls `engine.createInitialState([{ role: "X" }, { role: "O" }])` (`turn-based.ts:64`) and writes the result into `game.game_state`. Status flips to `"active"`.

```
game_player row
  id         : "gp-002"
  game_id    : "g-001"
  user_id    : "u-bob"
  role       : "O"
  seat_order : 1

game row (updated)
  status     : "active"
  game_state : { "board": [null,null,null,null,null,null,null,null,null],
                 "currentTurn": "X" }
```

The nine-element `board` array is index-mapped as `board[row * 3 + col]`. All `null` means unclaimed.

### Phase 4 — Alice plays `{ row: 0, col: 0 }`

`handleMakeMove` (`turn-based.ts:120`) runs the full validate → reduce → persist cycle:

1. **Parse the move** — `def.moveSchema.safeParse({ row: 0, col: 0 })` → ok.
2. **Parse the stored state** — `def.stateSchema.safeParse(row.gameState)` → ok.
3. **Authoritative reduce** — `def.engine.reduce(state, { role: "X", userId: "u-alice" }, { row: 0, col: 0 })`.
   - Checks `ctx.role === state.currentTurn` → `"X" === "X"` ✓
   - Checks `board[0]` is `null` ✓
   - Returns `{ board: ["X",null,…], currentTurn: "O" }`.
4. **Insert move** — `games.addMove(...)`. A new `move` row.
5. **Update game** — `games.updateGame(...)` with the new `game_state`.

```
move row
  id          : "m-001"
  game_id     : "g-001"
  user_id     : "u-alice"
  move_number : 1
  move_data   : { "row": 0, "col": 0 }

game row (updated)
  game_state  : { "board": ["X",null,null,null,null,null,null,null,null],
                  "currentTurn": "O" }
```

### Phase 5 — Bob plays `{ row: 1, col: 1 }`, Alice wins with `{ row: 0, col: 1 }`, `{ row: 0, col: 2 }`

After Alice's winning move the `ReduceResult` carries `outcome: { winner: "X" }`. The driver flips `status` to `"completed"` and bumps player stats.

```
game row (final)
  status     : "completed"
  game_state : { "board": ["X","X","X","O",null,null,null,"O",null],
                 "currentTurn": "X" }
```

The final `game_state` is stored exactly as `reduce` returned it — a stable snapshot of the terminal position. The `move` table now has four rows (move_numbers 1–4), one per play, each carrying the raw `{ row, col }` input. You can replay the game by re-running `reduce` over each `move_data` in `move_number` order.

## The same tables for different game types

To show that the schema is genuinely generic, here is how three hypothetical games would populate the same rows. None of these are implemented — they are illustrations only.

### Connect Four (illustrative)

A 6×7 board; players drop discs into columns. State tracks the grid and whose turn it is; a move is just a column index.

```
game row
  game_type  : "connect-four"
  config     : { "rows": 6, "cols": 7 }    ← configSchema owns shape
  game_state : { "grid": [[null,…]×6×7],
                 "currentTurn": "Red" }

move row
  move_data  : { "col": 3 }                 ← moveSchema owns shape
```

The `game` / `move` / `game_player` DDL is unchanged. The `rows` × `cols` config variant is validated before it's written and re-validated before `reduce` runs — the DB never needs to know the board is not 3×3.

### Nim (illustrative)

Three piles of sticks; players take any number from one pile. State is the pile sizes; a move is `{ pile, take }`.

```
game row
  game_type  : "nim"
  config     : {}
  game_state : { "piles": [3, 5, 7], "currentTurn": "A" }

move row
  move_data  : { "pile": 1, "take": 2 }
```

Different domain, different blob shape — same three tables.

### Rock-Paper-Scissors (illustrative, simultaneous)

Both players submit their choice before either sees the result. This game uses `mode: "realtime"` and an engine `step` function rather than `reduce`. The server collects inputs for a tick, then resolves.

```
game row
  game_type  : "rock-paper-scissors"
  game_state : { "round": 1,
                 "scores": { "A": 0, "B": 0 },
                 "pendingInputs": {} }

move row (player A's submit)
  move_data  : { "choice": "rock" }

move row (player B's submit, same tick)
  move_data  : { "choice": "scissors" }
```

After `step` resolves the tick, a new `game_state` is written with the outcome and `pendingInputs` cleared. The `move` table still gets one row per input — it is an audit log regardless of mode.

## What is fixed vs. what each game owns

| Fixed by the schema | Owned by the `GameDefinition` |
| --- | --- |
| Three tables, always | Shape of `game_state` JSONB |
| Sequential, dense `move_number` | Shape of `move_data` JSONB |
| One `game_player` row per seat | Shape of `config` JSONB |
| `role` is a `text` column | The role strings (`"X"/"O"`, `"Red"/"Blue"`, …) |
| `status` transitions (`waiting` → `active` → `completed`) | Win condition, draw condition, illegal-move logic |
| `cascade` delete: drop a game, drop its moves and players | `createInitialState` + `reduce`/`step` |
| Unique `(gameId, moveNumber)` — no double-submits | Tick rate, simultaneous-move resolution |

## Edge cases the model absorbs

**Hidden information.** The server stores the *complete* game state in `game_state`, including cards dealt to each player. Before broadcasting `game_state` to the room, a game can implement a `serialize(state, forRole)` projection that strips the parts the role should not see. The DB holds the full truth; the wire holds only what each seat is allowed to know.

**Randomness and shuffles.** Shuffled decks, dice rolls, and other randomness live inside `createInitialState` or `reduce` — they are computed at the app layer and stored in `game_state`. The DB receives a deterministic snapshot; randomness never reaches the schema.

**Config-driven variants.** Board size, time limits, house rules — all go in `config` (validated by `configSchema` before the row is inserted). The `configFields` array on `GameDefinition` tells the lobby UI which form fields to render without the server needing to know the specifics.

**Replaying history.** Because `move` is an append-only log keyed by `(gameId, moveNumber)` and each `move_data` is the raw input (not a diff), any game can be replayed from `createInitialState` by folding `reduce` over the move log in order. The final `game_state` column is a materialized cache of that fold — it lets the server skip re-playing the full history on every move.

## The lifecycle at a glance

```
client creates game
  → server inserts game row (status: "waiting", game_state: null)

each player joins
  → role = engine.roles[current player count]    (turn-based.ts:53)
  → insert game_player row (role, seat_order)
  → if last seat:
      state = engine.createInitialState(seats)    (turn-based.ts:64)
      update game row (status: "active", game_state: state)

client emits make_move { gameId, moveData }
  → def.moveSchema.safeParse(moveData)            (turn-based.ts:135)
  → def.stateSchema.safeParse(row.gameState)      (turn-based.ts:138)
  → result = def.engine.reduce(state, ctx, input) (turn-based.ts:143)
  → insert move row (move_data, move_number)      (turn-based.ts:150)
  → update game row (game_state: result.state)    (turn-based.ts:158)
  → if outcome: update status, bump stats

server broadcasts move_made + game_state to room  (turn-based.ts:161)
```

## Gotchas & invariants

- **`game_state` is `unknown` until `safeParse`'d.** Read the raw row and you have bytes. The repository hands you an `unknown`; the caller is responsible for parsing it through the game's Zod schema before passing it to the engine.
- **`move_number` is dense and DB-enforced.** `move_game_number_uq` on `(gameId, moveNumber)` rejects a double-submit at the constraint level — the server does not need an advisory lock.
- **Role assignment is join-order-dependent.** `engine.roles[players.length]` is evaluated *before* the new `game_player` row is inserted. The first player to join gets `roles[0]`; the last gets `roles[N-1]`. You cannot choose your role.
- **`createInitialState` fires exactly once.** The driver calls it only when the last seat fills and `status` transitions to `"active"`. Any subsequent read of `game_state` starts from that baseline.
- **No per-game tables, ever.** If you find yourself thinking "I need a `connect_four_state` column," the answer is: add it to the state schema and let it live in `game_state`.

## Where to go next

- [`./database-schema.md`](./database-schema.md) — the Drizzle declarations for the three tables: column types, `$type<T>()` semantics, indexes, and `$inferSelect` row types.
- [`./database.md`](./database.md) — how the repositories read and write these tables: the `GameRecord` join, keyset pagination, and the persist-a-move data flow.
- [`./games-core-schemas.md`](./games-core-schemas.md) — `GameDefinition<S,I,C>`, the Zod `stateSchema` / `moveSchema` / `configSchema` that own the blob shapes, and the `.strict()` + `z.infer` discipline.
- [`./games-core-engine.md`](./games-core-engine.md) — the `GameEngine` contract, how `reduce` works, and the turn-based vs. realtime split.
- [`./realtime.md`](./realtime.md) — the Socket.IO driver that orchestrates validate → reduce → persist on every move.
- [`./README.md`](./README.md) — the architecture index.
