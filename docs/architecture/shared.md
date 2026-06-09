# `@gamelobby/shared` — the foundational package

## What this is / why it matters

`@gamelobby/shared` (`packages/shared/`) is the **base of the dependency graph**: every other package and both apps import it, and it imports nothing but `@gamelobby/avatar`. It is the home of two things and only two things:

- **all shared constant *values*** — exported from the `@gamelobby/shared/constants` subpath, and
- **all shared TypeScript *types* and *Zod schemas*** (plus the re-exported `z`) — exported from the `@gamelobby/shared/types` subpath.

The point is a single source of truth that is *framework-agnostic* (no React) and *runtime-light*, so it can be imported by the React-free server, the Drizzle-based `@gamelobby/database`, the engine package `@gamelobby/games-core`, the React boards in `@gamelobby/games-client`, **and** the Next.js app — without dragging any of them into a dependency they shouldn't have. Two rules make that work:

> **Zod lives here, and only here.** `@gamelobby/shared` is the only package that declares `zod` (`package.json:17`). Schemas are defined once and consumed everywhere; no other package re-declares the dependency.
>
> **Types + schemas go in `types/`; constant values go in `constants/`.** A type or a `z.…` schema belongs under `src/types/`; a literal value (`THEME_IDS`, `GAME_TYPES`, `CHAT_EVENTS`, numeric bounds, …) belongs under `src/constants/`.

This is also why the chat contract no longer has its own package: the former `@gamelobby/chat-core` was folded in here (its DTOs/schemas under `types/chat/`, its `CHAT_EVENTS` registry under `constants/`).

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/shared/package.json` | Declares the two subpath exports (`./constants`, `./types`) and the lone `zod` dependency (`:6`–`:18`). |
| `packages/shared/src/index.ts` | Root barrel: `export * from "./constants"` + `export * from "./types"`. |
| `packages/shared/src/constants/index.ts` | Barrel for all constant **values** (audio, theme, pattern, chat-layout, username, games, categories, chat, playing-cards). |
| `packages/shared/src/constants/audio.ts` | `GAME_SFX_STORAGE_KEY` / `GAME_MUSIC_STORAGE_KEY`, `DEFAULT_SFX_VOLUME` / `DEFAULT_MUSIC_VOLUME`, `VOLUME_MIN` / `VOLUME_MAX` / `VOLUME_STEP` — the client-only game-audio preference keys + bounds (see [audio.md](./audio.md)). |
| `packages/shared/src/constants/theme.ts` | `THEME_IDS`, `DEFAULT_THEME`, `COLOR_MODES`, `DEFAULT_COLOR_MODE`. |
| `packages/shared/src/constants/pattern.ts` | `PATTERN_IDS`, `DEFAULT_PATTERN`. |
| `packages/shared/src/constants/chat-layout.ts` | The chat-layout numeric bounds (`MIN_GAME`, `MIN_CHAT`/`MAX_CHAT`/`DEFAULT_CHAT_W`, the `*_CHAT_POPOUT_*` bounds, `DEFAULT_POPOUT`). |
| `packages/shared/src/constants/username.ts` | `USERNAME_MIN_LENGTH`/`USERNAME_MAX_LENGTH`, `USERNAME_PATTERN`, `DISPLAY_NAME_MAX_LENGTH`, `RESERVED_USERNAMES`. |
| `packages/shared/src/constants/games.ts` | `TIC_TAC_TOE` and the canonical `GAME_TYPES` list. |
| `packages/shared/src/constants/categories.ts` | `GAME_CATEGORIES`. |
| `packages/shared/src/constants/chat.ts` | `CHAT_EVENTS` — the socket event-name registry. |
| `packages/shared/src/constants/playing-cards.ts` | `CARD_SUITS` and `CARD_RANKS` — the 4 suits + 13 ranks for the playing-card renderer (see [playing-cards.md](./playing-cards.md)). |
| `packages/shared/src/types/index.ts` | Barrel for all types + schemas (audio, avatar, chat, chat-layout, db, games, pattern, playing-cards, theme, username) and the re-exported `z`. |
| `packages/shared/src/types/audio.ts` | `AudioChannelPrefs` (`{ volume, muted }`) — a plain type (no Zod) for the two client-only audio preference channels. |
| `packages/shared/src/types/z.ts` | `export { z } from "zod"` (+ `ZodType` / `ZodTypeAny`) — the single import point for Zod. |
| `packages/shared/src/types/theme.ts` / `pattern.ts` / `chat-layout.ts` / `username.ts` | Per-area schemas + inferred types + small guards/helpers (`isValidTheme`, `validateChatModePref`, `normalizeUsername`, …). |
| `packages/shared/src/types/avatar.ts` | Re-exports `AvatarConfig` (and friends) from `@gamelobby/avatar`, and defines `avatarConfigSchema` (the Zod schema used to validate an avatar config on the wire). |
| `packages/shared/src/types/playing-cards.ts` | `Suit` / `Rank` / `JokerVariant` for the playing-card renderer (see [playing-cards.md](./playing-cards.md)). |
| `packages/shared/src/types/chat/` | The former `chat-core`: `dto.ts` (DTOs), `schemas.ts` (`gameCardMetaSchema`, `clientCreateGameInConversationSchema`, …), `socket-events.ts` (client/server payload types + `Ack`). |
| `packages/shared/src/types/games/` | `core.ts` (`gameTypeSchema` + `GameType`), `code.ts` (`gameCodeSchema`/`generateGameCode`/`normalizeGameCode`/`isGameCode` — the public room code), `definition.ts` (`GameDefinition`/`GameMeta`/`ConfigField`), `engine.ts` (`GameEngine`/`Outcome`/`Seat`/`MoveContext`), `wire.ts` (`GameJson`/`MoveJson`/`gamePlayerSchema`/`clientJoinRoom`/`clientMakeMove`), `series.ts` (rematch-series score + summary types/schemas), and per-game schemas under `games/<type>/`. |
| `packages/shared/src/types/db/` | The DB layer's currency: hand-written row + domain types (`index.ts`) and the repository-input Zod schemas (`io.ts`). |

## The two subpaths

`package.json` (`:6`–`:10`) exposes exactly two entry points beside the root:

```json
"exports": {
  ".": "./src/index.ts",
  "./constants": "./src/constants/index.ts",
  "./types": "./src/types/index.ts"
}
```

So a caller imports **values** from one subpath and **types/schemas** from the other:

```ts
import { THEME_IDS, GAME_TYPES, CHAT_EVENTS } from "@gamelobby/shared/constants";
import { type GameType, gameTypeSchema, type GameRow } from "@gamelobby/shared/types";
```

The split is a convention, not a hard wall (the root `.` export re-exports both), but keeping value imports on `/constants` and type/schema imports on `/types` is what makes the layering legible — and it mirrors the internal directory split.

## The `constants ← types` strict-annotation pattern

The two directories reference each other, but **without a runtime cycle**, because the direction of each reference is chosen deliberately:

- `constants/` imports from `types/` **type-only**, purely to type-check a constant against its declared type. `constants/theme.ts:1` does `import type { ColorMode, ThemeDef, ThemeId } from "../types/theme";`, then `constants/theme.ts:17` writes `export const DEFAULT_THEME = "amber" as const satisfies ThemeId;`. The `import type` is erased at runtime, so this is not a real dependency.
- `types/` imports the **values** from `constants/` to build the schemas. `types/theme.ts:2` does `import { COLOR_MODES, THEME_IDS } from "../constants/theme";`, then `types/theme.ts:4` writes `export const themeIdSchema = z.enum(THEME_IDS);` and `types/theme.ts:5` derives `export type ThemeId = z.infer<typeof themeIdSchema>;`.

So the runtime edge is one-way (`types` → `constants`), while the type edge points back (`constants` → `types`, erased). The literal list lives in `constants/`; the schema and the inferred type live in `types/`; and the constant that needs the type for its annotation reaches *back* for it as a pure type. The same shape repeats for pattern, chat-layout, username, and games.

### Data-flow walkthrough: where a theme id comes from

`THEME_IDS` (`constants/theme.ts:3`, a `readonly` tuple) is the seed everything else derives from:

`THEME_IDS` (`constants/theme.ts:3`) -> `themeIdSchema = z.enum(THEME_IDS)` (`types/theme.ts:4`) -> `type ThemeId = z.infer<typeof themeIdSchema>` (`types/theme.ts:5`) -> `DEFAULT_THEME = "amber" as const satisfies ThemeId` (checked against that type, `constants/theme.ts:17`) -> consumed by the Postgres enum `themeEnum = pgEnum("app_theme", THEME_IDS)` in `@gamelobby/database` (`packages/database/src/schema.ts:38`) **and** by the web palette table (`apps/web/lib/themes.ts`, which re-exports the shared core and adds the presentation-only palette).

One tuple, and the DB enum, the Zod validator, the TS union, and the default value can never disagree.

## What lives under `types/games/`

The game contract that the engine (`@gamelobby/games-core`) and the boards (`@gamelobby/games-client`) build on is all here:

- `core.ts:4` — `gameTypeSchema = z.enum(GAME_TYPES)` and `type GameType = z.infer<…>` (`:5`). The literal union derives from the `GAME_TYPES` constant (`constants/games.ts:3`), so `GameType` is the registry of valid game-type strings.
- `code.ts` — the **public game room code**: `GAME_CODE_ALPHABET` (`:3`, Crockford base32 minus I/L/O/U) + `GAME_CODE_LENGTH` (`:4`, 6), `generateGameCode()` (`:8`, unbiased `crypto.getRandomValues`), `normalizeGameCode()` (`:16`, uppercases and maps I/L→1, O→0 so typed codes are forgiving), `isGameCode()` (`:20`), and `gameCodeSchema` (`:24`, normalizes then validates `^[0-9A-HJKMNP-TV-Z]{6}$`). The code is the game id clients see in URLs and socket payloads; the UUID `game.id` stays internal — see [`generic-game-schema.md`](./generic-game-schema.md).
- `definition.ts:26` — `GameDefinition<S, I, C>` (`meta`, `engine`, `stateSchema`, `moveSchema`, `configSchema`, optional `configFields`), plus `GameMeta` (`:6`) and `ConfigField` (`:16`).
- `engine.ts:15` — `GameEngine<State, Input>` (`createInitialState` + optional `reduce` / `step`), with `Outcome` (`:1`), `Seat` (`:5`), `ReduceResult` (`:7`), and `MoveContext` (`:13`).
- `wire.ts` — the socket/wire DTOs and their schemas: `gamePlayerSchema` (`:17`, each seat is `{ userId, username, role, avatar? }` where `avatar` is an optional/nullable `avatarConfigSchema`), `clientJoinRoomSchema` (`:27`), `clientMakeMoveSchema` (`:35`), `gameJsonSchema`/`GameJson` (`:43`/`:59`), `moveJsonSchema`/`MoveJson` (`:61`/`:69`), and the server payload types. The inbound envelopes validate `gameId` with `gameCodeSchema` (from `code.ts`), not a UUID schema.
- `series.ts` — the **rematch-series** contract: `seriesScoreEntrySchema` (`:6`, `{ userId, username, wins, avatar? }`), `seriesScoreSchema` (`:13`, `{ entries, draws, completedGames, totalGames }`), `seriesGameSummarySchema` (`:20`, a per-game row: `gameId` code, 1-based `gameNumber`, `status`, `winner`, `winnerUsername`, `completedAt`), and `seriesDetailSchema` (`:29`, `{ seriesId, gameType, score, games }`), each with its `z.infer` type. `SeriesScore` is what the chat game card embeds (`GameCardMeta.seriesScore`) and `SeriesDetail` is the `GET /api/games/:gameId/series` body. See [`server-api.md`](./server-api.md) and [`realtime.md`](./realtime.md).
- `games/<type>/schemas.ts` — one folder per registered game holds its strict Zod `stateSchema` / `moveSchema` / `configSchema` and the `z.infer` types (e.g. `games/tic-tac-toe/schemas.ts`).

`@gamelobby/games-core` then imports these to assemble each `GameDefinition` and to derive its registry; it holds the engines and the `GAMES` array, but no schemas. See [`games-core-schemas.md`](./games-core-schemas.md) and [`games-core-engine.md`](./games-core-engine.md).

## What lives under `types/db/`

`@gamelobby/database` is server-only (it pulls in `drizzle-orm` + `postgres`), so the **row and domain types it returns are declared here** instead, where `apps/web` can read them without importing the database package. `types/db/index.ts` hand-writes `GameRow` (`:85`, which carries the nullable `seriesId` at `:97`), `MoveRow`, `GamePlayerRow`, `UserProfileRow`, the auth rows, plus domain aggregates like `GameRecord` (`:199`), `CreateGameInput` (`:204`, whose optional `seriesId` at `:214` lets a rematch pass its parent's series id through), and `GameUpdate` (`:217`). `types/db/io.ts` holds the **repository-input Zod schemas** — `createGameInputSchema` (`:20`, including the optional `seriesId` at `:30`), `addMoveInputSchema` (`:33`), `createMessageInputSchema`, `appearancePatchSchema` (`:62`) — which the repositories `parse()` before writing. The schema-vs-type agreement is enforced by `drift-guard.ts` in `@gamelobby/database` (see [`database-schema.md`](./database-schema.md)).

## What lives under `types/chat/`

The chat/social contract that web and server share: `dto.ts` (the `*Json` DTOs, `MessageMetadata`, `NotificationPayload`, `PublicUser`, …), `schemas.ts` (`gameCardMetaSchema:13` — now carrying an optional `seriesScore` (`schemas.ts:24`) — `notificationPayloadSchema:28`, `clientCreateGameInConversationSchema:35`, and `clientRematchSchema:45`), and `socket-events.ts` (the `Client*` / `Server*` payload types — including `ClientRematch` and `ServerRematchCreated` (`socket-events.ts:60`/`:62`) — and the `Ack` discriminated union). The matching event-name registry, `CHAT_EVENTS` (with `rematch` / `rematchCreated`), is a value, so it lives in `constants/chat.ts:1`. The deep dive is in [`chat-core.md`](./chat-core.md).

## Gotchas, invariants & conventions

- **`zod` belongs to `shared` only.** It is declared in `packages/shared/package.json:17` and nowhere else. If another package needs Zod, it imports the schema (or the re-exported `z` from `@gamelobby/shared/types`) — it does not add `zod` to its own `package.json`.
- **`avatar` is the one exception.** `@gamelobby/avatar` is a leaf with **no Zod** — a deliberate carve-out (it owns `AvatarConfig` + DiceBear generation). `shared` re-exports `AvatarConfig` from it (`types/avatar.ts:3`); `shared` depends on `avatar`, never the reverse.
- **Values vs. types stay separated.** Put a literal in `constants/`; put a schema or type in `types/`. The `constants → types` reference must be `import type` (so it erases) — a value import from `constants/` into `types/` is fine, but a *value* import the other way would create a real cycle.
- **`GameType` derives from a constant, not from the registry.** `gameTypeSchema = z.enum(GAME_TYPES)` (`types/games/core.ts:4`) reads the `GAME_TYPES` list (`constants/games.ts:3`). Adding a game means appending its literal to `GAME_TYPES` here as well as shipping its schemas + engine — keep them in lockstep with the `GAMES` array in `@gamelobby/games-core`.
- **No React, no DB driver, no server runtime.** `shared` must stay importable from every workspace; don't pull `react`, `drizzle-orm`, `postgres`, or `socket.io` into it.
- **No comments in code.** Per the repo-wide rule, source under `packages/shared/src/` is comment-free; prose belongs here in `docs/`.

## Where to go next

- [`./README.md`](./README.md) — the architecture index and the package dependency graph.
- [`./games-core-schemas.md`](./games-core-schemas.md) — `GameDefinition<S,I,C>`, the wire/socket schemas, and the `.strict()` + `z.infer` discipline (the `types/games/` contract).
- [`./games-core-engine.md`](./games-core-engine.md) — the engines and registry in `@gamelobby/games-core` that build on those types.
- [`./database-schema.md`](./database-schema.md) — how the hand-written `types/db/` row types are kept honest against the Drizzle schema by `drift-guard.ts`.
- [`./database.md`](./database.md) — the repositories that validate inputs with the `types/db/io.ts` Zod schemas.
- [`./chat-core.md`](./chat-core.md) — the chat DTOs (`types/chat/`) and the `CHAT_EVENTS` socket contract.
