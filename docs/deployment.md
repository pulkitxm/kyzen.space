# Running and deploying Kyzen

The default runtime is one Bun process serving Next.js, the API, and Socket.IO on port 3000. Both Docker and host development use `apps/web/server.ts`, which mounts the shared server from `apps/server/src/http.ts`. Next.js handles frontend hot reload; `apps/web/scripts/dev.ts` restarts the process only for backend source or environment changes. Generated `.next` files never trigger a server restart.

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

## Vercel services

The root `vercel.json` deploys two services in one Vercel project. Set the project's Root Directory to the repository root so Vercel can read that configuration and build the Bun workspaces.

Use `kyzen-space` as the Vercel project name. The container registry rejects project names containing periods: `kyzen.space` fails while uploading the backend image with `NAME_INVALID: invalid project slug`, even though the container builds successfully. The GitHub repository can keep its existing name. Renaming the Vercel project preserves its project ID, Git connection, and the assigned `kyzenspace.vercel.app` domain, but changes generated preview hostnames. Redeploy failed builds after renaming, and update preview auth origins to the new hostnames.

| Service | Build and runtime | Public paths |
| --- | --- | --- |
| `app` | Backend-only Bun container from `Dockerfile.vercel`, running `apps/server/src/index.ts` | `/api`, `/api/*`, `/socket.io`, `/socket.io/*`, `/health` |
| `web` | Next.js in `apps/web`, installed from the workspace root and built with `next build` | All remaining paths, including pages and Next.js assets |

The specific rewrites precede the frontend catch-all. Vercel preserves the original request path, so Hono keeps its `/api` base path and Socket.IO keeps `/socket.io`. Both services have public routes; neither service is entirely internal. Postgres and Redis remain external managed databases, not HTTP services or binding targets.

`web` declares one service binding to `app`, which injects `APP_URL`. Server Components read it at request time through `lib/api-server.ts`, forward the session cookie, and request the existing `/api/*` endpoints. The backend does not call the frontend, so it has no binding. Never set `APP_URL` manually, include it in a public variable, or resolve it in a build or middleware. Missing bindings on Vercel fail explicitly instead of fetching localhost. Host development continues to use `API_URL` or the combined server's local port.

Browser API, Better Auth, and Socket.IO calls use the shared public origin. Leave `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` unset or empty in Vercel, and remove old split-host values. Set these project environment variables for each deployment environment:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | External Postgres connection URL |
| `REDIS_URL` | External Redis connection URL for coordination across backend instances |
| `BETTER_AUTH_SECRET` | Random secret of at least 32 characters |
| `BETTER_AUTH_URL` | Public deployment origin |
| `WEB_URL` | Same public deployment origin |
| `PUBLIC_REALTIME_URL` | Same public deployment origin, or omit to use `BETTER_AUTH_URL` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional OAuth credentials |

Use origins that match the production or preview domain, never the internal binding URL. Configure Google OAuth callbacks as `<BETTER_AUTH_URL>/api/auth/callback/google`. Run `bun run db:migrate` separately against the intended database before serving traffic; the container does not migrate or seed on startup. The container listens on `0.0.0.0:80` by default and honors an injected `PORT`.

Configure preview credentials separately from production, using an isolated Postgres database with synthetic data. A ready deployment only confirms that the build and upload succeeded. Check `/health`, guest sign-in, and a complete authenticated two-player game before considering the app operational. Missing `DATABASE_URL` or `BETTER_AUTH_SECRET` prevents the backend from starting.

For local services development, start the local databases and apply the schema as described above, then run from the repository root:

```bash
bunx vercel@latest dev --local
```

`vercel dev` also works with a linked project. Both modes inject the service binding. Vercel builds and runs the backend container while the frontend development command runs Next.js on a Vercel-assigned port. The frontend command honors the assigned `PORT` instead of starting the combined custom server. Export the database and auth variables from the local setup in the shell before starting Vercel, with auth origins matching its public listener, usually `http://localhost:3000`. Binding variables are provided by Vercel. Docker and its daemon are required for `vercel dev` and for building and testing `Dockerfile.vercel`.

Run `bun run --cwd apps/web smoke:game` against the local Vercel listener to exercise the homepage, guest auth, two authenticated players, reconnect recovery, and persisted completion. Set `SMOKE_ORIGIN` when using a different public port.

Vercel CLI 62.1.0 routed `/socket.io` upgrade requests to the frontend during a local host-backend services check, despite the backend rewrite. HTTP routing and guest sign-in worked in that check. Verify WebSocket routing with a corrected CLI and the container runtime before claiming the complete services smoke flow passes.

### Realtime production limitation

This configuration establishes builds, routing, and service communication. It does not make the existing process-local turn timers durable. Vercel container services run as Functions, can scale across instances, and scale down when idle. WebSocket connections also close at the function duration limit. The browser already uses WebSocket-only Socket.IO transport and reconnects; Redis coordinates rooms, presence, and matchmaking, but does not restore turn deadlines or assign durable timer ownership.

Before relying on this deployment for production timed games, move deadline execution and timer ownership into durable infrastructure and verify recovery across instance restarts and scale-out. A successful local services smoke test only verifies one backend process. For the current timed-game implementation, the persistent single-instance Docker deployment remains the supported production option.

See [Vercel services](https://vercel.com/docs/services), [service bindings](https://vercel.com/docs/services/bindings), [service routing](https://vercel.com/docs/services/routing), [container images](https://vercel.com/docs/functions/container-images), and [WebSockets](https://vercel.com/docs/functions/websockets).
