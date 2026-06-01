# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

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

Lint note: `apps/web` lints with ESLint (`eslint-config-next`); every other workspace's `lint` script is just `tsc --noEmit`. Biome handles formatting only — its linter is disabled, CSS files are excluded.

## Environment

A **single root `.env`** is consumed by every app (`bun --env-file=.env`). `apps/web/.env` is a committed symlink to it. Copy `.env.example` to `.env`. Turbo declares all env vars in `globalEnv` (turbo.json) — add new vars there or builds won't see them. Set `DB_LATENCY_MS` to artificially delay every DB query (for testing loading states).

## Architecture

Monorepo: two apps (`apps/web`, `apps/server`) over three shared packages (`packages/*`). The split that matters: **shared game/chat logic lives in `packages/` and is imported by both the Next.js frontend and the backend**, so the same engine validates moves on the server and (where needed) informs the client.

### Packages (`@gamelobby/*`, imported via `workspace:*`)

- **`games-core`** — framework-agnostic game logic. `GameEngine<State, Input>` (engine.ts) is the core abstraction: `createInitialState`, `reduce` (turn-based) or `step` (realtime), with `mode`/`roles`/`min`/`maxPlayers`. Engines self-register in `registry.ts`; look games up via `getEngine(type)` / `listGameTypes()`. Currently only `tic-tac-toe`. messages.ts defines the wire DTOs (`GameJson`, `MoveJson`, socket payloads) shared across the boundary.
- **`chat-core`** — chat/social DTOs (`dto.ts`) and the socket event contract (`socket-events.ts`, `CHAT_EVENTS`). The single source of truth for realtime message shapes shared by web and server.
- **`avatar`** — DiceBear avataaars config: option catalog, validation, random/seed generation, equality. The repo uses ready-made DiceBear assets rather than hand-drawn art.

### `apps/server` — Express + Hono + Socket.IO on Bun

`src/index.ts` mounts Express (CORS, `/health`), forwards `/api/*` to a **Hono** app (`src/api/index.ts`, router-per-feature under `api/routes/`), and attaches **Socket.IO** (`src/realtime/`). Better Auth (`auth.ts`) handles sessions/Google OAuth and provisions a profile on first sign-in; the socket middleware authenticates by reading the Better Auth session from the handshake cookie.

Data access is layered: `db/schema.ts` (Drizzle/Postgres tables) → `db/repositories/*` → exposed as namespaces from `db/index.ts` (`games`, `messages`, `conversations`, …). Routes/realtime call repositories, never raw SQL.

Realtime has two lanes on one connection: a **chat lane** (`chat.ts`, `friends.ts`, `typing.ts`, `presence.ts`, `games-in-chat.ts` — handlers attached per-connection) and a **game lane** (`join_room` / `make_move` events). Game events route through a **driver** (`drivers.ts` → currently `turn-based.ts`): the driver loads the game row, picks the engine from `games-core`, applies `reduce`, persists moves, and broadcasts state to the game room and (for in-chat games) the originating conversation.

### `apps/web` — Next.js 16, React 19, App Router, Tailwind v4, Jotai

⚠️ Per AGENTS.md, this Next.js version has breaking changes vs. training data — consult `node_modules/next/dist/docs/` before writing Next-specific code.

Routes live in `apps/web/app/` (route folders + colocated `*-client.tsx` components); shared helpers in `apps/web/lib/`. Two fetch paths to the backend:

- **`lib/api-server.ts`** (`server-only`, `serverFetch*`) — RSC/SSR calls; forwards the user's cookies, `cache: "no-store"`. Uses `API_URL`.
- **`lib/api-client.ts`** (`"use client"`, `clientFetch*`) — browser calls with `credentials: "include"`. Uses `NEXT_PUBLIC_API_URL`.

Realtime client lives in `lib/socket/`; Jotai atoms (`lib/chat/atoms.ts`, `lib/sidebar-atoms.ts`) hold client state. Game UIs are registered in **`lib/game-clients.tsx`** — a `gameType → dynamic(ssr:false)` component map; add a new game's client component there (cover art goes in `public/games/`).

### Adding a game

1. Implement a `GameEngine` in `packages/games-core/src/games/` and register it in `registry.ts`.
2. Backend move handling is engine-driven, so the turn-based driver picks it up automatically; add a new driver in `realtime/drivers.ts` only for a different `mode`.
3. Add the client UI component to the `REGISTRY` in `apps/web/lib/game-clients.tsx`.

## Tests

`bun test`, with tests in each workspace's `tests/` directory (server also has `integration/`). Mock server route dependencies with `mock.module`; keep pure helpers exported so they're unit-testable independent of HTTP/socket plumbing.
