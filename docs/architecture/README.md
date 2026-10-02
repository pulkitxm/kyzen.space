# Architecture

Kyzen has one shared platform and registered games. The default runtime serves Next.js, the API, and Socket.IO together; the same backend can also run separately for a Vercel frontend.

For a guided first read, start with the [repository walkthrough](../repository-walkthrough.md).

## Ownership

| Area | Owner | New game work? |
| --- | --- | --- |
| Rules and initial state | `packages/games-core/src/games/<slug>` | Yes |
| State, move, config schemas | `packages/shared/src/types/games/<slug>` | Yes |
| Board and game animations | `packages/games-client/src/games/<slug>` | Yes |
| Registrations | Shared slug tuple, engine list, client registry | Small explicit additions |
| Room join, reconnect, state, moves | `games-client/src/use-game-session.ts` and `session.ts` | Reuse |
| Page, chat placement, profiles, results | `apps/web/app/play/[gameId]` | Reuse |
| Authoritative execution and timers | `apps/server/src/realtime/turn-based.ts` | Reuse |
| Authentication and social features | `apps/server` services and `apps/web` shell | Reuse |
| Persistence | `packages/database` generic game/move/player tables | Reuse |

Start with [adding a game](../adding-a-game.md). The server imports engines and schemas, never React boards. The board receives `game`, `moves`, `userId`, `connected`, `makeMove`, and `onViewProfile`. It does not own the connection or mount shared features.

## Runtime

`apps/web/server.ts` creates the shared HTTP server through `apps/server/src/http.ts` and attaches Next.js. Requests under `/api` go to Hono, `/health` checks readiness, and all other HTTP requests go to Next.js. Socket.IO attaches to that same HTTP server at `/socket.io`.

`apps/server/src/index.ts` runs the same API and realtime mount without Next.js. This is the persistent backend used with a separately hosted frontend. [Deployment](../deployment.md) explains both layouts and the timer limitation for function-only hosting.

## A move

1. The play route fetches the game's snapshot and move history by public room code.
2. The shared play session joins that room and receives a fresh snapshot, including after reconnect.
3. The board renders the supplied state and calls `makeMove` with a game-specific move.
4. The server validates the envelope and the game's schemas, authorizes the player, and runs the engine.
5. The server persists the result and broadcasts state with a move delta.
6. The shared session filters by room, deduplicates and orders moves, and updates the board and overlays together.

A conversation-backed game also mounts the existing chat view through `GameChatSplit`: docked at the side, floating, or minimized. Public rooms without a conversation currently render only the board. Profiles open through the shell callback; audio sources come from game metadata.

## Reference docs

| Guide | Scope |
| --- | --- |
| [games-client.md](games-client.md) | Board contract, shared session, registry, replay |
| [games-core-engine.md](games-core-engine.md) | Pure engines and registry conformance |
| [games-core-schemas.md](games-core-schemas.md) | Generic game contracts and validation |
| [shared.md](shared.md) | Shared contracts and constants |
| [database.md](database.md) | Repositories and data access |
| [database-schema.md](database-schema.md) | Tables and migrations |
| [generic-game-schema.md](generic-game-schema.md) | JSONB game storage |
| [realtime.md](realtime.md) | Authentication, rooms, chat, moves, timers |
| [server-api.md](server-api.md) | HTTP mount, services, serializers |
| [auth.md](auth.md) | Sessions, guests, OAuth, account merging |
| [web.md](web.md) | Routes, shared shell, state, appearance |
| [chat-core.md](chat-core.md) | Chat contracts |
| [audio.md](audio.md) | Sound engine and preferences |
| [playing-cards.md](playing-cards.md) | Reusable card rendering |
| [testing.md](testing.md) | Unit and integration suites |
| [deployment.md](../deployment.md) | Compose, external databases, Vercel frontend |

Detailed subsystem guides contain implementation references. Historical plans in `docs/superpowers` record earlier decisions; current code and these guides define the implementation.
