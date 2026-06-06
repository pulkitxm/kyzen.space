# Database Schema (Drizzle modeling + the generic game schema)

## What this is / why it matters

`apps/server/src/db/schema.ts` is the single file that describes the relational world — every table, enum, index, and the derived `*Row` types. This page covers **what the schema is and how Drizzle models it**; for **how those tables are read and written** (the repository layer, the `GameRecord` join, pagination, the move data-flow), see [`database.md`](./database.md).

One decision dominates the design: **every game is stored in the same three generic tables**, with each game's *shape* owned by Zod in `packages/games-core` rather than by the relational schema. That is why adding a game needs **zero** schema changes.

## The design decision: one generic schema for every game

There are no `tic_tac_toe` or `connect_four` tables. Every game — whatever its rules — lives in three tables:

- **`game`** — one row per game, with a `game_state` JSONB blob (`schema.ts:98`)
- **`move`** — an append-only log, one row per move, with a `move_data` JSONB blob (`schema.ts:123`)
- **`game_player`** — one indexed row per seat (`schema.ts:138`)

`game_state` / `config` / `move_data` are all typed `jsonb(...).$type<unknown>()` — the database is **deliberately ignorant** of what's inside. The truth about those blobs lives in each game's strict Zod `stateSchema` / `moveSchema` / `configSchema` (see [`games-core-schemas.md`](./games-core-schemas.md)), and the server validates the blob against those schemas before the engine ever sees it.

> **Why JSONB + per-game Zod instead of per-game tables?** A table per game would force a migration for every new game and a schema change for every rule tweak — and split validation away from the engine. Storing opaque JSONB and validating with the game's own Zod schemas means the *same* `GameDefinition` the React client imports to render the board is the one the server imports to validate and reduce moves. **The client is never trusted; the server re-derives authoritative state from the shared schemas.** Adding a game touches `packages/games-core` and `packages/games-client` only — the database never changes.

## How Drizzle modeling works here

A Drizzle table is a `pgTable(name, columns, (t) => [constraints])` call. Each column is a column-type function with chained modifiers; the optional third argument returns table-level indexes and unique constraints. Everything below is in `schema.ts`.

| Piece | What it does | Example |
| --- | --- | --- |
| `pgTable("game", {…}, (t) => […])` | Declares a table: name, column map, optional index/constraint list. | `game` (`schema.ts:98`) |
| Column types | `text` / `uuid` / `integer` / `boolean` / `timestamp` / `jsonb` map to Postgres types. | `gameType: text("game_type")` |
| `.primaryKey()` / `.defaultRandom()` | Primary key; server-side random `uuid` default. | `id: uuid("id").defaultRandom().primaryKey()` |
| `.notNull()` / `.default(v)` / `.defaultNow()` | Nullability and SQL-side defaults. | `createdAt: timestamp(...).defaultNow().notNull()` |
| `.$defaultFn(() => …)` | A **JS-side** default (runs in the app, not in SQL). | `createdAt: timestamp(...).$defaultFn(() => new Date())` (`schema.ts:44`) |
| `.references(() => t.col, { onDelete })` | Foreign key + delete behavior (`cascade` / `set null`). | `gameId: uuid(...).references(() => game.id, { onDelete: "cascade" })` |
| `.$type<T>()` | **Compile-time-only** cast — narrows the TS type, with **no runtime check**. | `status: text("status").$type<GameStatus>()`; `gameState: jsonb(...).$type<unknown>()` |
| `pgEnum(name, VALUES)` | A Postgres enum whose values come from a TS constant. | `themeEnum = pgEnum("app_theme", THEME_IDS)` (`schema.ts:32`) |
| `index()` / `unique()` | Table-level index / unique constraint (the third `pgTable` argument). | `unique("move_game_number_uq").on(t.gameId, t.moveNumber)` |
| `typeof table.$inferSelect` | Derives the row TypeScript type from the table. | `export type GameRow = typeof game.$inferSelect` (`schema.ts:184`) |

Two of these carry real weight:

- **`$type<…>()` is a cast, not a guard.** `status`, `seatingMode`, `kind`, `role`, etc. are stored as plain `text` narrowed to a TS union (e.g. `GameStatus`, `schema.ts:94`); `game_state` is `jsonb` narrowed to `unknown`. Postgres will not stop you writing an illegal value — the repository is responsible for only inserting legal ones, and a JSONB blob stays untrusted until a Zod `safeParse`.
- **pgEnums are derived from app constants.** `app_theme` / `color_mode` / `app_pattern` (`schema.ts:32`–`34`) take their values from `THEME_IDS` / `COLOR_MODES` / `PATTERN_IDS` in `apps/server/src/lib/*`, so the DB enum can never disagree with the app's notion of valid values. They back `userProfile.theme` / `colorMode` / `pattern`.

`$inferSelect` is what lets repositories return fully typed rows without hand-written interfaces: the `*Row` types (`schema.ts:184`–`187`, `303`–`307`) flow out through `db/index.ts` and become the currency the data-access layer speaks.

## The tables

### The generic game trio

`game` carries the two load-bearing columns — `gameType` (a free-text key like `"tic-tac-toe"` that maps to a `GameDefinition`) and the `game_state` / `config` JSONB:

```ts
export const game = pgTable(
  "game",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameType: text("game_type").notNull(),
    status: text("status").$type<GameStatus>().notNull().default("waiting"),
    gameState: jsonb("game_state").$type<unknown>(),
    config: jsonb("config").$type<unknown>(),
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    seatingMode: text("seating_mode").$type<SeatingMode>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("game_conversation_idx").on(t.conversationId)],
);
```

`move` and `game_player` add the constraints that make the generic model safe:

- **`move`** (`schema.ts:123`) — `unique("move_game_number_uq").on(gameId, moveNumber)` keeps move numbers dense and unique per game, so the DB itself rejects a duplicate / double-submit. `onDelete: "cascade"` drops a game's move log with it.
- **`game_player`** (`schema.ts:138`) — one row per seat (a normalization of the old `players` JSONB array). `unique("game_player_uq").on(gameId, userId)` makes it impossible to seat a user twice; `index("game_player_user_idx").on(userId)` turns "all games for this user" into a fast indexed join. `seatOrder` preserves turn order; `role` is the engine's per-seat role string (`"X"` / `"O"`).

### Auth, chat, social, profile

The remaining tables are conventional relational shapes — one line each:

| Table | `schema.ts` | Notes |
| --- | --- | --- |
| `user` / `session` / `account` / `verification` | `:36`–`90` | The shape Better Auth expects; everything else FKs `user.id`. See [`auth.md`](./auth.md). |
| `userProfile` | `:165` | One per user (`unique` FK): unique `username`, a `stats` JSONB (`ProfileStats`, `:157`), `avatar` JSONB, the three pgEnum appearance columns, a `chatLayout` JSONB, `usernameChangedAt` (cooldown gate), `lastSeenAt` (presence). |
| `conversation` / `conversationMember` | `:212` / `:231` | A `dm` or `group`; DMs carry a unique `dmKey`. Membership has per-member read state + a `leftAt` soft-leave; mirrors the `game_player` `unique + userId index` design. |
| `message` | `:254` | `kind` (`text` / `game_card` / …), nullable `body`, a `metadata` JSONB, an optional `gameId` link, a `deletedAt` soft delete. The composite `(conversationId, createdAt)` index powers keyset pagination. |
| `friendship` | `:189` | `requester` / `addressee` plus a sorted unique `pairKey` so direction doesn't duplicate; indexed `(addressee, status)` and `(requester, status)`. |
| `notification` | `:278` | `userId`, `type`, optional `actorId`, a `payload` JSONB, `readAt` / `resolvedAt`; indexed `(userId, createdAt)` for the feed and `(userId, readAt)` for the unread badge. |

## Migrations: generate vs. push

`drizzle.config.ts` (`:3`) wires drizzle-kit: `dialect: "postgresql"`, `schema: "./apps/server/src/db/schema.ts"`, `out: "./apps/server/drizzle"`, `strict: true`.

- **`bun run db:generate`** diffs the schema and emits a numbered SQL migration (the repo has `0000_*.sql` … `0007_*.sql`). **`bun run db:migrate`** runs `migrate.ts` (`:9`), which applies that folder against `db` and exits.
- **The local dev DB is push-managed.** It was set up with **`bun run db:push`** (drizzle-kit applies the schema directly, leaving the migration ledger empty), so `db:migrate` has no baseline to apply locally — apply schema/enum changes in dev with `db:push` or direct SQL. The numbered migrations exist for reproducible / prod-style application.

## Gotchas & invariants

- **`game_state` / `config` / `move_data` are `unknown` by design.** The DB neither knows nor checks their shape; validity is owned by the game's Zod schemas and enforced at the realtime boundary (`apps/server/src/realtime/turn-based.ts:138`). Treat any `gameState` you read as untrusted until `safeParse`'d.
- **`$type<…>()` is compile-time only.** `status`, `seatingMode`, `kind`, `role`, etc. are plain `text`; Postgres will not reject an out-of-union value — the repository must only write legal ones.
- **Move numbers are dense, unique, and DB-enforced.** `move_game_number_uq` on `(gameId, moveNumber)` is the double-submit backstop.
- **`game_player` replaced an old `players` JSONB array.** One indexed row per seat is the convention (it powers `game_player_uq` and the `userId` index); don't reintroduce per-game arrays.
- **DMs and friendships key on a *sorted* pair.** `dmKey(a, b)` and `pairKey(a, b)` both `[a, b].sort().join(":")`, so the relationship is direction-independent and the unique constraint actually prevents duplicates.
- **pgEnums derive from app constants.** Add a theme / pattern / mode by extending the TS constant the enum is built from — never hand-edit the enum out of sync.
- **Dev DB is push-managed.** Use `db:push` (or direct SQL) for local schema/enum changes; `db:migrate` expects a baseline the push-managed DB doesn't have.
- **No per-game tables, ever.** Adding a game is a `packages/` change; this file does not change.

## Where to go next

- [`./database.md`](./database.md) — how these tables are **queried**: the postgres-js client, the repository pattern, the `GameRecord` seat join, keyset pagination, and the persist-a-move data flow.
- [`./games-core-schemas.md`](./games-core-schemas.md) — the Zod `stateSchema` / `moveSchema` / `configSchema` that own the shape of the JSONB this schema stores.
- [`./auth.md`](./auth.md) — Better Auth and the `user` / `session` / `account` / `verification` tables.
- [`./chat-core.md`](./chat-core.md) — the DTOs and socket contract behind the `conversation` / `message` / `friendship` / `notification` tables.
- [`./README.md`](./README.md) — the architecture index.
