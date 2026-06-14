# Kyzen

A real-time multiplayer **game and chat lobby**: sign in, message friends, and play turn-based games together inside live conversations.

Kyzen is a [Bun](https://bun.sh) + [Turborepo](https://turbo.build) monorepo. A Next.js web app and an Express + Hono + Socket.IO server sit on top of shared, framework-agnostic game and chat logic. The single most important idea: **the game/chat domain logic lives in `packages/` and is imported by both the frontend and the backend**, so the same engine and Zod schemas that render a game in the browser also _authoritatively_ validate every move on the server. The client is never trusted.

## Features

- **Live games** over Socket.IO: a generic, schema-driven engine; adding a game needs no new routes, tables, or socket events. Includes Tic-Tac-Toe and **Sea Battle** (Battleship), with first-class support for hidden-information games (the server projects game state per recipient, so a player never sees the opponent's secrets).
- **Chat & social**: DMs and group conversations, friends, presence, typing indicators, and notifications, all realtime.
- **Games in chat**: start a match from a conversation; it appears as a live game card that updates as the game progresses. When a game ends, a result modal offers a **rematch** that re-invites the same players (loser goes first) into a linked **series**, and the card shows the running series score.
- **Auth**: Google sign-in via [Better Auth](https://better-auth.com), with a profile (username, avatar, stats, theme) provisioned on first sign-in.

## Tech stack

- **Web**: Next.js 16, React 19 (App Router), Tailwind CSS v4, Jotai
- **Server**: Bun, Express + Hono (REST under `/api/*`), Socket.IO (realtime)
- **Data**: Postgres via Drizzle ORM; optional Redis adapter for multi-node scale-out
- **Shared packages**: `@kyzen/shared` holds the strict Zod schemas, types, and constants that are the single source of truth; [Biome](https://biomejs.dev) for format + lint

## Monorepo layout

```text
apps/
  web/      Next.js frontend (lobby, chat, profiles, game boards)
  server/   Express + Hono + Socket.IO backend (REST, realtime, DB)
packages/
  shared/        Zod schemas, types + constants - the single source of truth
  database/      Drizzle schema + repositories (server-only)
  games-core/    framework-agnostic game engines + registry (no React)
  games-client/  React game board UIs (web-only)
  avatar/        DiceBear avataaars config
```

## Getting started

Prerequisites: [Bun](https://bun.sh) `1.3.11+` and Docker (for Postgres).

```bash
bun install                 # install all workspace deps
cp .env.example .env        # configure env (a single root .env feeds every app)
bun run db:start            # start Postgres + Redis in Docker
bun run db:push             # apply the Drizzle schema to the dev DB
bun run dev                 # web on :3000 + server on :4000 (watch mode)
```

Open [http://localhost:3000](http://localhost:3000).

## Common commands

```bash
bun run type-check          # tsc --noEmit across all workspaces (fast, Turbo-cached)
bun run check               # Biome: format + import-organize + lint (the CI gate, read-only)
bun run fix                 # Biome autofix + Tailwind class sorting
bun run test                # run every workspace's tests
bun run db:studio           # Postgres + Drizzle Studio at https://local.drizzle.studio
```

## Documentation

- **[`docs/architecture/`](docs/architecture/README.md)**: in-depth, code-referenced guide to every subsystem (auth, database, the game engine and schemas, realtime, the server, the web app, and testing).
- **[`docs/adding-a-game.md`](docs/adding-a-game.md)**: add a new game with one `GameDefinition` + one board component.
- **[`docs/games/`](docs/games/README.md)**: per-game rules and how-to-play, one page per game.

## Conventions

This codebase is intentionally **comment-free** - write self-documenting code and put prose in commit messages, PR descriptions, or `docs/`. Run `bun run type-check` and `bun run check` before opening a PR; CI enforces both plus the no-comments rule. See [`CLAUDE.md`](CLAUDE.md) for the full contributor guide.
