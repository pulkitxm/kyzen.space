# Architecture overview

GameLobby is a real-time multiplayer game **and** chat lobby. Two apps sit on top of five shared packages in a Bun + Turborepo monorepo:

- **`apps/web`** — Next.js 16 / React 19 frontend (App Router, Tailwind v4, Jotai). Renders the lobby, chat, profiles, and the game board UIs.
- **`apps/server`** — a single Bun process running Express + Hono (REST under `/api/*`) and Socket.IO (realtime), backed by Postgres (Drizzle ORM, via `@gamelobby/database`) and an optional Redis adapter for multi-node scale-out.
- **`packages/{shared,games-core,games-client,database,avatar}`** — shared code imported across the monorepo via `workspace:*`.

## The core insight: shared logic, imported by both sides

The single most important architectural decision is that **the game and chat domain logic lives in `packages/` and is imported across the monorepo**. A game is one self-describing `GameDefinition` — an engine assembled in `packages/games-core` (`@gamelobby/games-core`) over the strict Zod schemas + types that live in `packages/shared` (`@gamelobby/shared`). Because both packages are **framework-agnostic (no React)**, the server can import them directly:

- The **server** uses the engine as the authority. On every move it re-validates the move and the stored state against the game's Zod schemas and runs `engine.reduce(...)` to compute the next state. The client is never trusted. See `apps/server/src/realtime/turn-based.ts:125` (`handleMakeMove`).
- The **client** imports the same packages for its TypeScript types and shared rules, and renders the board via a separate React-only package, `@gamelobby/games-client`, resolved by game `type` (`packages/games-client/src/registry.ts:20`).

A registry-typed `gameType` ties the two sides together: `packages/shared/src/types/games/core.ts` derives the literal `GameType` union and a `gameTypeSchema` (`z.enum`) from the `GAME_TYPES` constant (`@gamelobby/shared/constants`), so every wire/socket payload validates its `gameType` at the Zod parse layer (`packages/shared/src/types/games/wire.ts:43`). Games are addressed on the wire by a short public room **code** (`gameCodeSchema`, `packages/shared/src/types/games/code.ts`), not the internal UUID `game.id`.

The same is true for chat: `@gamelobby/shared` is the single source of truth for the realtime message shapes (`@gamelobby/shared/types`, under `types/chat/`) and the socket event names (`CHAT_EVENTS` in `@gamelobby/shared/constants`), imported by both web and server so the wire contract can never drift.

The consequence: **adding a game requires no new routes, endpoints, DB tables, socket events, or drivers** — just the game's Zod schemas + types (shared), one `GameDefinition` (games-core), and one board component (games-client). See `docs/adding-a-game.md`.

## Monorepo map

```text
          ┌──────────────────────────────────────────────────────────────┐
          │                  shared packages (@gamelobby/*)               │
          │                     (workspace:* imports)                     │
          │                                                              │
          │                          avatar                              │
          │                  (DiceBear avataaars;                        │
          │                   no zod — the one exception)                │
          │                            ▲                                 │
          │                            │  re-exports AvatarConfig        │
          │                          shared                              │
          │            (ALL types + Zod schemas + constants;             │
          │             no React; the only package with zod)             │
          │            ▲               ▲               ▲                 │
          │            │               │               │                 │
          │       games-core        database      games-client          │
          │      (engines +        (Drizzle      (React board UIs;      │
          │       registry;         schema +      React + socket.io-    │
          │       no React)         repos;        client peer-deps)     │
          │                         server-only)                        │
          └───────────┬──────────────────────────────┬──────────────────┘
                      │                              │
     imports shared,  │                              │ imports shared,
     games-core,      │                              │ games-core,
     games-client,    │                              │ database, avatar
     avatar           ▼                              ▼
          ┌──────────────────────┐      ┌──────────────────────────┐
          │      apps/web        │      │       apps/server        │
          │  Next.js 16 / React  │      │  Bun: Express + Hono +   │
          │  - RSC/SSR pages     │      │  Socket.IO               │
          │  - game boards       │      │  - REST  /api/*  (Hono)  │
          │  - chat UI           │      │  - realtime (Socket.IO)  │
          └───────────┬──────────┘      └────────┬─────────────────┘
                      │                          │
        HTTP /api/*   │   WebSocket              │ @gamelobby/database
        (cookies)     │   (Socket.IO)            │ (Drizzle ORM)
                      └──────────┬───────────────┘
                                 ▼
                   ┌──────────────────────────┐
                   │        data stores        │
                   │  Postgres (Drizzle)       │
                   │  Redis (optional adapter) │
                   └──────────────────────────┘
```

Who imports whom:

- **`shared`** is the foundational package — every other package and both apps import it, and it is the **only** package that declares `zod`. Its sole dependency is `avatar` (it re-exports `AvatarConfig`).
- **`database`** is server-only (Drizzle + `postgres`) and depends on `shared`; only `apps/server` imports it.
- **`apps/web`** imports `shared`, `games-core`, `games-client`, and `avatar` (never `database`). `shared` + `games-core` + `games-client` are listed in `next.config.ts` `transpilePackages` (`apps/web/next.config.ts:5`).
- **`apps/server`** imports `shared`, `games-core`, `database`, and `avatar` (never `games-client`, which is React-only). This is what keeps the server React-free.
- **`games-client`** depends only on `shared` (for types) and has React + `react-icons` + `socket.io-client` as peer deps.
- Both apps reach the same Postgres instance only through the server; the web app never touches the database directly (it never imports `@gamelobby/database`).

## Two end-to-end journeys

### 1. A user signs in (Google OAuth)

1. The browser hits the sign-in page `apps/web/app/auth/page.tsx`. It's an RSC: if a session already exists it redirects to `/profile`; otherwise it renders the client button `apps/web/app/google-sign-in-button.tsx`.
2. Clicking the button calls `authClient.signIn.social({ provider: "google", ... })` (`apps/web/app/google-sign-in-button.tsx:20`), which kicks off the Better Auth OAuth dance against the server's `/api/auth/*` routes.
3. On the server, all `/api/auth/*` requests are forwarded by Hono to the Better Auth handler (`apps/server/src/api/index.ts:14`, mounted at line 19). Express forwards everything under `/api/*` to the Hono app (`apps/server/src/index.ts:24`).
4. Better Auth is configured in `apps/server/src/auth.ts` (which pulls `db` + `schema` from `@gamelobby/database`, `auth.ts:1`). On **first** sign-in, the `databaseHooks.user.create.after` hook provisions a profile (assigns a username) via `ensureUsernameForUser` (`apps/server/src/auth.ts:28`). Sessions/accounts persist through the Drizzle adapter into the `user` / `session` / `account` tables (`packages/database/src/schema.ts:41`).
5. Back in the web app, server components read the session by calling the server's `/api/auth/get-session` with the user's cookies forwarded: `getServerSession()` (`apps/web/lib/get-server-session.ts:16`) wraps `serverFetchJson` (`apps/web/lib/api-server.ts:24`), which attaches the cookie header and uses `cache: "no-store"`.
6. From then on, authenticated REST routes re-derive the same session from the cookie through a single shared `requireAuth` middleware (`apps/server/src/api/middleware/auth.ts:16`) — it calls `getAuth().api.getSession`, 401s when there's no user, and otherwise sets `userId` / `user` / `session` on the Hono context for the handler. Routes opt in by mounting this middleware rather than each re-implementing the session lookup.

### 2. A player makes a move

1. The board lives at the dynamic route `apps/web/app/play/[gameId]/page.tsx`. It is an RSC: it validates the gameId is a game **code** (`isGameCode`, then normalizes + redirects to the canonical code), requires a session (else redirects to `/auth`), and SSR-fetches the game + moves from the only game REST endpoint, `GET /api/games/:gameId` (`apps/web/app/play/[gameId]/page.tsx:36`). It passes the data to the client (`PlayClient`, `apps/web/app/play/[gameId]/play-client.tsx`), which resolves the board component by game type via `getGameClient(gameType)` and its `<Suspense>` fallback via `getGameSkeleton(gameType)` (`play-client.tsx:42`).
2. `GET /api/games/:gameId` is served by `apps/server/src/api/routes/games.ts:7` — the **only** game REST route. Games are created and played over the socket, not REST.
3. The board component reuses the app's shared Socket.IO connection (passed in as `GameClientProps.socket`) and emits `join_room`, then on a tap emits `make_move` with `{ gameId, moveData: { row, col } }`, and `leave_room` when it unmounts (`packages/games-client/src/games/tic-tac-toe/client.tsx`).
4. The server authenticated the socket at connect time by reading the Better Auth session from the handshake cookie (`apps/server/src/realtime/index.ts:35`). The `make_move` handler validates the payload against the shared Zod schema `clientMakeMoveSchema` and routes through the driver (`apps/server/src/realtime/index.ts:98`).
5. Game events route through a **driver** (`apps/server/src/realtime/drivers.ts:25`), currently the turn-based one (`apps/server/src/realtime/turn-based.ts`). `handleMakeMove` (`turn-based.ts:125`) loads the game, looks up the `GameDefinition` via `getDefinition` (`packages/games-core/src/registry.ts:19`), validates the move with `def.moveSchema` and the stored state with `def.stateSchema`, then runs the **authoritative** `def.engine.reduce(...)` (`turn-based.ts:148`). An illegal move is rejected with `game_error`; the client never decides legality.
6. On success it persists the move (`games.addMove`) and the new state (`games.updateGame`), finalizes the outcome / bumps player stats if the game ended, then broadcasts `move_made` + a fresh `game_state` to everyone in the game room (`turn-based.ts:166`). State and moves live as JSONB on the generic `game` / `move` / `game_player` tables (`packages/database/src/schema.ts:97`) — there are no per-game tables.
7. The board's socket listeners (`game_state`, `move_made`) update local React state and re-render (`client.tsx:252`). If the move ended the game, the server also emits `game_over` to the room and — for an in-chat game — re-broadcasts the game card to the originating conversation (`turn-based.ts:172`).

## Subsystem docs

This is the index for `docs/architecture/`. Each per-subsystem doc is a sibling of this file and is grounded in verified `file:line` references into the real code.

| Doc | What it covers |
| --- | --- |
| [shared.md](./shared.md) | `@gamelobby/shared`: the foundational package every other one imports. Its two subpath exports — `@gamelobby/shared/constants` (all constant **values**) and `@gamelobby/shared/types` (all TypeScript **types + Zod schemas**, plus the re-exported `z`) — the strict rules (zod lives here only; the `constants ← types` strict-annotation pattern; the `avatar` exception). |
| [auth.md](./auth.md) | Better Auth (Google OAuth only) mounted at `/api/auth/*`, the `user`/`session`/`account`/`verification` tables, first-sign-in profile provisioning, and how RSC, browser fetch, and the Socket.IO handshake all re-derive the same session from one cookie. |
| [database-schema.md](./database-schema.md) | `@gamelobby/database`'s Drizzle/Postgres **schema**: the **generic** `game`/`move`/`game_player` tables (JSONB state, no per-game tables), the pgEnums-from-`@gamelobby/shared/constants`, the `$type` modeling patterns, the hand-written row types + the `drift-guard` `$inferSelect` assertions, and migrations (generate vs. push). |
| [generic-game-schema.md](./generic-game-schema.md) | **How the generic schema generalizes**: what actually lives in `game_state` / `move_data` / `config` for a real game (tic-tac-toe, column-by-column), how the `GameDefinition` maps to the columns, and worked illustrations for other game types. |
| [database.md](./database.md) | `@gamelobby/database`, the **data-access** layer over that schema: the postgres-js client singleton + `createDb` factory, the repository pattern exposed as namespaces from `@gamelobby/database`, the `GameRecord` seat join, keyset pagination, and the persist-a-move data flow. |
| [games-core-schemas.md](./games-core-schemas.md) | The contract layer (now in `@gamelobby/shared/types`, under `types/games/`): `GameDefinition<S,I,C>`, the `GameEngine` types, the shared wire/socket Zod schemas, and the `.strict()` + `z.infer` discipline. |
| [games-core-engine.md](./games-core-engine.md) | The logic/registry layer: the `GameEngine` contract, tic-tac-toe's pure `reduce()`, the single `GAMES` array, the derived registry, and the conformance invariants every game must satisfy. |
| [games-client.md](./games-client.md) | `@gamelobby/games-client`: the web-only React board package, board resolution by game type via `getGameClient` (the current board is statically imported so it SSRs; the registry still permits a `React.lazy` board for a heavy future game), the `GameClientProps` SSR contract, and how a board rides the app's shared socket. |
| [playing-cards.md](./playing-cards.md) | The themed playing-card primitive: an in-code SVG **builder** in `@gamelobby/games-core` + the `"use client"` `<PlayingCard>` / `<Joker>` / `<CardBack>` components in `@gamelobby/games-client`, why it must render inline (so theme `var(--…)` resolve), the `--pc-*` → theme-token → hex fallback theming, per-instance id-prefixing, and how to generate or customize any card — including the back. |
| [chat-core.md](./chat-core.md) | The chat/social contract (now folded into `@gamelobby/shared` — DTOs + schemas under `types/chat/`, `CHAT_EVENTS` in `@gamelobby/shared/constants`): the DTOs, the `CHAT_EVENTS` socket registry, the `Ack` discriminated union, and how game cards get embedded in conversations. |
| [realtime.md](./realtime.md) | The Socket.IO layer: one authenticated connection multiplexed into a **chat lane** and a **game lane**, the driver indirection, and the full authoritative `make_move` round trip with dual broadcast. |
| [server-api.md](./server-api.md) | How the backend process is assembled (Express + Hono + Socket.IO on one port), the routes → services → repositories layering with the `ServiceResult` pattern, and why `GET /api/games/:gameId` is the only game REST endpoint. |
| [web.md](./web.md) | The Next.js 16 app: the two fetch paths (`serverFetch` vs `clientFetch`), the SSR-hydrate-then-socket lifecycle, the Jotai-first state convention, and how one dynamic route renders every game. |
| [testing.md](./testing.md) | How testing works: Bun as the test runner, per-workspace `tests/` (server also `integration/`), the games-core conformance + registry + game-docs suites, the games-client and web render/route suites, the server realtime/rooms tests, `mock.module` for route deps, and the CI workflow that runs them. |

Per-game rules and shapes are documented separately under [`docs/games/`](../games/) (one `docs/games/<type>.md` per game type — start at its [README](../games/README.md), e.g. [tic-tac-toe](../games/tic-tac-toe.md)); the `game-docs` test enforces a doc for every registered game.

The authoritative quick-start narrative also lives in the repo root `CLAUDE.md` (the "Architecture" section) and `docs/adding-a-game.md`.

## Reading order for newcomers

1. **This file** — the system shape and the shared-logic insight.
2. **`docs/adding-a-game.md`** — the fastest way to internalize the `GameDefinition` model and the packages↔apps split, by walking the smallest possible feature.
3. **`packages/shared`** ([shared.md](./shared.md)) and **`packages/games-core`** — start at `packages/shared/src/types/games/` (`definition.ts`, `engine.ts` — the `GameDefinition` + `GameEngine` shapes — and the per-game Zod schemas), then `packages/games-core` (`registry.ts` and `games/index.ts` — the single `GAMES` array + the engines). This is the domain core.
4. **`apps/server/src/realtime/`** — `index.ts` (connection + the `join_room` / `make_move` / `leave_room` game lane), then `turn-based.ts` (the authoritative driver). This is where games-core meets the database.
5. **`apps/server/src/api/`** and **`@gamelobby/database`** — Hono router-per-feature and the layered repositories (the namespaces re-exported from `packages/database/src/index.ts`).
6. **`apps/web/app/play/[gameId]/`** and **`packages/games-client`** — how a board is fetched, hydrated, and wired to the socket.
7. **`@gamelobby/shared` (`types/chat/`)** and the server's `realtime/chat.ts` + `chat/` services — the chat lane that shares the same connection.

## Key commands and conventions

From the repo root (`bun` is both package manager and test runner; Turborepo orchestrates):

```bash
bun install                 # install all workspace deps
bun run dev                 # web on :3000 + server on :4000 in watch mode
bun run type-check          # tsc --noEmit across all workspaces (fast, Turbo-cached)
bun run check               # Biome: format + import-organize + lint (the CI gate, read-only)
bun run fix                 # Biome autofix + Tailwind class sorting
bun run test                # run every workspace's tests
bun run db:start            # Postgres via Docker
bun run db:push             # push the Drizzle schema directly (the dev DB is push-managed)
```

**Always run `bun run type-check` after code changes and before declaring work done.**

A single root `.env` is consumed by every app (`bun --env-file=.env`); `apps/web/.env` is a committed symlink to it. New env vars must be declared in `turbo.json` `globalEnv` or builds won't see them.

**Strict no-comments rule:** this codebase is intentionally comment-free. Do not add `//`, `/* */`, or JSDoc to any code or config file — write self-documenting code instead, and put prose in commit messages, PR descriptions, or `docs/`. Only functional tooling directives (`biome-ignore`, `@ts-expect-error`, triple-slash references, etc.) are allowed. `bun run strip-comments -- --check` enforces it, and CI fails any PR that introduces a comment.
