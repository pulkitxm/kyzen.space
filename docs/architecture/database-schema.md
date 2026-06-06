# Database Schema (Drizzle modeling + the generic game schema)

## What this is / why it matters

`packages/database/src/schema.ts` is the single file that describes the relational world — every table, enum, and index — inside the server-only `@gamelobby/database` package. The matching `*Row` types are hand-written in `@gamelobby/shared/types` (`types/db/`) and kept honest by compile-time `$inferSelect` assertions in `packages/database/src/drift-guard.ts`. This page covers **what the schema is and how Drizzle models it**; for **how those tables are read and written** (the repository layer, the `GameRecord` join, pagination, the move data-flow), see [`database.md`](./database.md).

One decision dominates the design: **every game is stored in the same three generic tables**, with each game's *shape* owned by Zod in `@gamelobby/shared/types` rather than by the relational schema. That is why adding a game needs **zero** schema changes.

## The design decision: one generic schema for every game

There are no `tic_tac_toe` or `connect_four` tables. Every game — whatever its rules — lives in three tables:

- **`game`** — one row per game, with a `game_state` JSONB blob (`schema.ts:97`)
- **`move`** — an append-only log, one row per move, with a `move_data` JSONB blob (`schema.ts:126`)
- **`game_player`** — one indexed row per seat (`schema.ts:141`)

`game_state` / `config` / `move_data` are all typed `jsonb(...).$type<unknown>()` — the database is **deliberately ignorant** of what's inside. The truth about those blobs lives in each game's strict Zod `stateSchema` / `moveSchema` / `configSchema` (see [`games-core-schemas.md`](./games-core-schemas.md)), and the server validates the blob against those schemas before the engine ever sees it.

> **Why JSONB + per-game Zod instead of per-game tables?** A table per game would force a migration for every new game and a schema change for every rule tweak — and split validation away from the engine. Storing opaque JSONB and validating with the game's own Zod schemas means the *same* `GameDefinition` the React client imports to render the board is the one the server imports to validate and reduce moves. **The client is never trusted; the server re-derives authoritative state from the shared schemas.** Adding a game touches `packages/shared`, `packages/games-core`, and `packages/games-client` only — the database never changes.

## How Drizzle modeling works here

A Drizzle table is a `pgTable(name, columns, (t) => [constraints])` call. Each column is a column-type function with chained modifiers; the optional third argument returns table-level indexes and unique constraints. Everything below is in `schema.ts`.

| Piece | What it does | Example |
| --- | --- | --- |
| `pgTable("game", {…}, (t) => […])` | Declares a table: name, column map, optional index/constraint list. | `game` (`schema.ts:97`) |
| Column types | `text` / `uuid` / `integer` / `boolean` / `timestamp` / `jsonb` map to Postgres types. | `gameType: text("game_type")` |
| `.primaryKey()` / `.defaultRandom()` | Primary key; server-side random `uuid` default. | `id: uuid("id").defaultRandom().primaryKey()` |
| `.notNull()` / `.default(v)` / `.defaultNow()` | Nullability and SQL-side defaults. | `createdAt: timestamp(...).defaultNow().notNull()` |
| `.$defaultFn(() => …)` | A **JS-side** default (runs in the app, not in SQL). | `code: text("code")...$defaultFn(() => generateGameCode())` (`schema.ts:101`); `createdAt: timestamp(...).$defaultFn(() => new Date())` (`schema.ts:49`) |
| `.references(() => t.col, { onDelete })` | Foreign key + delete behavior (`cascade` / `set null`). | `gameId: uuid(...).references(() => game.id, { onDelete: "cascade" })` |
| `.$type<T>()` | **Compile-time-only** cast — narrows the TS type, with **no runtime check**. | `status: text("status").$type<GameStatus>()`; `gameState: jsonb(...).$type<unknown>()` |
| `pgEnum(name, VALUES)` | A Postgres enum whose values come from a TS constant. | `themeEnum = pgEnum("app_theme", THEME_IDS)` (`schema.ts:37`) |
| `index()` / `unique()` | Table-level index / unique constraint (the third `pgTable` argument). | `unique("move_game_number_uq").on(t.gameId, t.moveNumber)` |
| `typeof table.$inferSelect` | Drizzle's inferred row type — **asserted equal** to the hand-written row type in `@gamelobby/shared/types`. | `Expect<Equal<typeof game.$inferSelect, GameRow>>` (`drift-guard.ts:44`) |

Two of these carry real weight:

- **`$type<…>()` is a cast, not a guard.** `status`, `seatingMode`, `kind`, `role`, etc. are stored as plain `text` narrowed to a TS union (e.g. `GameStatus`, used at `schema.ts:106`); `game_state` is `jsonb` narrowed to `unknown`. Postgres will not stop you writing an illegal value — the repository is responsible for only inserting legal ones, and a JSONB blob stays untrusted until a Zod `safeParse`.
- **pgEnums are derived from app constants.** `app_theme` / `color_mode` / `app_pattern` (`schema.ts:37`–`39`) take their values from `THEME_IDS` / `COLOR_MODES` / `PATTERN_IDS` in `@gamelobby/shared/constants`, so the DB enum can never disagree with the app's notion of valid values. They back `userProfile.theme` / `colorMode` / `pattern`.

Unlike most Drizzle setups, the `*Row` types are **not** derived with `$inferSelect`. They are hand-written interfaces in `@gamelobby/shared/types` (`types/db/index.ts:80`+) so that `apps/web` — which never imports `@gamelobby/database` (drizzle-orm + `postgres` are server-only) — can still speak the same row shapes. `drift-guard.ts` closes the loop: a list of `Expect<Equal<typeof table.$inferSelect, XRow>>` assertions (`drift-guard.ts:39`) is a compile-time tripwire that fails `type-check` the moment a table and its hand-written row type disagree. `@gamelobby/database` then re-exports those row types so they remain the currency the data-access layer speaks.

## The tables

### The generic game trio

`game` carries the two load-bearing columns — `gameType` (a free-text key like `"tic-tac-toe"` that maps to a `GameDefinition`) and the `game_state` / `config` JSONB — alongside lifecycle (`status`, `winner`, `startedAt`, `completedAt`) and seating (`creatorUserId`, `seatingMode`, `challengedUserId`) columns:

```ts
export const game = pgTable(
  "game",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code")
      .notNull()
      .unique("game_code_uq")
      .$defaultFn(() => generateGameCode()),
    gameType: text("game_type").notNull(),
    status: text("status").$type<GameStatus>().notNull().default("waiting"),
    winner: text("winner"),
    gameState: jsonb("game_state").$type<unknown>(),
    config: jsonb("config").$type<unknown>(),
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    creatorUserId: text("creator_user_id"),
    seatingMode: text("seating_mode").$type<SeatingMode>(),
    challengedUserId: text("challenged_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("game_conversation_idx").on(t.conversationId)],
);
```

**Two identifiers, one public.** `id` is the internal `uuid` primary key — it is the FK target for `move.game_id` / `game_player.game_id` and is used for every DB write, but it is **never** serialized to clients. `code` is the **public** identifier: a short, shareable, human-friendly room code (e.g. `K7P2QX`) generated app-side by `$defaultFn(() => generateGameCode())` (from `@gamelobby/shared/types`, imported at `schema.ts:23`) and pinned unique by the `game_code_uq` constraint. `serializeGame` sets `GameJson.id = row.code`, so URLs (`/play/<code>`) and socket payloads (`join_room` / `make_move`) carry the code, never the UUID. Because the code is randomly allocated it can collide, so `createGame` wraps its insert in a retry loop that catches a `game_code_uq` unique violation and re-rolls (see [`database.md`](./database.md)); `getGameByCode` resolves a game by code (normalizing first). See [`generic-game-schema.md`](./generic-game-schema.md) for the full public-code/internal-id story.

`move` and `game_player` add the constraints that make the generic model safe:

- **`move`** (`schema.ts:126`) — `unique("move_game_number_uq").on(gameId, moveNumber)` keeps move numbers dense and unique per game, so the DB itself rejects a duplicate / double-submit. `onDelete: "cascade"` drops a game's move log with it. `move.game_id` references the UUID `game.id`, not the code.
- **`game_player`** (`schema.ts:141`) — one row per seat (a normalization of the old `players` JSONB array). `unique("game_player_uq").on(gameId, userId)` makes it impossible to seat a user twice; `index("game_player_user_idx").on(userId)` turns "all games for this user" into a fast indexed join. `seatOrder` preserves turn order; `role` is the engine's per-seat role string (`"X"` / `"O"`). Its `game_id` also references the UUID `game.id`.

### Auth, chat, social, profile

The remaining tables are conventional relational shapes — one line each:

| Table | `schema.ts` | Notes |
| --- | --- | --- |
| `user` / `session` / `account` / `verification` | `:41`–`95` | The shape Better Auth expects; everything else FKs `user.id`. See [`auth.md`](./auth.md). |
| `userProfile` | `:160` | One per user (`unique` FK): unique `username`, a `stats` JSONB (`ProfileStats`, column `:167`), `avatar` JSONB, the three pgEnum appearance columns, a `chatLayout` JSONB, `usernameChangedAt` (cooldown gate), `lastSeenAt` (presence). |
| `conversation` / `conversationMember` | `:202` / `:221` | A `dm` or `group`; DMs carry a unique `dmKey`. Membership has per-member read state + a `leftAt` soft-leave; mirrors the `game_player` `unique + userId index` design. |
| `message` | `:244` | `kind` (`text` / `game_card` / …), nullable `body`, a `metadata` JSONB, an optional `gameId` link (FK to the UUID `game.id` — but a `game_card`'s *serialized* `MessageJson.gameId` carries the game's public `code`, not this UUID; see [`chat-core.md`](./chat-core.md)), a `deletedAt` soft delete. The composite `(conversationId, createdAt)` index powers keyset pagination. |
| `friendship` | `:179` | `requester` / `addressee` plus a sorted unique `pairKey` so direction doesn't duplicate; indexed `(addressee, status)` and `(requester, status)`. |
| `notification` | `:268` | `userId`, `type`, optional `actorId`, a `payload` JSONB, `readAt` / `resolvedAt`; indexed `(userId, createdAt)` for the feed and `(userId, readAt)` for the unread badge. |

## Migrations: generate vs. push

`drizzle.config.ts` (`:3`) wires drizzle-kit: `dialect: "postgresql"`, `schema: "./packages/database/src/schema.ts"`, `out: "./packages/database/drizzle"`, `strict: true`.

- **`bun run db:generate`** diffs the schema and emits a numbered SQL migration into `packages/database/drizzle` (the repo has `0000_*.sql` … `0007_*.sql`). **`bun run db:migrate`** runs `packages/database/src/migrate.ts` (`:7`), which applies that folder against `db` and exits.
- **The local dev DB is push-managed.** It was set up with **`bun run db:push`** (drizzle-kit applies the schema directly, leaving the migration ledger empty), so `db:migrate` has no baseline to apply locally — apply schema/enum changes in dev with `db:push` or direct SQL. The numbered migrations exist for reproducible / prod-style application.

## Gotchas & invariants

- **`game_state` / `config` / `move_data` are `unknown` by design.** The DB neither knows nor checks their shape; validity is owned by the game's Zod schemas and enforced at the realtime boundary (`apps/server/src/realtime/turn-based.ts:145`). Treat any `gameState` you read as untrusted until `safeParse`'d.
- **`$type<…>()` is compile-time only.** `status`, `seatingMode`, `kind`, `role`, etc. are plain `text`; Postgres will not reject an out-of-union value — the repository must only write legal ones.
- **`game` has two ids: a private UUID and a public `code`.** `id` (uuid PK) is internal — the FK target for `move` / `game_player` and used for all writes — and is never serialized. `code` (`game_code_uq`, `$defaultFn(generateGameCode)`) is the public, shareable room id that appears in URLs and socket payloads (`serializeGame` sets `GameJson.id = row.code`). Resolve by code with `getGameByCode`; `createGame` retries on a `game_code_uq` collision.
- **Move numbers are dense, unique, and DB-enforced.** `move_game_number_uq` on `(gameId, moveNumber)` is the double-submit backstop.
- **`game_player` replaced an old `players` JSONB array.** One indexed row per seat is the convention (it powers `game_player_uq` and the `userId` index); don't reintroduce per-game arrays.
- **DMs and friendships key on a *sorted* pair.** `dmKey(a, b)` and `pairKey(a, b)` both `[a, b].sort().join(":")`, so the relationship is direction-independent and the unique constraint actually prevents duplicates.
- **pgEnums derive from app constants.** Add a theme / pattern / mode by extending the TS constant the enum is built from (`THEME_IDS` / `COLOR_MODES` / `PATTERN_IDS` in `@gamelobby/shared/constants`) — never hand-edit the enum out of sync.
- **Row types are hand-written and drift-guarded.** Change a column and you must change its `*Row` type in `@gamelobby/shared/types`; `drift-guard.ts` fails `type-check` if `$inferSelect` and the hand-written type diverge.
- **Dev DB is push-managed.** Use `db:push` (or direct SQL) for local schema/enum changes; `db:migrate` expects a baseline the push-managed DB doesn't have.
- **No per-game tables, ever.** Adding a game is a `packages/` change; this file does not change.

## Where to go next

- [`./generic-game-schema.md`](./generic-game-schema.md) — what actually lives in `game_state` / `move_data` / `config` for a real game, how `GameDefinition` maps to the columns, and worked illustrations for other game types.
- [`./database.md`](./database.md) — how these tables are **queried**: the postgres-js client, the repository pattern, the `GameRecord` seat join, keyset pagination, and the persist-a-move data flow.
- [`./games-core-schemas.md`](./games-core-schemas.md) — the Zod `stateSchema` / `moveSchema` / `configSchema` that own the shape of the JSONB this schema stores.
- [`./shared.md`](./shared.md) — `@gamelobby/shared`, where the hand-written `*Row` types, domain types, and pgEnum source constants live.
- [`./auth.md`](./auth.md) — Better Auth and the `user` / `session` / `account` / `verification` tables.
- [`./chat-core.md`](./chat-core.md) — the DTOs and socket contract behind the `conversation` / `message` / `friendship` / `notification` tables.
- [`./README.md`](./README.md) — the architecture index.
