# Kyzen

Multiplayer games with shared chat, profiles, rooms, and matchmaking. Adding a turn-based game means implementing its rules and board while reusing the platform.

## Start locally

```bash
docker compose -f compose.dev.yaml up --build --watch
```

This starts the app at http://localhost:3000, local Postgres and Redis, applies the development schema, and loads synthetic demo data. External database URLs in `.env` are overridden in this local stack. See [deployment](docs/deployment.md) for local port overrides and the host-only development option.

## Deploy with your own databases

Put your database connections and app settings in `.env`, then:

```bash
docker compose up --build -d
```

The deployment Compose file runs only the app. It does not create Postgres or Redis, seed data, or modify your schema. Apply migrations separately with `bun run db:migrate`.

Next.js, the API, and Socket.IO share one HTTP server. A Vercel frontend with the same backend running separately is also supported. See [deployment](docs/deployment.md) for the environment settings and current hosting boundaries.

## Repository map

| Location | Responsibility |
| --- | --- |
| `apps/web` | Next.js routes and the shared play shell |
| `apps/server` | API, auth, chat services, and realtime handlers, mounted by either runtime entry point |
| `packages/games-core` | Pure engines, metadata, definitions, engine registry |
| `packages/games-client` | Boards, common game session, audio, cards, and UI primitives |
| `packages/shared` | Shared contracts, constants, and Zod schemas |
| `packages/database` | Drizzle schema, repositories, migrations, local seeds |
| `packages/avatar` | Avatar options and validation |
| `vid-tutorials` | Optional tutorial video workspace |

## Contribute

Start with [adding a game](docs/adding-a-game.md). It lists every file and registration needed, the board contract, and verification commands. Boards receive current game state and a move callback; the shell owns sockets, chat placement, profile popups, settings, and results.

For platform work, use the [architecture map](docs/architecture/README.md). Repository conventions are in [AGENTS.md](AGENTS.md). Role adapters use the same guides rather than duplicating instructions.

## Commands

Requires Bun 1.3.11 or newer. Docker is needed only for the local containers.

```bash
bun install
bun run dev
bun run type-check
bun run test
bun run check
bun run strip-comments -- --check
bun run build
bun run start
```

For host development, copy `.env.example` to `.env`, start the local databases with `bun run db:start`, apply the development schema with `bun run db:push`, and seed with `bun run db:seed`. `bun run dev` starts the combined app on port 3000. Use `bun run fix` for formatting and lint autofixes.

Start with the [repository walkthrough](docs/repository-walkthrough.md) for the full flow, then [adding a game](docs/adding-a-game.md) for the implementation checklist. The [wiki](https://github.com/pulkitxm/kyzen.space/wiki) mirrors the current reference docs after they reach `main`.

## License

Kyzen is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). You may use, modify, and redistribute it for permitted noncommercial purposes, provided you preserve the license and required notices. Commercial redistribution, sale of modified copies, and monetized hosting are not authorized by this license and require separate permission from the relevant rights holders. The license also expressly permits uses by the organizations listed in its Noncommercial Organizations section; the full license governs.

Third-party dependencies and assets retain their own licenses, including the [Game Paused font](apps/web/app/fonts/game-paused-LICENSE.txt).
