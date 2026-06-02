# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Code style — NO comments

**Do not write comments in code.** This codebase is intentionally comment-free. Do not add line comments (`//`), block comments (`/* */`), or JSDoc (`/** */`) to any `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs` / `.css` / `.json` / `.jsonc` file — config files like `tsconfig.json` included. Write self-documenting code — clear names and small functions — instead of explaining it with comments. If something genuinely needs prose, put it in the commit message, the PR description, or `docs/`.

The **only** comments permitted are functional tooling directives, which must be preserved: `biome-ignore`, `eslint-disable` / `eslint-enable`, `@ts-expect-error` / `@ts-ignore` / `@ts-nocheck`, `prettier-ignore`, `///` triple-slash references, `//# sourceMappingURL`, bundler/JSX pragmas, and `/*! */` / `@license` blocks.

Enforcement: `bun run strip-comments` removes every non-directive comment in place; `bun run strip-comments -- --check` lists any offenders and exits non-zero. CI runs the check on every PR (`.github/workflows/no-comments.yml`), so a PR that introduces a comment fails. The gate covers every tracked code file, including `scripts/strip-comments.mjs` itself — there are no exemptions.

## Commands

Bun is the package manager and test runner (`packageManager: bun@1.3.11`); Turborepo orchestrates tasks across the monorepo.

```bash
bun install                 # install all workspace deps
bun run dev                 # turbo: run web (:3000) + server (:4000) in watch mode
bun run build               # turbo: build all (^build ordering: packages before apps)
bun run test                # turbo: run every workspace's tests
bun run type-check          # tsc --noEmit across all workspaces (no build step; Turbo-cached)
bun run check               # biome check (format + import organize, lint disabled)
bun run fix                 # biome check --write (autofix formatting/imports)
```

**Always run `bun run type-check` after making code changes and before declaring work done, committing, or opening a PR.** It's fast (no build step, Turbo-cached) and catches type errors that tests may miss. Fix any errors it reports before finishing.

Per-workspace / single test (cd into the workspace, or use `--filter`):

```bash
cd apps/server && bun test tests/theme.test.ts          # one server test file
cd packages/games-core && bun test                       # one package's suite
cd apps/server && bun run test:integration               # integration/ suite (needs DB + .env)
bun test --filter "<pattern>"                            # filter by test name within a file
```

Database (Postgres via Docker, Drizzle ORM):

```bash
bun run db:start            # docker compose up postgres
bun run db:studio           # postgres + Adminer at http://127.0.0.1:18081
bun run db:generate         # drizzle-kit generate migrations from schema.ts
bun run db:migrate          # apply migrations (runs apps/server/src/db/migrate.ts)
bun run db:push             # push schema directly (dev)
bun run db:reset            # drop volumes and recreate
```

Lint note: Biome is the only linter (ESLint was removed). `bun run check` runs format + import-organize + lint (strict: recommended plus curated rules as errors, with `useSortedClasses` enforcing Tailwind class order); `bun run fix` autofixes everything safe **and** sorts Tailwind classes. Every workspace's `lint` script is `tsc --noEmit` (type-only). CSS files are excluded from Biome.

## Environment

A **single root `.env`** is consumed by every app (`bun --env-file=.env`). `apps/web/.env` is a committed symlink to it. Copy `.env.example` to `.env`. Turbo declares all env vars in `globalEnv` (turbo.json) — add new vars there or builds won't see them. Set `DB_LATENCY_MS` to artificially delay every DB query (for testing loading states).

## Architecture

Monorepo: two apps (`apps/web`, `apps/server`) over three shared packages (`packages/*`). The split that matters: **shared game/chat logic lives in `packages/` and is imported by both the Next.js frontend and the backend**, so the same engine validates moves on the server and (where needed) informs the client.

### Packages (`@gamelobby/*`, imported via `workspace:*`)

- **`games-core`** — framework-agnostic game logic + schemas (**no React**, so the server can import it). A game is one self-describing `GameDefinition` (definition.ts): `engine` (`GameEngine<State, Input>` — `createInitialState`, `reduce`/`step`, `mode`/`roles`/`min`/`maxPlayers`), `meta`, and **strict Zod `stateSchema`/`moveSchema`/`configSchema`** (schemas.ts; TS types derive via `z.infer`). All definitions live in the single `GAMES` array (`games/index.ts`); `registry.ts` derives `getDefinition`/`getEngine`/`hasEngine`/`listGameMeta`/`getCategoryGroups` from it. Wire DTOs + socket-payload Zod schemas (`GameJson`, `MoveJson`, `clientJoinRoomSchema`, `clientMakeMoveSchema`) are in schemas.ts. **See `docs/adding-a-game.md`.**
- **`games-client`** — all React game UI (web-only; peer-deps React + socket.io-client). One `"use client"` component per game under `src/games/<type>/client.tsx`, resolved by `type` via `getGameClient()` (`React.lazy`). The logic↔UI split keeps the server React-free.
- **`chat-core`** — chat/social DTOs (`dto.ts`) + Zod schemas (`schemas.ts`, e.g. `gameCardMetaSchema`, `clientCreateGameInConversationSchema`) and the socket event contract (`socket-events.ts`, `CHAT_EVENTS`). Single source of truth for realtime message shapes shared by web and server.
- **`avatar`** — DiceBear avataaars config: option catalog, validation, random/seed generation, equality. The repo uses ready-made DiceBear assets rather than hand-drawn art.

### `apps/server` — Express + Hono + Socket.IO on Bun

`src/index.ts` mounts Express (CORS, `/health`), forwards `/api/*` to a **Hono** app (`src/api/index.ts`, router-per-feature under `api/routes/`), and attaches **Socket.IO** (`src/realtime/`). Better Auth (`auth.ts`) handles sessions/Google OAuth and provisions a profile on first sign-in; the socket middleware authenticates by reading the Better Auth session from the handshake cookie.

Data access is layered: `db/schema.ts` (Drizzle/Postgres tables) → `db/repositories/*` → exposed as namespaces from `db/index.ts` (`games`, `messages`, `conversations`, …). Routes/realtime call repositories, never raw SQL. Games use a **generic schema**: `game` (with `game_state` + `config` JSONB), `move` (`move_data` JSONB), and `game_player` (one indexed row per seat — normalizes the former players array; `getGameById` returns a `GameRecord` with `players` attached). Per-game shapes stay JSONB, validated by the game's Zod schemas — never per-game tables. The only game REST endpoint is `GET /api/games/:gameId` (games are created over the socket lane).

Realtime has two lanes on one connection: a **chat lane** (`chat.ts`, `friends.ts`, `typing.ts`, `presence.ts`, `games-in-chat.ts` — handlers attached per-connection) and a **game lane** (`join_room` / `make_move` events, payloads validated by games-core Zod schemas). Game events route through a **driver** (`drivers.ts` → currently `turn-based.ts`): the driver loads the game, looks up the `GameDefinition`, validates the move + stored state against its Zod schemas, applies `reduce`, persists moves, and broadcasts state to the game room and (for in-chat games) the originating conversation.

### `apps/web` — Next.js 16, React 19, App Router, Tailwind v4, Jotai

⚠️ Per AGENTS.md, this Next.js version has breaking changes vs. training data — consult `node_modules/next/dist/docs/` before writing Next-specific code.

Routes live in `apps/web/app/` (route folders + colocated `*-client.tsx` components); shared helpers in `apps/web/lib/`. Two fetch paths to the backend:

- **`lib/api-server.ts`** (`server-only`, `serverFetch*`) — RSC/SSR calls; forwards the user's cookies, `cache: "no-store"`. Uses `API_URL`.
- **`lib/api-client.ts`** (`"use client"`, `clientFetch*`) — browser calls with `credentials: "include"`. Uses `NEXT_PUBLIC_API_URL`.

Realtime client lives in `lib/socket/`. **State management is Jotai-first**: state shared by ≥2 components is a Jotai atom (`lib/chat/atoms.ts`, `lib/sidebar-atoms.ts`); `useState` only for state private to a single component. Games render through one **dynamic route** `app/games/[gameType]/page.tsx` (no per-game folders), driven by `listGameMeta()`/`getDefinition()` from games-core; the shared `app/games/_shared/game-lobby.tsx` renders the `configFields` form + "Play with…" entry. Game board UIs come from **`@gamelobby/games-client`** via `getGameClient(type)` (rendered inside `<Suspense>` in `app/play/[gameId]/play-client.tsx`); cover art goes in `public/games/`. Both shared packages are listed in `next.config.ts` `transpilePackages`, and `globals.css` has an `@source` for the games-client src so Tailwind keeps its classes.

### Adding a game

A game is one `GameDefinition` (games-core) + one client component (games-client) — **no new routes, endpoints, DB tables, socket events, or drivers**. See **`docs/adding-a-game.md`** for the full guide, or use the **`game-builder`** agent (`.claude/agents/game-builder.md`) to implement one from a spec. In short:

1. Add `packages/games-core/src/games/<type>/{schemas,engine,meta,index}.ts` (strict Zod schemas + engine), append the definition to the `GAMES` array, and export from `src/index.ts`.
2. Add the `"use client"` board to `packages/games-client/src/games/<type>/client.tsx` and register it by `type` in `src/registry.ts`.
3. The conformance suite (`packages/games-core/tests/conformance.test.ts`) covers it automatically; add a focused engine test too.

## Tests

`bun test`, with tests in each workspace's `tests/` directory (server also has `integration/`). Mock server route dependencies with `mock.module`; keep pure helpers exported so they're unit-testable independent of HTTP/socket plumbing.
