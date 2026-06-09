# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Code style - NO comments

**Do not write comments in code.** This codebase is intentionally comment-free. Do not add line comments (`//`), block comments (`/* */`), or JSDoc (`/** */`) to any `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs` / `.css` / `.json` / `.jsonc` file, nor `#` comments to any `.yml` / `.yaml` file - config files like `tsconfig.json` and CI workflows included. Write self-documenting code - clear names and small functions - instead of explaining it with comments. If something genuinely needs prose, put it in the commit message, the PR description, or `docs/`.

The **only** comments permitted are functional tooling directives, which must be preserved: `biome-ignore`, `eslint-disable` / `eslint-enable`, `@ts-expect-error` / `@ts-ignore` / `@ts-nocheck`, `prettier-ignore`, `///` triple-slash references, `//# sourceMappingURL`, bundler/JSX pragmas, `/*! */` / `@license` blocks, and - in YAML - `# yaml-language-server` schema hints and `# yamllint` directives.

Enforcement: `bun run strip-comments` removes every non-directive comment in place; `bun run strip-comments -- --check` lists any offenders and exits non-zero. CI runs the check on every PR (`.github/workflows/no-comments.yml`), so a PR that introduces a comment fails. The gate covers every tracked code file, including `scripts/strip-comments.mjs` itself - there are no exemptions.

## Icons - use `react-icons`, not raw SVG

**Render icons from `react-icons`, not hand-written inline `<svg>`.** Import a component and size it with the `size` prop or a `className` (e.g. `import { FaBell } from "react-icons/fa6";` → `<FaBell size={18} aria-hidden="true" />`). This keeps icons consistent, themeable via `currentColor`, and free of bespoke SVG markup.

- **Pack preference (in order):** Font Awesome 6 (`react-icons/fa6`) is the project default - reach for it first. If FA6 has no good match, use another `react-icons` pack: Lucide (`react-icons/lu`) for thin outline glyphs, or brand/flat-color logos (`react-icons/fc`, e.g. `FcGoogle` for the authentic multicolor Google mark). **Only when no library icon fits is a raw inline `<svg>` acceptable** - that fallback is allowed, not forbidden.
- **Stay on `fa6`, not the legacy `fa` (FA5).** Mind the FA6 renames: `FaCog`→`FaGear`, `FaUserFriends`→`FaUserGroup`, `FaRegSmile`→`FaRegFaceSmile`.
- **`games-client`** declares `react-icons` as a peer + dev dependency, so game UIs draw from the same icon set as the web app.
- **Not icons - leave as SVG:** generated/decorative art (`apps/web/scripts/gen-pattern-tiles.ts`, `public/` pattern tiles), DiceBear avatar rendering, and SVG used in tests.

## Commands

Bun is the package manager and test runner (`packageManager: bun@1.3.11`); Turborepo orchestrates tasks across the monorepo.

```bash
bun install                 # install all workspace deps
bun run dev                 # turbo: run web (:3000) + server (:4000) in watch mode
bun run build               # turbo: build all (^build ordering: packages before apps)
bun run test                # turbo: run every workspace's tests
bun run type-check          # tsc --noEmit across all workspaces (no build step; Turbo-cached)
bun run check               # biome: format + import-organize + lint (the CI gate; read-only)
bun run fix                 # biome --write: autofix format/imports/lint AND sort Tailwind classes
bun run clean               # remove all node_modules/.next/.turbo/cache (skips .git/.claude)
bun run ins:clean           # clean, then bun install
```

`dev`/`build`/`serve` each have a `:clean` variant (`dev:clean`, `build:clean`, `serve:clean`) that runs `ins:clean` first; `serve` builds (`--force`) then `start`.

**Always run `bun run type-check` after making code changes and before declaring work done, committing, or opening a PR.** It's fast (no build step, Turbo-cached) and catches type errors that tests may miss. Fix any errors it reports before finishing.

Per-workspace / single test (cd into the workspace, or use `--filter`):

```bash
cd apps/server && bun test tests/games-route.test.ts    # one server test file
cd packages/games-core && bun test                       # one package's suite
cd apps/server && bun run test:integration               # integration/ suite (needs DB + .env)
bun test --filter "<pattern>"                            # filter by test name within a file
```

Database (Postgres via Docker, Drizzle ORM). The compose file lives at `scripts/docker-compose.yml` (all db scripts run `docker compose --project-directory . -f scripts/docker-compose.yml …`); host ports are env-configurable (`POSTGRES_HOST_PORT`/`REDIS_HOST_PORT`).

```bash
bun run db:start            # docker compose up postgres + redis (redis enables the Socket.IO redis-adapter / presence store)
bun run db:stop             # docker compose down
bun run db:studio           # postgres + Drizzle Studio at https://local.drizzle.studio
bun run db:generate         # drizzle-kit generate migrations from schema.ts
bun run db:migrate          # apply migrations (runs packages/database/src/migrate.ts)
bun run db:push             # push schema directly (dev)
bun run db:reset            # drop volumes and recreate postgres + redis, then db:push
```

Lint note: Biome is the only linter (ESLint was removed). `bun run check` runs format + import-organize + lint (strict: recommended plus curated rules as errors, with `useSortedClasses` enforcing Tailwind class order); `bun run fix` autofixes everything safe **and** sorts Tailwind classes. Every workspace's `type-check` script is `tsc --noEmit` (type-only). Biome covers all code files including CSS - Tailwind v4 at-rules (`@theme`, `@apply`, `@source`, …) parse via the `tailwindDirectives` CSS parser option in `biome.json`.

## Environment

A **single root `.env`** is consumed by every app (`bun --env-file=.env`). `apps/web/.env` is a committed symlink to it. Copy `.env.example` to `.env`. Turbo declares all env vars in `globalEnv` (turbo.json) - add new vars there or builds won't see them. Set `DB_LATENCY_MS` to artificially delay every DB query (for testing loading states). `.worktreeinclude` (gitignore-syntax) lists files copied into each new git worktree - `.env`, `.env.local`, and `node_modules/` - so a copied `node_modules` resolves install-free via Bun's relative symlinks.

## Architecture

Monorepo: two apps (`apps/web`, `apps/server`) over five shared packages (`packages/*`). The split that matters: **all shared types, Zod schemas, constants, and game/chat logic live in `packages/` and are imported by both the Next.js frontend and the backend** - `@gamelobby/shared` is the single home for every type, schema, and constant (and the only package that depends on `zod`), so the same definitions validate moves on the server and inform the client.

### Packages (`@gamelobby/*`, imported via `workspace:*`)

Packages ship raw TypeScript (no build step; `exports` points at `./src/index.ts`). Dependency layer: **`avatar` → `shared` → {`games-core`, `games-client`, `database`} → apps.**

- **`shared`** - the foundational package and the single source of truth for **every type, every Zod schema, and every shared constant**. It is the **only** package that declares `zod`. Two subpath exports:
  - **`@gamelobby/shared/constants`** - shared constant *values* (`THEME_IDS`, `COLOR_MODES`, `DEFAULT_THEME`, `PATTERN_IDS`, `GAME_TYPES`, `TIC_TAC_TOE`, `GAME_CATEGORIES`, `CHAT_EVENTS`, chat-layout bounds, username `RESERVED_USERNAMES`/lengths/pattern, …).
  - **`@gamelobby/shared/types`** - all TypeScript types **and** all Zod schemas (+ guards, + the re-exported `z`): theme/pattern/chat-layout/username; `chat/` (DTOs + schemas + socket payload types); `games/` (`gameTypeSchema`, `GameDefinition`, `GameEngine`, wire `GameJson`/`MoveJson`/…, and per-game schemas under `games/<type>/`); and `db/` (row + domain + repository-IO types and input schemas).
  Inside the package, `constants/` annotates its values with types imported **type-only** from `types/`, while `types/` builds its schemas from the `constants/` values - no runtime cycle. **See `docs/architecture/shared.md`.**
- **`database`** - server-only data layer. The Drizzle schema (`packages/database/src/schema.ts`; `pgEnum`s built from `@gamelobby/shared/constants`), repositories (`repositories/*`) exposed as namespaces from `src/index.ts` (`games`, `messages`, `conversations`, `friends`, `notifications`, `profiles`), a `createDb(url)` factory + `db` singleton, the latency wrapper, `migrate.ts`, and the `drizzle/` migrations. Repositories validate inputs with Zod schemas from `@gamelobby/shared/types`; `drift-guard.ts` asserts each table's `$inferSelect` equals the hand-written row type in `shared`. Imported only by the server - never the web.
- **`games-core`** - framework-agnostic game **logic** (no React, no `zod` dependency): `GameEngine` implementations, the single `GAMES` array (`games/index.ts`), and `registry.ts` (`getDefinition`/`getEngine`/`hasEngine`/`listGameMeta`/`getCategoryGroups`). A game's types and strict Zod `stateSchema`/`moveSchema`/`configSchema` live in `@gamelobby/shared/types/games/<type>/`; the engine imports them from there. **See `docs/adding-a-game.md`.**
- **`games-client`** - all React game UI (web-only; peer-deps React + socket.io-client). One `"use client"` component per game under `src/games/<type>/client.tsx`, resolved by `type` via `getGameClient()` (`React.lazy`). Imports its types from `@gamelobby/shared`. The logic↔UI split keeps the server React-free.
- **`avatar`** - DiceBear avataaars config: option catalog, validation, random/seed generation, equality. The **one deliberate exception** to the "types live in shared" rule - it owns its own types and hand-rolled validation and has **no `zod`**; `@gamelobby/shared` re-exports `AvatarConfig`.

### Shared packages - strict rules (agents MUST follow)

1. **`zod` lives in exactly one place: `@gamelobby/shared`.** Never add `zod` to any other `package.json`, and never `import … from "zod"` outside `packages/shared`. Elsewhere, import `z` and every schema from `@gamelobby/shared/types`.
2. **Every shared type and every Zod schema goes in `@gamelobby/shared/types`** (in the matching sub-area: `chat/`, `games/`, `db/`, or the top-level theme/pattern/chat-layout/username modules). Import types/schemas from there - not from `games-core`, not from per-app files.
3. **Every shared constant *value* goes in `@gamelobby/shared/constants`.** When a constant's type lives in `types/`, annotate it (`export const DEFAULT_THEME: ThemeId = …`) by importing the type **type-only** from `../types`.
4. **The Drizzle schema and all DB actions live in `@gamelobby/database`.** Repositories are the only code that touches Drizzle/SQL, they validate inputs against `@gamelobby/shared/types` schemas, and `apps/web` must never import `@gamelobby/database`.
5. **`avatar` is the sole exception** - it keeps its own types and stays `zod`-free; consume `AvatarConfig` from `@gamelobby/shared/types` (re-exported) or `@gamelobby/avatar`.
6. **Nothing is duplicated across web and server.** If a type, schema, or constant is needed on both sides, it belongs in `@gamelobby/shared` - never copied.

### `apps/server` - Express + Hono + Socket.IO on Bun

`src/index.ts` mounts Express (CORS, `/health`), forwards `/api/*` to a **Hono** app (`src/api/index.ts`, router-per-feature under `api/routes/`), and attaches **Socket.IO** (`src/realtime/`). Better Auth (`auth.ts`) handles sessions/Google OAuth and provisions a profile on first sign-in. REST routes gate on a shared `requireAuth` Hono middleware (`api/middleware/auth.ts`) that re-derives the session from the cookie, 401s when absent, and sets `userId`/`user`/`session` on the context; the socket middleware authenticates the same way, reading the Better Auth session from the handshake cookie.

Data access lives in **`@gamelobby/database`** (not in the app): `schema.ts` (Drizzle/Postgres tables) → `repositories/*` → exposed as namespaces from its `index.ts`, consumed by the server as `import { games, profiles } from "@gamelobby/database"`. Routes/realtime call repositories, never raw SQL. Games use a **generic schema**: `game` (with `game_state` + `config` JSONB), `move` (`move_data` JSONB), and `game_player` (one indexed row per seat - normalizes the former players array; `getGameById` returns a `GameRecord` with `players` attached). Per-game shapes stay JSONB, validated by the game's Zod schemas - never per-game tables. The only game REST endpoint is `GET /api/games/:gameId` (games are created over the socket lane).

Realtime has two lanes on one connection: a **chat lane** (`chat.ts`, `friends.ts`, `typing.ts`, `presence.ts`, `games-in-chat.ts` - handlers attached per-connection) and a **game lane** (`join_room` / `make_move` events, payloads validated by games-core Zod schemas). The game-lane events are registered through a `registerGameEvent` helper (`realtime/socket-util.ts`) that validates the payload envelope and then calls `handleJoinRoom` / `handleMakeMove` in `turn-based.ts` directly: the handler loads the game, looks up the `GameDefinition`, validates the move + stored state against its Zod schemas, applies `reduce`, persists moves, and broadcasts state to the game room and (for in-chat games) the originating conversation.

### `apps/web` - Next.js 16, React 19, App Router, Tailwind v4, Jotai

⚠️ Per AGENTS.md, this Next.js version has breaking changes vs. training data - consult `node_modules/next/dist/docs/` before writing Next-specific code.

Routes live in `apps/web/app/` (route folders + colocated `*-client.tsx` components); shared helpers in `apps/web/lib/`. Two fetch paths to the backend:

- **`lib/api-server.ts`** (`server-only`, `serverFetch*`) - RSC/SSR calls; forwards the user's cookies, `cache: "no-store"`. Uses `API_URL`.
- **`lib/api-client.ts`** (`"use client"`, `clientFetch*`) - browser calls with `credentials: "include"`. Uses `NEXT_PUBLIC_API_URL`.

Realtime client lives in `lib/socket/`. **State management is Jotai-first**: state shared by ≥2 components is a Jotai atom (`lib/chat/atoms.ts`, `lib/sidebar-atoms.ts`); `useState` only for state private to a single component. Games render through one **dynamic route** `app/games/[gameType]/page.tsx` (no per-game folders), driven by `listGameMeta()`/`getDefinition()` from games-core; the shared `app/games/_shared/game-lobby.tsx` renders the `configFields` form + "Play with…" entry. Game board UIs come from **`@gamelobby/games-client`** via `getGameClient(type)` (rendered inside `<Suspense>` in `app/play/[gameId]/play-client.tsx`); cover art goes in `public/games/`. `@gamelobby/shared`, `@gamelobby/games-core`, and `@gamelobby/games-client` are listed in `next.config.ts` `transpilePackages`, and `globals.css` has an `@source` for the games-client src so Tailwind keeps its classes. The web's `lib/themes.ts`, `lib/patterns.ts`, and `lib/chat-layout.ts` re-export the shared core from `@gamelobby/shared` and add only web-only presentation (palette tables, boot scripts, localStorage persistence); `apps/web` never imports `@gamelobby/database`.

### Reserved usernames vs. top-level routes

The profile page is a **dynamic `/[username]` route**, so every top-level segment under `apps/web/app/` is a potential username collision. When you add a new top-level route, add its segment to `RESERVED_USERNAMES` in `@gamelobby/shared/constants` (`packages/shared/src/constants/username.ts`) if a user claiming that name would shadow the route - otherwise that route becomes unreachable for whoever owns the username. (Server-only username helpers - suggestion/slug/cooldown logic - stay in `apps/server/src/username-rules.ts`.) (Per-user/personal blocklisting is separate: the `NOT_ALLOWED_USERNAMES` env var, a comma-separated list parsed into the same block set.)

### Adding a game

A game spans **three packages** - strict Zod schemas + types in `shared`, the engine/definition in `games-core`, the board in `games-client` - with **no new routes, endpoints, DB tables, socket events, or drivers**. See **`docs/adding-a-game.md`** for the full guide, or use the **`game-builder`** agent (`.claude/agents/game-builder.md`) to implement one from a spec. In short:

1. Add the per-game **strict Zod schemas + inferred types** to `packages/shared/src/types/games/<type>/schemas.ts` and export them from `@gamelobby/shared/types`. Add the slug to `GAME_TYPES`/`TIC_TAC_TOE`-style constants in `@gamelobby/shared/constants` if needed.
2. Add `packages/games-core/src/games/<type>/{engine,meta,index}.ts` (the engine + `GameDefinition`, importing schemas/types from `@gamelobby/shared`), append the definition to the `GAMES` array, and export the engine from `src/index.ts`.
3. Add the `"use client"` board to `packages/games-client/src/games/<type>/client.tsx` and register it by `type` in `src/registry.ts`. Optionally add a `skeleton.tsx` placeholder and register it in `SKELETON_REGISTRY` (otherwise `getGameSkeleton` falls back to `DefaultGameSkeleton`).
4. The conformance suite (`packages/games-core/tests/conformance.test.ts`) covers it automatically; add a focused engine test, and per-game schema tests in `packages/shared/tests/`.

## Keep docs and agents in sync

**A change is not done until the relevant docs and agents reflect it.** Code and prose drift apart silently, so update them in the same change:

- **Subsystem/behavior change** → the matching page under `docs/architecture/*` (e.g. `realtime.md`, `database.md`, `web.md`).
- **Game-authoring flow change** → `docs/adding-a-game.md` **and** `.claude/agents/game-builder.md`.
- **New or changed game** → its `docs/games/<type>.md`.
- **Convention change** (style, tooling, structure) → this file (`CLAUDE.md`) **and** `AGENTS.md`.

Start from `docs/architecture/README.md` (the architecture index) and `docs/architecture/testing.md` (the test guide) to find the right page. Use the **`docs-maintainer`** agent (`.claude/agents/docs-maintainer.md`) to audit/re-sync docs against the code or to author a new doc in the house style.

## Tests

`bun test`, with tests in each workspace's `tests/` directory (server also has `integration/`). Mock server route dependencies with `mock.module`; keep pure helpers exported so they're unit-testable independent of HTTP/socket plumbing.

Structural suites enforce the platform contract: every registered game must ship a board (`getGameClient`), a skeleton (`getGameSkeleton`), and a `docs/games/<type>.md` - a missing one fails a test. See `docs/architecture/testing.md`.
