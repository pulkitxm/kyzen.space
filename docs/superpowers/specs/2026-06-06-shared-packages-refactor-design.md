# Shared Packages Refactor: `@kyzen/{constants,types,database}`

Date: 2026-06-06 · Branch: `batch-username-provisioning`

## Goal

Eliminate all cross-boundary (web ↔ server) duplication by introducing three shared
workspace packages and centralizing every type + every Zod schema into one place.

- **`@kyzen/constants`** - pure constant values shared by web and server.
- **`@kyzen/types`** - ALL types and ALL Zod schemas. The **only** package that
  declares `zod` as a dependency. Re-exports `z` so nothing else imports `zod` directly.
- **`@kyzen/database`** - Drizzle tables + repositories (the data layer), validating
  strictly against the `types` schemas.

`@kyzen/chat-core` is **deleted** - it is purely types/schemas/const, so its contents
move into `types/chat/` and `constants` and the empty package is removed.

## Non-negotiable rules (these become agent + CLAUDE.md rules)

1. `zod` appears in exactly one `package.json`: `@kyzen/types`. Everywhere else,
   `import { z } from "@kyzen/types"`.
2. Every shared/cross-package type and every Zod schema lives in `@kyzen/types`.
3. Shared constant VALUES live in `@kyzen/constants` (no types, no zod, zero deps).
4. The Drizzle schema and all repositories (db actions) live in `@kyzen/database`.
   Repositories validate inputs and outputs against `@kyzen/types` schemas.
5. Nothing is duplicated across web and server.

## Dependency graph (acyclic)

```
constants     pure values                                   - zero internal deps
avatar        AvatarConfig + generate/compare (unchanged)   - zero internal deps, NO zod
types         ALL types + ALL zod; re-exports z + AvatarConfig   → constants, avatar, zod
games-core    engines + registry + GAMES                    → types, constants
games-client  React boards                                  → types (+ games-core)
database      drizzle tables + repositories + createDb()     → types, constants, drizzle, postgres
apps/web, apps/server                                        → import from the above; zod only via types
```

## The one intentional exception

`avatar` keeps its own types and hand-rolled validation (no zod, no new dep). `types`
re-exports `AvatarConfig` so consumers still have a single import surface. Documented as
the deliberate exception to rule 2.

## Package contents

### `@kyzen/constants` (values only, zero deps)
- `theme.ts`: `THEME_IDS`, `COLOR_MODES`, `DEFAULT_THEME`, `DEFAULT_COLOR_MODE`
- `pattern.ts`: `PATTERN_IDS`, `DEFAULT_PATTERN`
- `chat-layout.ts`: `MIN_GAME`, `MIN_CHAT`, `MAX_CHAT`, `DEFAULT_CHAT_W`,
  `MIN/MAX_CHAT_POPOUT_W`, `MIN/MAX_CHAT_POPOUT_H`, `DEFAULT_POPOUT`
- `username.ts`: `USERNAME_MIN_LENGTH`, `USERNAME_MAX_LENGTH`, `USERNAME_PATTERN`,
  `RESERVED_USERNAMES`, `DISPLAY_NAME_MAX_LENGTH`
- `games.ts`: `TIC_TAC_TOE`, `GAME_TYPES`, `GAME_CATEGORIES`
- `chat.ts`: `CHAT_EVENTS`

### `@kyzen/types` (all types + all zod; deps: constants, avatar, zod)
- `z.ts`: `export { z } from "zod"` + `export type { ZodType, ... }`, the only zod touch
- `theme.ts`: `themeIdSchema`, `ThemeId`, `colorModeSchema`, `ColorMode`,
  `isValidTheme`, `isValidColorMode` (guards via schema.safeParse)
- `pattern.ts`: `patternIdSchema`, `PatternId`, `isValidPattern`
- `chat-layout.ts`: `chatModeSchema`, `ChatMode`, `PopoutGeometry`, `ChatLayout`
- `username.ts`: `usernameSchema`, `isValidUsernameFormat`, `isReservedUsername`,
  `normalizeUsername`, `displayNameSchema`
- `avatar.ts`: `export type { AvatarConfig, ... } from "@kyzen/avatar"` (re-export)
- `chat/`: `dto.ts`, `schemas.ts`, `socket-events.ts` (former chat-core, minus CHAT_EVENTS)
- `games/`: `core.ts` (GameType, gameTypeSchema, GameMeta, GameDefinition, GameEngine,
  Outcome, Seat, ConfigField…), `wire.ts` (GameJson, MoveJson, gamePlayerSchema,
  gameStatusSchema, seatingModeSchema, clientJoinRoom/MakeMove, Server*Payload),
  `tic-tac-toe/schemas.ts` (per-game state/move/config schemas + inferred types)
- `db/`: hand-written Zod schemas for every DB entity (source of truth for row types):
  `profiles.ts`, `games.ts`, `messages.ts`, `conversations.ts`, `friends.ts`,
  `notifications.ts`, `auth.ts` (user/session/account/verification)

### `@kyzen/database` (deps: types, constants, drizzle-orm, postgres)
- `schema.ts`: Drizzle tables + pgEnums (enums built from `constants` arrays)
- `client.ts`: `createDb(url, { latencyMs })` factory (NO import of server env)
- `latency.ts`: `withLatency`, `resolveDbLatencyMs`
- `index.ts`: `db`?-no → exposes `createDb` + repository namespaces + `schema`
- `repositories/*`: the six repos + `cursor.ts`; each validates via `types` schemas
- `migrate.ts` + `drizzle/` migrations (moved from `apps/server`)
- drift guards: `Expect<Equal<typeof table.$inferSelect, RowType>>` per table

## Consumer migration

- `apps/server`: `db/*` deleted → `import { games, profiles, createDb } from "@kyzen/database"`.
  `auth.ts` builds db via `createDb(env.databaseUrl)` and passes schema to drizzleAdapter.
  `env.ts` imports `resolveDbLatencyMs` from `@kyzen/database`. `lib/theme.ts`,
  `lib/pattern.ts` deleted; `lib/chat-layout.ts` keeps only server-specific bits or is
  deleted if fully covered. All `@kyzen/chat-core` → `@kyzen/types`. Direct
  `zod` imports → `@kyzen/types`.
- `apps/web`: `lib/themes.ts` / `lib/patterns.ts` keep ONLY web-only presentation
  (`THEMES`/`PATTERNS` palette data, `getThemeDef`, boot scripts, storage keys) and
  re-export the shared core from packages. `lib/chat-layout.ts` keeps web-only
  persistence; shared bits from packages. `account-identity-form.tsx` imports the
  username schema/constants instead of re-hardcoding the regex. `@kyzen/chat-core`
  → `@kyzen/types`. Add new packages to `next.config.ts` `transpilePackages` if
  needed (pure types/constants/db usually need it for Next to compile raw TS).
- `games-core`: per-game schemas import from `@kyzen/types`; types/schemas files
  move out; engines/registry/GAMES stay. Adding a game now touches 3 packages.
- `games-client`: imports types from `@kyzen/types`.

## Build wiring

- Each package: `package.json` (private, type:module, exports → ./src/index.ts, scripts
  type-check + test, deps as workspace:*), `tsconfig.json` extends `../../tsconfig.base.json`.
- `types` declares `zod`. `database` declares `drizzle-orm`, `postgres`, `drizzle-kit`(dev).
- Add `workspace:*` deps to `apps/web`, `apps/server`, `games-core`, `games-client`.
- `next.config.ts` transpilePackages: add the new web-consumed packages.
- `drizzle.config.ts`: schema → `packages/database/src/schema.ts`, out →
  `packages/database/drizzle`. Root `db:*` scripts + `migrate.ts` path repointed.
- `bun install` to resolve symlinks/lockfile.

## Execution order (verify `bun run type-check` after each layer)

1. Scaffold the 3 packages (manifests, tsconfig, empty index).
2. `constants` - move values.
3. `types` - schemas + types (theme/pattern/chat-layout/username/avatar re-export/chat/games/db).
4. `database` - tables + client factory + repositories + validation + drift guards + migrations.
5. Migrate `games-core` + `games-client` to import from packages.
6. Migrate `apps/server` (delete db/, lib/theme, lib/pattern; rewrite imports; createDb).
7. Migrate `apps/web` (dedup themes/patterns/chat-layout/username; rewrite imports).
8. Delete `chat-core`. Wire build (transpilePackages, drizzle.config, db scripts, bun install).
9. Verify: `bun run type-check`, `bun run test`, `bun run check`.
10. Docs + agents + rules: CLAUDE.md, AGENTS.md, docs/architecture/*, adding-a-game.md,
    game-builder.md, docs-maintainer.md. Add the strict rules above.

## Testing

- Move theme/pattern/chat-layout/username unit tests to the owning package's `tests/`.
- DB repository tests + the `Expect<Equal<...>>` drift guards live in `database`.
- Server unit tests that `mock.module("../src/db", …)` switch to mocking `@kyzen/database`.
- Conformance suite stays in games-core; update to import schemas from types.
