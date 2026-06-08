# Testing

The runner is **`bun:test`** (no Jest/Vitest). Every workspace keeps its tests in a `tests/` directory; `apps/server` additionally has an `integration/` suite (10 files, ~135 tests) — nine are DB-backed and need a live database, and one (`presence-redis.test.ts`) is Redis-backed and needs a reachable Redis. Tests are mostly fast, dependency-free unit tests over pure helpers, plus a set of **structural** suites that enforce the platform contract — every registered game must ship an engine, schemas, a board, a skeleton, and a doc, or a test fails.

## How to run

```bash
bun run test                # turbo run test — every workspace's `test` script
```

Per-workspace (cd in, or `--filter`):

```bash
cd packages/games-core && bun test            # one package's suite
cd packages/shared && bun test tests/theme.test.ts # one file
bun test --filter "<pattern>"                  # filter by test name
```

The server's default `test` script runs only `tests/` (`apps/server/package.json` → `"test": "bun test tests"`). The DB-backed suite is separate:

```bash
cd apps/server && bun run test:integration     # runs integration/ with --env-file=../../.env
```

Integration tests **self-skip without a DB**: each file probes `select 1` and gates with `describe.skipIf(!DB_UP)`, so they pass cleanly when Postgres is down — but to actually exercise them, start the DB (`bun run db:start`) and provide `.env`. The two original files keep the probe inline (`apps/server/integration/game-flows.test.ts:14`, `apps/server/integration/chat-flows.test.ts:18`); the seven newer files import a shared `DB_UP` from `apps/server/integration/harness.ts:8`. One of those, `apps/server/integration/_preflight.test.ts`, is the **opt-out** of the skip: it *throws* when `DB_UP` is false (with a setup checklist) instead of skipping, so a misconfigured environment fails loudly rather than passing on a silently-empty suite.

`harness.ts` factors out the boilerplate: `createHarness(prefix)` returns `makeUser`/`befriend`/`makeDm`/`makeGroup`/`trackGame`/`cleanup` over UUID-namespaced fixtures (so parallel files never collide), plus `unwrap`/`expectErr`/`TestUser`. Each edge/driver file does `const h = createHarness("…")` and `afterAll(h.cleanup)`, which deletes its tracked games/conversations/users. The two original files still carry their own copy of this harness inline.

The presence Redis integration tests (`apps/server/integration/presence-redis.test.ts`) exercise `RedisPresenceStore` against a real Redis rather than a DB, so they need a reachable `REDIS_URL`. The `redis` service in `scripts/docker-compose.yml` sits behind a `redis` Compose profile, so `bun run db:start` (postgres only) does **not** bring it up — start it explicitly with `bun run redis:start` (`redis:7` on `localhost:6379`). In CI it's the `redis` service on the `integration` job.

## Files at a glance

| Suite | Guarantees |
| --- | --- |
| `packages/games-core/tests/conformance.test.ts` | A `GAMES registry` block (`GAMES` non-empty + unique types, `GAME_TYPES` matches the registry exactly) plus per-game invariants over the whole `GAMES` array: `meta.type` matches `engine.type`, coherent player bounds, the right handler (`reduce`/`step`) for the mode, initial state validates against `stateSchema`, `createInitialState` is fresh, `reduce` doesn't mutate the input state, `moveSchema` rejects junk, `configSchema` accepts declared `configFields` defaults, `categoryId` is a known category, `roles` are unique, `coverImage` (when set) is a `/games/` path. |
| `packages/games-core/tests/registry.test.ts` | The derived registry API: `getDefinition`/`getEngine`/`hasEngine` for every type (and throw `Unknown game type: …`/false for unknown), `listGameTypes`/`listGameMeta` stay consistent with `GAMES` (and `listGameMeta` returns the definition `meta` objects), `getCategoryGroups` only yields non-empty real categories covering every game. |
| `packages/shared/tests/game-types.test.ts` | The registry-typed `gameType` parse layer (`src/types/games/core.ts` + `src/constants/games.ts`): the `TIC_TAC_TOE` slug constant is canonical, `GAME_TYPES` contains it, and `gameTypeSchema` accepts a registered slug but rejects an unknown one (e.g. `"chess"`). |
| `packages/shared/tests/schemas.test.ts` | The strict Zod contract (now in shared): in-range vs out-of-range/non-integer coordinates, exact board shape, and `.strict()` rejecting unknown keys, plus the wire payloads (`clientJoinRoomSchema`, `clientMakeMoveSchema`, `gameJsonSchema`, `gamePlayerSchema`) — including `gameJsonSchema` rejecting an unknown `gameType`, since `gameType` is validated against the registry. |
| `packages/shared/tests/game-code.test.ts` | The shareable room-code contract (`src/types/games/code.ts`): `generateGameCode` only emits the Crockford alphabet (never the ambiguous `I`/`L`/`O`/`U`) and every draw passes validation; `normalizeGameCode` uppercases/trims, maps look-alikes `I`/`L`→`1` and `O`→`0` (but leaves `U` unmapped, so a typed `U` stays invalid), and is idempotent — a freshly generated code is already canonical; `isGameCode` and `gameCodeSchema` reject a v4 UUID and the legacy `/play/<uuid>` identifier, off-by-one lengths, internal whitespace, symbols, the empty string, and non-string inputs, with `gameCodeSchema` parsing to the canonical normalized code. |
| `packages/shared/tests/{theme,pattern,chat-layout,username}.test.ts` | The pure shared helpers that moved out of `apps/server`: theme/color-mode + pattern guards, chat-layout `validateChatModePref`, and username `normalizeUsername`/`isValidUsernameFormat`/`isReservedUsername`. |
| `packages/games-core/tests/game-docs.test.ts` | Every `listGameTypes()` entry has a `docs/games/<type>.md` on disk (also checks `docs/games/README.md` exists). |
| `packages/games-core/tests/tic-tac-toe.test.ts` | Focused engine test for tic-tac-toe's pure `reduce` + helpers (`lineWinner`, `isBoardFull`, `isTerminal`, …). |
| `packages/games-core/tests/playing-cards.test.ts` | The shared 52-card SVG builder (`cardSvg`/`cardBackSvg`/`cardInner`/`jokerSvg`/`CARD_VIEWBOX`, backed by `src/playing-cards/svg.ts`): every `CARD_SUITS`×`CARD_RANKS` combo renders a non-empty `<svg>` with the right `viewBox`/`aria-label`, the red/black jokers and card-back variants render, suit pips keep their classic red/black colors, and `idPrefix` namespaces ids so multiple instances don't collide. |
| `packages/games-client/tests/registry.test.ts` | Registry parity: every game type from games-core has a non-null board (`getGameClient`) **and** a skeleton (`getGameSkeleton`); unknown type → `null` client, `DefaultGameSkeleton` skeleton. |
| `packages/games-client/tests/{audio,winning-line}.test.ts` | The client's pure UI helpers: the `audio/engine` volume math + music gating (`clampVolume` clamps/handles non-finite input, `stepVolume` steps without floating-point drift, `shouldPlayMusic` plays only when active + unmuted + audible + the context is running) and `findWinningLine`/`WINNING_LINES` for the tic-tac-toe board (every line for X, an O line, no false win on mixed cells). |
| `packages/database/tests/{cursor,latency}.test.ts` | The database package's pure helpers: keyset/cursor pagination encode/decode (`repositories/cursor.ts`) and the `withLatency` query-proxy wrapper (`resolveDbLatencyMs` zeroes latency in production, top-level `latency.ts`). |
| `packages/database/tests/games.test.ts` | `createGame`'s room-code collision-retry loop as a **unit**, with `../src/client` mocked so a fake `db.transaction` scripts per-attempt outcomes: success first try, one collision then success, exactly five attempts allowed (succeeds on the last after four collisions), five consecutive collisions exhausting the loop and throwing the domain error `Failed to allocate a unique game code`, and the exact `isGameCodeCollision` predicate — a non-`23505` error, a `23505` from a different constraint, a `23505` with no constraint name, and `game_code_uq` under a non-`23505` code all rethrow immediately without retrying; input is validated before any transaction opens. |
| `apps/web/tests/game-skeletons.test.tsx` | Renders `DefaultGameSkeleton`, the per-game skeleton, and `PlaySkeleton` (across every `ChatLayout` variant) via `renderToStaticMarkup` and asserts on the HTML — no DOM. |
| `apps/web/tests/route-loading.test.ts` | Key route directories each ship a `loading.tsx` (play, chat, games, friends, settings, profile, …). |
| `apps/web/tests/avatar-render.test.ts` | Every avatar option value + palette color renders a real DiceBear `<svg>`; rendering is deterministic for a fixed config. |
| `apps/web/tests/*` (others) | Pure web helpers: chat formatting, chat-layout cookie parsing, friends atoms, pattern/shortcode/theme utilities. |
| `apps/server/tests/rooms.test.ts` | Socket room helpers: `gameRoom`/`convRoom`/`userRoom` key builders and `join*`/`leave*`/`emitTo*` against a fake io/socket. |
| `apps/server/tests/turn-based.test.ts` | The game-lane driver as a **unit**: `handleJoinRoom` seating/spectate/challenge rules and `handleMakeMove` validation (non-player, inactive game, bad move via Zod, corrupt stored state) + applying moves, broadcasting, and stat bumps. **DB layer mocked** with `mock.module("@gamelobby/database", …)` — no Postgres. (Its DB-backed twin is `integration/game-driver.test.ts`, which runs the same driver against a live DB with only io/socket faked.) |
| `apps/server/tests/games-in-chat.test.ts` | Creating a game inside a conversation, again with the repos mocked. |
| `apps/server/tests/require-auth.test.ts` | The shared `requireAuth` Hono middleware (`src/api/middleware/auth.ts`): with `../src/auth` mocked, a missing session → `401 {"error":"Unauthorized"}`, an authenticated session passes through and exposes `c.get("userId")`/`c.get("user")`. |
| `apps/server/tests/presence.test.ts`, `presence-store.test.ts`, `presence-heartbeat.test.ts` | Presence as a unit, using the injectable `PresenceDeps`/`HeartbeatDeps` (a fake store + stubbed repositories passed in, no `mock.module`): the connect/disconnect transition logic and audience fan-out (`presence.ts`), the `InMemoryPresenceStore` reference-counting + `RedisPresenceStore` sorted-set staleness (`presence-store.ts`), and the per-node refresh/last-seen-persist timers (`presence-heartbeat.ts`). |
| `apps/server/tests/games-route.test.ts` | The `GET /api/games/:gameId` Hono route (repos mocked, invoked via `gamesRouter.request`): a structurally-invalid code (UUID, wrong length, `U`) → `404` with **no** `getGameByCode` lookup, a valid-but-missing code → `404`, and a found game serialized **by code** (`game.id` and each `move.gameId` are the room code, never the UUID); a lowercase code passes through to the repository while the response carries the stored canonical code. |
| `apps/server/tests/assemble.test.ts` | `assembleMessage`'s game-card code/UUID split (repos mocked): the wire `gameId` is swapped to the resolved game's room code when the game is found, but left as the FK UUID when the game is missing or the card has no metadata. |
| `apps/server/tests/*` (others) | Pure helpers and serializers: `serialize` (`serializeGame`/`serializeMove`), `game-card`, `profiles-route`, `username-rules` (the server-only username helpers), `gender-detection`. (The former `chat-cursor`/`db-latency` tests moved to `packages/database/tests`; `theme`/`pattern`/`chat-layout`/`username` moved to `packages/shared/tests`.) |
| `apps/server/integration/_preflight.test.ts` | The skip opt-out: a single test that **throws** (with a setup checklist) when `DB_UP` is false, so a misconfigured DB fails the run loudly instead of silently skipping the whole `integration/` suite. |
| `apps/server/integration/chat-flows.test.ts` | DB-backed chat basics: friend requests (send/accept/decline/duplicate/auto-accept/canonical pairKey), DM open + friends-only gate, messaging member gates + unread/read + delete, group ownership/membership/rename, and notification fan-out basics. |
| `apps/server/integration/game-flows.test.ts` | DB-backed game lifecycle over the normalized `game_player` join: create-in-DM seats the creator + posts a card, a second seat lists the game for both via the indexed join, and a full move sequence persists moves and completes with a winner. |
| `apps/server/integration/friends-edge.test.ts` | Friends service edge matrix: already-friends 409, respond 404/403/409 (ownership-before-status), idempotent `removeFriend`, pending lists both directions, canonical pairKey across pairs, reverse-request auto-accept. |
| `apps/server/integration/conversations-edge.test.ts` | Conversation service edges: order-independent DM dedupe; `addMembers`/`removeMember`/`renameGroup` 404-on-DM, 400/403 gates, re-add clears `leftAt`, no-dup membership; `getMemberRole`/`createGroup` role assignment, member dedupe, creator-in-members drop. |
| `apps/server/integration/messages-edge.test.ts` | Message service edges: delete 404, markRead/send 403 for non-members, multi-message unread accrual, system + gif (non-text) messages bypass the empty-body check and skip unread, whitespace/null text → 400, cursor pagination (newest-first, no overlap), soft-delete hides body/metadata + drops unread. |
| `apps/server/integration/games-in-chat-edge.test.ts` | `createGameInConversation` branch matrix: 404 no-conversation, 403 non-member, 400 unsupported type / invalid config / group missing seating mode / challenge missing-or-self-or-outsider target; valid open + challenge games seat the creator as X; DM forces `open` and ignores challenge fields. |
| `apps/server/integration/game-driver.test.ts` | The **real** turn-based driver (`handleJoinRoom`/`handleMakeMove`) against a live DB with only io/socket faked: creator-join vs. second-member seating/active-flip, spectate doesn't seat, and every `game_error` branch (invalid id, not-active, non-player, out-of-turn, occupied cell, out-of-range move) plus a full X win (winner = userId, `game_over`, stat bumps), a draw (drawn bumps), and challenge-reserved seating. |
| `apps/server/integration/notifications-edge.test.ts` | Notifications repo edges: `markRead` (single, already-read null, wrong-owner null) and `markAllRead`, `unreadCount`, `listForUser` pagination/`unreadOnly`, `resolveByRequestId` (resolves + reads only the matching request), decline creates no requester notification, and `notify` suppresses self-targeted entries. |
| `packages/avatar/tests/*` | The avatar domain: `generate`, `validate`, `compare`, `options`, `dicebear-mapping`. |

## Patterns to know

**`renderToStaticMarkup` without a DOM.** Web component tests import `renderToStaticMarkup` from `react-dom/server` and assert on the returned HTML string — no jsdom, no DOM globals. `apps/web/tests/game-skeletons.test.tsx:20` renders `<DefaultGameSkeleton />` and asserts `expect(html).toContain("animate-pulse")`; the tic-tac-toe skeleton test resolves the board via `getGameSkeleton(TIC_TAC_TOE)` and counts `size-24` cells to confirm a 9-cell board; `PlaySkeleton` is rendered for each `ChatLayout` variant and probed for layout markers (`border-l`, `360px`, `shadow-2xl`, `rounded-r-lg`). The avatar tests do the same with the real DiceBear engine, asserting the output starts with `<svg`.

**`mock.module` for server plumbing.** Server route/driver tests stub the data layer instead of touching Postgres. The DB layer is now the `@gamelobby/database` package, so the mock targets it: `mock.module("@gamelobby/database", () => ({ games, profiles, … }))` (`apps/server/tests/turn-based.test.ts:66`) then `await import("../src/realtime/turn-based")` (`:78`). The `requireAuth` test follows the same shape, mocking `../src/auth` before importing the middleware. Pure helpers are exported so they're unit-testable independent of HTTP/socket plumbing. See `docs/architecture/server-api.md` for the routes → services → repositories layering this leans on.

**A preload that seeds env for unit tests.** The server's unit suite runs with a preload — `apps/server/bunfig.toml` sets `[test] preload = ["./tests/setup.ts"]` — and `apps/server/tests/setup.ts` defaults the required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `LOG_LEVEL`) with `||=` if they're unset. That lets the real `env`/`db`/`logger` modules import without throwing during unit tests, even with no `.env` present.

**Structural contract suites.** Several suites iterate `GAMES`/`listGameTypes()` rather than hard-coding a game, so adding a `GameDefinition` automatically extends coverage — and forgetting any required artifact fails CI:

- no board / no skeleton → `packages/games-client/tests/registry.test.ts`
- no `docs/games/<type>.md` → `packages/games-core/tests/game-docs.test.ts`
- invalid schema / category / roles / cover image → `conformance.test.ts`

This is the testing half of the "adding a game needs no new routes, endpoints, or tables" contract.

## CI

`.github/workflows/test.yml` runs on every push to `main` and every pull request, and defines **two jobs**:

- **`test`** — checks out, installs Bun `1.3.11`, `bun install --frozen-lockfile`, then `bun run test` (the unit suites; no DB, so any `integration/` files it touches self-skip).
- **`integration`** — spins up a `postgres:16` service (health-checked, on `localhost:5432`) **and** a `redis:7` service (health-checked, on `localhost:6379`), sets `DATABASE_URL` + `REDIS_URL`, copies `.env.example` to `.env`, applies the schema non-interactively with `bun run db:push -- --force`, then runs `cd apps/server && bun run test:integration`. Because the DB is reachable, `_preflight.test.ts` does **not** skip — a broken setup fails the job; and because Redis is reachable, the presence Redis tests run instead of skipping.

Separate workflows cover the other gates — `lint.yml` (Biome `bun run check`), `build.yml`, and `no-comments.yml`.

## Where to go next

- [README.md](./README.md) — architecture overview and the shared-logic insight the structural suites protect.
- [games-core-engine.md](./games-core-engine.md) — the `GameEngine` contract and conformance invariants.
- [games-core-schemas.md](./games-core-schemas.md) — the strict Zod schemas the schema suite exercises.
- [games-client.md](./games-client.md) — the board + skeleton registry parity checks rely on.
- [realtime.md](./realtime.md) — the game-lane driver that `turn-based.test.ts` covers.
- [server-api.md](./server-api.md) — the layering the `mock.module` server tests mirror.
- `docs/adding-a-game.md` — what you must ship for the structural suites to pass.
