# Running and deploying Kyzen

The default runtime is one Bun process serving Next.js, the API, and Socket.IO on port 3000. Both Docker and host development use `apps/web/server.ts`, which mounts the shared server from `apps/server/src/http.ts`. Next.js handles frontend hot reload; Nodemon restarts the process only for backend source or environment changes. Generated `.next` files never trigger a server restart.

## Local Compose

```bash
docker compose -f compose.dev.yaml up --build --watch
```

The local stack starts Postgres 16 and Redis 7, waits for Postgres, applies the development schema, runs the idempotent synthetic seed, and starts Next.js. Compose Watch synchronizes app and package source; lockfile changes rebuild the image. Rebuild explicitly after changing a workspace manifest.

The stack optionally reads `.env` for integration keys but always overrides database URLs and auth origins with local values. Local seeding accepts only the `kyzen_dev` database on `localhost`, `127.0.0.1`, or the Compose `postgres` service, and refuses production mode. It does not delete existing rows.

Open http://localhost:3000. Continue as a guest to use the app. Demo profiles are `/demo_sprout` and `/demo_pebble`; `/play/A2K9P7` contains a synthetic completed match for replay. Seeded identities are fixtures, not login accounts. Use two independent browser sessions to create and play a new room or to befriend each other and test chat.

`POSTGRES_HOST_PORT` and `REDIS_HOST_PORT` in `.env` change the ports exposed to your laptop. The container URLs stay unchanged. Postgres uses a named volume. Stop with `docker compose -f compose.dev.yaml down`; add `-v` only when intentionally discarding local data.

## Host development

```bash
bun install
cp .env.example .env
bun run db:start
bun run db:push
bun run db:seed
bun run dev
```

`db:start` uses the same local Postgres and Redis services without starting the app container. If you override their exposed ports, update the host URLs in `.env` too. The documented Bun commands load the root `.env`. Runtime containers and Vercel also accept injected environment variables. There is no workspace env symlink.

With the combined app running against local synthetic data, `bun run --cwd apps/web smoke:game` verifies the rendered homepage, guest sign-in, authenticated socket connections, room creation, five moves, reconnect recovery, and persisted completion. It creates fresh synthetic guests and refuses remote origins.

## Docker with external databases

Set these values in `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | External Postgres connection URL |
| `REDIS_URL` | External Redis URL; optional for a single app instance |
| `BETTER_AUTH_SECRET` | Random secret of at least 32 characters |
| `BETTER_AUTH_URL` | Public app origin |
| `WEB_URL` | Same public app origin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth credentials |

```bash
bun run db:migrate
docker compose up --build -d
```

The default `compose.yaml` contains one app service and reads `.env` at runtime. It does not bundle or create databases. Schema migration is an explicit operation against the configured database; it does not happen on container startup. The image excludes `.env`, credentials, local dependencies, and repository metadata.

The app listens on container port 3000. `APP_PORT` changes the host binding. Place it behind an HTTPS proxy that forwards WebSocket upgrades for `/socket.io`. Configure the OAuth redirect as `<BETTER_AUTH_URL>/api/auth/callback/google`. Readiness is available at `/health` and checks Postgres plus the Redis adapter when configured.

Use one realtime instance for now: turn timers are process-local. Redis shares rooms, presence, and matchmaking, but does not make those timers durable across process restarts or multiple timer owners.

## Vercel frontend with the shared backend

Deploy `apps/web` as a normal Next.js project on Vercel, using its `next build` command. Vercel runs the Next.js frontend rather than the custom `server.ts` entry point. Build dependencies must be installed from the workspace root.

Run the shared backend from the same image separately:

```bash
docker compose run --service-ports app bun run --cwd apps/server start
```

Use same-site HTTPS custom domains, for example `play.example.com` for Vercel and `api.example.com` for the backend, so the session cookie can also authenticate the socket. Set the backend's `WEB_URL` to the frontend origin and `BETTER_AUTH_URL` to the backend origin.

Set these frontend variables on Vercel:

```dotenv
API_URL=https://api.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SOCKET_URL=https://api.example.com
```

`API_URL` is the server-side fetch target. The public variables are compiled into the browser bundle, so changing them requires a new frontend build. Set OAuth credentials on the frontend too if Google sign-in should be shown.

Vercel now documents WebSocket support in public beta, including a Next.js upgrade API. That is different from running the custom server and does not make process-local turn timers durable. This repository's Vercel path therefore uses the separate persistent backend. A function-only runtime needs durable timer execution and a separate upgrade adapter before it can be claimed as supported. See the [Vercel WebSocket guide](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) and [Next.js custom-server guide](https://nextjs.org/docs/app/guides/custom-server).

For a local split-runtime check, set `BETTER_AUTH_URL`, `PUBLIC_REALTIME_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_SOCKET_URL` to `http://localhost:4000`, keep `WEB_URL=http://localhost:3000`, run `PORT=4000 bun run dev:server`, and run `bun run dev:web` in a second terminal. Restore the same-origin settings before using the combined runtime.
