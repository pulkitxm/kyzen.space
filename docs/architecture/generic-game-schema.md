# The Generic Game Schema - How One Schema Fits Every Game

## What this is / why it matters

Every game in the lobby - tic-tac-toe today, anything else tomorrow - stores its state in exactly the same three Postgres tables: `game`, `move`, and `game_player`. There are no per-game tables. This page explains **how that model works in practice**: what each column holds, how the `GameDefinition` from `packages/games-core` determines the shape of the JSONB blobs, and what a real game looks like in the database row-by-row.

If you want to know how the Drizzle declarations look, see [`database-schema.md`](./database-schema.md). If you want to understand the Zod schemas that own the blob shapes, see [`games-core-schemas.md`](./games-core-schemas.md). This page is the bridge between the two.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/database/src/schema.ts:98` | `game` table declaration (`id` UUID PK + public `code`) |
| `packages/database/src/schema.ts:133` | `move` table declaration |
| `packages/database/src/schema.ts:148` | `game_player` table declaration |
| `packages/shared/src/types/games/definition.ts` | `GameDefinition<S,I,C>` - the self-describing game unit |
| `packages/shared/src/types/games/engine.ts` | `GameEngine<State,Input>` - the `reduce` contract |
| `packages/shared/src/types/games/tic-tac-toe/schemas.ts` | The Zod schemas that own tic-tac-toe's blob shapes |
| `packages/games-core/src/games/tic-tac-toe/engine.ts` | The authoritative move reducer |
| `apps/server/src/chat/games-in-chat-service.ts` | Creates the game: seats the creator and runs `createInitialState` at creation |
| `packages/database/src/repositories/games.ts` | `createGame` / `seatPlayer` / `addMove` / `updateGame` - the persistence calls |
| `apps/server/src/realtime/turn-based.ts` | The driver that ties the three together: validate → reduce → persist |

## The three tables and what goes in them

```
┌────────────────────────────────────────────────────────────────┐
│  game                                                          │
│  id (uuid PK)         → internal only, never serialized        │
│  code (text, unique)  → "K7P2QX"  PUBLIC id (URLs + sockets)   │
│  game_type   → "tic-tac-toe"  (looks up the GameDefinition)   │
│  status      → "waiting" | "active" | "completed" | …         │
│  game_state  → JSONB  ← stateSchema owns its shape            │
│  config      → JSONB  ← configSchema owns its shape           │
│  conversation_id (nullable FK)                                 │
│  … winner, creator_user_id, seating_mode, challenged_user_id,  │
│    started_at, completed_at, created_at, updated_at            │
└──────────────────────────────┬─────────────────────────────────┘
                               │ 1:N
         ┌─────────────────────┴─────────────────────┐
         ▼                                           ▼
┌────────────────────────┐          ┌────────────────────────────┐
│  game_player           │          │  move                      │
│  id (uuid PK)          │          │  id (uuid PK)              │
│  game_id (FK→game)     │          │  game_id (FK→game)         │
│  user_id (text)        │          │  player_id (text)          │
│  username (text)       │          │  move_number (sequential)  │
│  role  → "X" | "O"    │          │  move_data  → JSONB        │
│  seat_order (int)      │          │              ← moveSchema  │
│  joined_at (timestamp) │          │  created_at                │
└────────────────────────┘          └────────────────────────────┘
```

Every JSONB column - `game_state`, `config`, `move_data` - is declared as `jsonb(...).$type<unknown>()`. The database stores bytes; it never inspects or validates the shape. The shape contract lives entirely in the game's Zod schemas inside `@gamelobby/shared`.

## Two ids: public `code`, internal `uuid`

A `game` row has **two** identifiers and they serve opposite audiences:

- **`id` (uuid PK)** - the *internal* key. It is the FK target for `move.game_id` and `game_player.game_id`, and every repository write (`addMove`, `updateGame`, `listMoves`, `seatPlayer`) is keyed on it. It is **never serialized to clients**.
- **`code` (text, `unique("game_code_uq")`)** - the *public* key. A short, shareable, human-friendly room code (`GAME_CODE_LENGTH = 6` over the Crockford-base32 `GAME_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"`, which drops I/L/O/U - ~1.07B combinations). It is generated app-side by the column's `$defaultFn(() => generateGameCode())` and is the only game id that crosses the wire.

The seam is `serializeGame` (`apps/server/src/api/serialize.ts:26`), which sets `GameJson.id = row.code`. From there on the **code is the game's identity to clients**: the web builds `/play/<code>`, and the socket `join_room` / `make_move` payloads carry the code as `gameId` (validated by `gameCodeSchema` / `isGameCode`, which `normalizeGameCode` first - uppercasing and mapping I/L→1, O→0 so a typed code is forgiving). The server resolves it back to a row with `games.getGameByCode(code)` (`packages/database/src/repositories/games.ts:96`), then uses `row.id` for all DB work. Because the code is random, `createGame` wraps its insert in a `game_code_uq` collision-retry loop. (Conversations, messages, friendships, users, and profiles are **unchanged** - they keep their UUIDs as the public id; only games moved to codes.)

## How a `GameDefinition` maps to the columns

Every registered game exports one `GameDefinition<S, I, C>` (`packages/shared/src/types/games/definition.ts`):

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
| `engine.createInitialState(seats)` result | `game.game_state` | At game creation (with the creator's seat) |
| `stateSchema.safeParse(row.gameState)` | reads `game.game_state` | Before every `reduce` call |
| `moveSchema.safeParse(payload.moveData)` result | `move.move_data` | After `reduce` accepts the move |
| `engine.roles[seatOrder]` | `game_player.role` | Creator at creation; others on join |

The engine and its Zod schemas are the same code the web client imports (`apps/web` → `@gamelobby/games-core` for the engine, `@gamelobby/shared` for the schemas + types) - the server never has a separate validation step. Zod is the single source of truth for what's a valid `game_state` or `move_data`.

## Worked example - tic-tac-toe in the database

Tic-tac-toe's schemas (`packages/shared/src/types/games/tic-tac-toe/schemas.ts`):

```ts
export const ticTacToeStateSchema = z
  .object({
    board: z.array(cellSchema).length(9),
    currentTurn: markSchema,
  })
  .strict();

export const ticTacToeMoveSchema = z
  .object({
    row: z.number().int().min(0).max(2),
    col: z.number().int().min(0).max(2),
  })
  .strict();

export const ticTacToeConfigSchema = z.object({}).strict();
```

`cellSchema = z.enum(["X", "O"]).nullable()`, `markSchema = z.enum(["X", "O"])`.

The engine (`packages/games-core/src/games/tic-tac-toe/engine.ts`) is a plain object literal that satisfies `GameEngine`:

```ts
export const ticTacToeEngine: GameEngine<TicTacToeState, TicTacToeMove> = {
  type: TIC_TAC_TOE,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 2,
  roles: ["X", "O"],
  createInitialState() { … },
  reduce(state, ctx, input) { … },
};
```

### Phase 1 - Alice creates the game (status: `"waiting"`)

Alice creates the game from a conversation. `createGameInConversation` (`apps/server/src/chat/games-in-chat-service.ts:66`) seats the **creator** as the first player - `firstRole` = `engine.roles[0]` → `"X"` (`const [firstRole] = engine.roles`, `:118`) - and initializes `game_state` in the *same* insert via `engine.createInitialState([{ role: firstRole }])` (`:130`). `createGame` writes the `game` row and the creator's `game_player` row in one transaction (`packages/database/src/repositories/games.ts:29`) and defaults `series_id` to the row's own id (a brand-new game is its own one-game series). So after creation **two** rows already exist:

```
game row
  id           : "g-001"          ← internal uuid (FK target), never serialized
  code         : "K7P2QX"         ← public id: /play/K7P2QX, socket gameId
  game_type    : "tic-tac-toe"
  status       : "waiting"
  game_state   : { "board": [null,null,null,null,null,null,null,null,null],
                   "currentTurn": "X" }
  config       : {}
  series_id    : "g-001"          ← defaults to its own id; a rematch copies it

game_player row
  id         : "gp-001"
  game_id    : "g-001"
  user_id    : "u-alice"
  username   : "alice"
  role       : "X"
  seat_order : 0
```

`game_state` is **not** `null` at creation - `createInitialState` runs immediately, so the board exists before the second player arrives. `status` stays `"waiting"` only because the game still needs a second seat to become `"active"`. `config` is `{}` - the result of `definition.configSchema.safeParse(input.config ?? {})`, validated at `games-in-chat-service.ts:90`. An empty object is still a legal value; it occupies the column so future games that **do** use config (e.g. a board-size setting) write their validated config here.

### Phase 2 - Bob joins, the last seat fills (status: `"active"`)

Bob opens the game and the server seats him through `ensureSeated` (`apps/server/src/realtime/turn-based.ts:33`). `players.length` is `1` now, so his role is `engine.roles[1]` → `"O"` (`turn-based.ts:58`), and `seatPlayer` inserts his row (`:63`). Because `nextPlayers.length` (2) reaches `engine.minPlayers`, the game flips to `"active"` and `startedAt` is set (`:64`–`:66`). `game_state` is **left as-is**: the `gameRow.gameState ?? engine.createInitialState(...)` guard (`:67`–`:69`) keeps the state Alice's creation already minted - `createInitialState` does **not** run again here.

```
game_player row
  id         : "gp-002"
  game_id    : "g-001"
  user_id    : "u-bob"
  username   : "bob"
  role       : "O"
  seat_order : 1

game row (updated)
  status     : "active"
  game_state : { "board": [null,null,null,null,null,null,null,null,null],
                 "currentTurn": "X" }
```

The nine-element `board` array is index-mapped as `board[row * 3 + col]`. All `null` means unclaimed.

### Phase 3 - Alice plays `{ row: 0, col: 0 }`

`handleMakeMove` (`turn-based.ts:125`) runs the full validate → reduce → persist cycle:

1. **Parse the move** - `def.moveSchema.safeParse({ row: 0, col: 0 })` → ok (`turn-based.ts:143`).
2. **Parse the stored state** - `def.stateSchema.safeParse(row.gameState)` → ok (`:145`).
3. **Authoritative reduce** - `def.engine.reduce(state, { role: "X" }, { row: 0, col: 0 })` (`:148`). The context is just `{ role }` (`MoveContext`, `packages/shared/src/types/games/engine.ts:13`) - the engine never sees a user id.
   - Checks `ctx.role === state.currentTurn` → `"X" === "X"` ✓
   - Checks `board[0]` is `null` ✓
   - Returns `{ board: ["X",null,…], currentTurn: "O" }`.
4. **Insert move** - `games.addMove(...)` (`:156`); the row's `player_id` holds the mover's user id.
5. **Update game** - `games.updateGame(...)` (`:163`) with the new `game_state`.

```
move row
  id          : "m-001"
  game_id     : "g-001"
  player_id   : "u-alice"
  move_number : 1
  move_data   : { "row": 0, "col": 0 }

game row (updated)
  game_state  : { "board": ["X",null,null,null,null,null,null,null,null],
                  "currentTurn": "O" }
```

### Phase 4 - Bob replies `{1,0}` then `{2,1}`; Alice completes the top row and wins

Play alternates `X, O, X, O, X`: Bob takes `{1,0}` (move 2), Alice `{0,1}` (move 3), Bob `{2,1}` (move 4), and Alice closes the top row with `{0,2}` (move 5). On that last move `reduce` returns a `ReduceResult` whose `outcome` is `{ status: "completed", winnerRole: "X", draw: false }` (the `Outcome` shape from `packages/shared/src/types/games/engine.ts:1` - a *role* string, **not** a user id). `finalize` (`turn-based.ts:74`) maps `winnerRole` → the winning `user_id`, writes it to `game.winner`, flips `status` to `"completed"`, sets `completedAt`, and bumps each player's stats.

```
game row (final)
  status     : "completed"
  winner     : "u-alice"
  game_state : { "board": ["X","X","X","O",null,null,null,"O",null],
                 "currentTurn": "O" }
```

The final `game_state` is stored exactly as `reduce` returned it - a stable snapshot of the terminal position (note `currentTurn` flipped to `"O"` after Alice's last `X`, even though no one moves again). The `move` table now has five rows (move_numbers 1–5), one per play, each carrying the raw `{ row, col }` input. You can replay the game by re-running `reduce` over each `move_data` in `move_number` order.

## The same tables for different game types

To show that the schema is genuinely generic, here is how three hypothetical games would populate the same rows. None of these are implemented - they are illustrations only.

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

The `game` / `move` / `game_player` DDL is unchanged. The `rows` × `cols` config variant is validated before it's written and re-validated before `reduce` runs - the DB never needs to know the board is not 3×3.

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

Different domain, different blob shape - same three tables.

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

After `step` resolves the tick, a new `game_state` is written with the outcome and `pendingInputs` cleared. The `move` table still gets one row per input - it is an audit log regardless of mode.

## What is fixed vs. what each game owns

| Fixed by the schema | Owned by the `GameDefinition` |
| --- | --- |
| Three tables, always | Shape of `game_state` JSONB |
| Sequential, dense `move_number` | Shape of `move_data` JSONB |
| One `game_player` row per seat | Shape of `config` JSONB |
| `role` is a `text` column | The role strings (`"X"/"O"`, `"Red"/"Blue"`, …) |
| `status` transitions (`waiting` → `active` → `completed`) | Win condition, draw condition, illegal-move logic |
| `cascade` delete: drop a game, drop its moves and players | `createInitialState` + `reduce`/`step` |
| Unique `(gameId, moveNumber)` - no double-submits | Tick rate, simultaneous-move resolution |

## Edge cases the model absorbs

**Hidden information.** The server stores the *complete* game state in `game_state`, including cards dealt to each player. The current `GameEngine` contract has no per-role projection - it broadcasts the full state - but the storage model leaves room for one: a `serialize(state, forRole)` step could strip the parts a role should not see before broadcast. The DB holds the full truth; the wire would carry only what each seat is allowed to know.

**Randomness and shuffles.** Shuffled decks, dice rolls, and other randomness live inside `createInitialState` or `reduce` - they are computed at the app layer and stored in `game_state`. The DB receives a deterministic snapshot; randomness never reaches the schema.

**Config-driven variants.** Board size, time limits, house rules - all go in `config` (validated by `configSchema` before the row is inserted). The `configFields` array on `GameDefinition` tells the lobby UI which form fields to render without the server needing to know the specifics.

**Replaying history.** Because `move` is an append-only log keyed by `(gameId, moveNumber)` and each `move_data` is the raw input (not a diff), any game can be replayed from `createInitialState` by folding `reduce` over the move log in order. The final `game_state` column is a materialized cache of that fold - it lets the server skip re-playing the full history on every move.

## The lifecycle at a glance

```
creator creates game (seated as the first player)
  → role = engine.roles[0]                            (games-in-chat-service.ts:118)
  → game_state = engine.createInitialState([{ role }]) (games-in-chat-service.ts:130)
  → insert game row + creator's game_player row        (games.ts:29)
      status "waiting", game_state already set

each additional player joins
  → role = engine.roles[players.length]               (turn-based.ts:58)
  → insert game_player row (role, seat_order)          (turn-based.ts:63)
  → if min players reached:
      update game row (status "active", startedAt)     (turn-based.ts:68)
      game_state kept as-is (gameState ?? …)           (turn-based.ts:71)

client emits make_move { gameId, moveData }
  → def.moveSchema.safeParse(moveData)                (turn-based.ts:147)
  → def.stateSchema.safeParse(row.gameState)          (turn-based.ts:149)
  → result = def.engine.reduce(state, { role }, input) (turn-based.ts:152)
  → insert move row (move_data, move_number)          (turn-based.ts:160)
  → update game row (game_state: result.state)        (turn-based.ts:167)
  → if outcome.status === "completed": finalize       (turn-based.ts:168)
      set winner, status "completed", bump stats

server broadcasts one game_state { game, move } to room (turn-based.ts:170)
```

## Gotchas & invariants

- **`game_state` is `unknown` until `safeParse`'d.** Read the raw row and you have bytes. The repository hands you an `unknown`; the caller is responsible for parsing it through the game's Zod schema before passing it to the engine.
- **`move_number` is dense and DB-enforced.** `move_game_number_uq` on `(gameId, moveNumber)` rejects a double-submit at the constraint level - the server does not need an advisory lock.
- **Role assignment is seat-order-dependent.** The creator takes `engine.roles[0]` at creation (`games-in-chat-service.ts:118`); each later joiner takes `engine.roles[players.length]`, evaluated *before* their `game_player` row is inserted (`turn-based.ts:58`). Seat `i` always gets `roles[i]` - you cannot choose your role. (A **rematch** instead pre-seats every prior player up front in `computeRematchSeating` order - loser-first for 2 players - so seat 0 / `roles[0]` goes to the loser; see [`realtime.md`](./realtime.md).)
- **`createInitialState` fires once, at creation.** `createGameInConversation` mints the initial `game_state` in the creating insert (`games-in-chat-service.ts:130`), not when the last seat fills. The `gameRow.gameState ?? engine.createInitialState(...)` guard on join (`turn-based.ts:71`) is a fallback the normal flow never triggers, because the state already exists. Reaching `"active"` only flips `status`; it does not re-mint state.
- **`move.player_id` is plain `text`, not a foreign key.** It stores the mover's `user.id` but declares no `references()` constraint - same for `game_player.user_id`. (`user.id` is Better Auth `text`; the game tables hold it without an FK.)
- **The public id is `code`; the FK/PK id is `uuid`.** Clients only ever see and send the short `code` (`/play/<code>`, socket `gameId`); the server resolves it with `getGameByCode` and uses the internal `uuid` for FK joins and writes. `serializeGame` maps `row.code → GameJson.id`, so the UUID never leaves the server. Only **games** moved to codes - conversations/messages/friendships/users/profiles keep their UUIDs.
- **No per-game tables, ever.** If you find yourself thinking "I need a `connect_four_state` column," the answer is: add it to the state schema and let it live in `game_state`.

## Where to go next

- [`./database-schema.md`](./database-schema.md) - the Drizzle declarations for the three tables: column types, `$type<T>()` semantics, indexes, and `$inferSelect` row types.
- [`./database.md`](./database.md) - how the repositories read and write these tables: the `GameRecord` join, keyset pagination, and the persist-a-move data flow.
- [`./games-core-schemas.md`](./games-core-schemas.md) - `GameDefinition<S,I,C>`, the Zod `stateSchema` / `moveSchema` / `configSchema` that own the blob shapes, and the `.strict()` + `z.infer` discipline.
- [`./shared.md`](./shared.md) - `@gamelobby/shared`, where the per-game schemas, `GameDefinition` / `GameEngine` types, and `GAME_TYPES` constant now live.
- [`./games-core-engine.md`](./games-core-engine.md) - the `GameEngine` contract, how `reduce` works, and the turn-based vs. realtime split.
- [`./realtime.md`](./realtime.md) - the Socket.IO driver that orchestrates validate → reduce → persist on every move.
- [`./README.md`](./README.md) - the architecture index.
