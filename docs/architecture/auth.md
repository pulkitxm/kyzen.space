# Authentication & Sessions

## What this is / why it matters

GameLobby has exactly **one** notion of identity, and it lives on the **server**. Authentication is implemented with [Better Auth](https://better-auth.com), configured once in `apps/server/src/auth.ts:10`, mounted as a catch-all route at `/api/auth/*`, and backed by four Drizzle/Postgres tables (`user`, `session`, `account`, `verification`). Sign-in is **Google OAuth only** today (email/password is stubbed out in the UI). The server is the sole issuer and validator of session cookies; the Next.js frontend never mints or inspects credentials itself — it always asks the server.

This matters because of the repo's core architectural principle: **the client is never trusted.** The same way the server authoritatively validates game moves against shared Zod schemas (see `./games-core-engine.md`), it also authoritatively decides *who you are*. There are exactly three places a request can prove identity, and **all three resolve the same Better Auth session from the same cookie**:

1. **RSC / SSR** — Next.js server components call the server over HTTP, forwarding the browser's cookies (`apps/web/lib/get-server-session.ts:16`).
2. **Browser fetches** — `"use client"` components call the server with `credentials: "include"` (`apps/web/lib/api-client.ts:6`).
3. **Socket.IO handshake** — the realtime middleware reads the cookie off the WebSocket handshake and resolves the session before any game/chat event is allowed (`apps/server/src/realtime/index.ts:33`).

A nice second-order effect: on a user's **first** sign-in, Better Auth fires a `databaseHooks.user.create.after` hook that provisions a `user_profile` row (username + a name-styled DiceBear avatar). So "auth" and "profile bootstrap" are a single atomic flow — by the time a session cookie exists, the user already has a username.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/auth.ts` | The Better Auth instance: secret, base URL, trusted origins, Drizzle adapter, Google provider, first-sign-in profile hook, prod cookie attributes. |
| `apps/server/src/username.ts` | `ensureUsernameForUser` (provisioning) + `isUsernameBlocked` / `suggestUsernames`, wiring the pure `username-rules.ts` helpers to env + DB. |
| `apps/server/src/username-rules.ts` | Pure, dependency-free username rules: normalize, format check, `RESERVED_USERNAMES`, CSV blocklist parse, candidate/suggestion builders, cooldown math. |
| `apps/server/src/api/index.ts` | Mounts Better Auth's request handler at `/api/auth/*` inside the Hono app. |
| `apps/server/src/api/middleware/auth.ts` | `requireAuth` middleware — how REST routers read the session from request headers and gate on it. |
| `apps/server/src/api/routes/account.ts` | Session-management REST: list sessions, sign out, revoke a session, revoke all others. |
| `apps/server/src/db/schema.ts` | The `user` / `session` / `account` / `verification` Drizzle tables the adapter maps onto. |
| `apps/server/src/db/client.ts` | The Drizzle `db` + `schema` handed to `drizzleAdapter`. |
| `apps/server/src/db/repositories/profiles.ts` | `getProfileByUserId`, `isUsernameTaken`, `createProfile` used during provisioning. |
| `apps/server/src/realtime/index.ts` | Socket.IO `io.use(...)` auth middleware: resolve session from the handshake cookie, attach `socket.data.userId`. |
| `apps/server/src/env.ts` | `betterAuthSecret`, `betterAuthUrl`, `webUrl`, Google credentials, `googleConfigured()`. |
| `apps/web/lib/auth-client.ts` | Better Auth React client (`signIn.social`, etc.), pointed at `NEXT_PUBLIC_API_URL`. |
| `apps/web/lib/get-server-session.ts` | `getServerSession()` — RSC-side, cookie-forwarding, `react.cache`-deduped session read. |
| `apps/web/lib/get-account-sessions.ts` | `getAccountSessions()` — RSC read of the full session list for the settings page. |
| `apps/web/lib/api-server.ts` | `serverFetch*` — forwards the user's cookies from RSC to the server, `cache: "no-store"`. |
| `apps/web/lib/api-client.ts` | `clientFetch*` — browser fetch with `credentials: "include"`. |
| `apps/web/app/auth/page.tsx` | Sign-in page; redirects to `/profile` if already signed in. |
| `apps/web/app/google-sign-in-button.tsx` | The "Continue with Google" button → `authClient.signIn.social`. |
| `apps/web/app/sign-out-form.tsx` | Sign out the current session. |
| `apps/web/app/session-end-form.tsx` | Revoke one specific session by token. |
| `apps/web/app/revoke-others-form.tsx` | Revoke all sessions except the current one. |
| `apps/web/app/settings/page.tsx` | Renders the active-session list + the three session forms. |
| `apps/web/lib/socket/socket-context.tsx` | Socket.IO client; `withCredentials: true` so the session cookie rides the handshake. |

## The Better Auth instance

Everything funnels through one configured instance in `apps/server/src/auth.ts:10`. There is a single accessor, `getAuth()` (`apps/server/src/auth.ts:56`), so the rest of the codebase never imports the raw `auth` object directly — it asks for it, which keeps the dependency surface tiny and makes the instance trivially mockable in tests.

```ts
export const auth = betterAuth({
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthUrl,
  trustedOrigins: [env.webUrl],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: googleConfigured()
    ? {
        google: {
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret,
        },
      }
    : {},
```

Key decisions:

- **`baseURL: env.betterAuthUrl`** (default `http://localhost:4000`, `apps/server/src/env.ts:40`) — Better Auth lives on the **server**, not the web app. The browser hits `${NEXT_PUBLIC_API_URL}/api/auth/...`, and the OAuth callback URI is `[server URL]/api/auth/callback/google` (the sign-in page literally tells you this at `apps/web/app/auth/page.tsx:50`).
- **`trustedOrigins: [env.webUrl]`** — only the Next.js origin (default `http://localhost:3000`) is allowed to drive auth flows, which is the CSRF/redirect allowlist.
- **`drizzleAdapter(db, { provider: "pg", schema })`** — the adapter persists users/sessions/accounts into the very same Postgres + Drizzle setup the rest of the server uses (`apps/server/src/db/client.ts:12`). No separate auth store.
- **`socialProviders`** is conditional on `googleConfigured()` (`apps/server/src/env.ts:54`), which returns `true` only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Without them the object is `{}` and there is no working sign-in — the UI degrades gracefully (see below).

The `advanced` block only turns on in production (`apps/server/src/auth.ts:46`):

```ts
  advanced: env.isProd
    ? {
        crossSubDomainCookies: { enabled: true },
        defaultCookieAttributes: { sameSite: "lax", secure: true },
      }
    : undefined,
```

In production the web and server are expected on sibling subdomains, so cookies are shared cross-subdomain and marked `secure` + `SameSite=Lax`. In dev (`localhost:3000` ↔ `localhost:4000`) those attributes are omitted so the cookie works across the two ports.

### First-sign-in profile provisioning

This is the most load-bearing piece of the config. Better Auth's Drizzle adapter inserts the `user` row; the `databaseHooks.user.create.after` hook runs immediately afterward and bootstraps the application-level profile (`apps/server/src/auth.ts:23`):

```ts
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          try {
            const username = await ensureUsernameForUser(
              createdUser.id,
              createdUser.name,
            );
            log.info(
              { userId: createdUser.id, username },
              "provisioned profile on first sign-in",
            );
          } catch (err) {
            log.error(
              { err, userId: createdUser.id },
              "failed to provision profile",
            );
          }
        },
      },
    },
  },
```

Note the **catch-and-log**: provisioning failure does not abort account creation. The hook is best-effort; the auth row is the source of truth, and a profile can be (re-)created later because `ensureUsernameForUser` is idempotent (it early-returns an existing profile). The split is deliberate — Better Auth owns the `user`/`session`/`account` tables; the app owns `user_profile` (username, avatar, stats, theme), which is keyed by `userId` with a unique constraint (`apps/server/src/db/schema.ts:169`).

## Username generation

`ensureUsernameForUser` (`apps/server/src/username.ts:23`) turns a Google display name into a unique, URL-safe username and creates the profile. The flow:

1. **Idempotency guard** — `getProfileByUserId` first; if a profile exists, return its username (`apps/server/src/username.ts:27`). This is why the hook is safe to retry.
2. **Name-styled seeded avatar** — `predictAvatarStyle(displayName)` (`apps/server/src/services/gender-detection.ts`) guesses a `feminine`/`masculine`/`any` style from the user's first name, then `randomAvatarConfig(userId, style)` produces a deterministic DiceBear avataaars config seeded by the user id with that style bias (`apps/server/src/username.ts`). Same user → same starting avatar; the style only nudges hairstyle and facial-hair probability and stays fully editable afterwards. The guess calls the genderize.io API (keyed by `GENDERIZE_API_KEY`, ~2s timeout) and falls back to an offline name dictionary (`gender-detection-from-name`), then to a neutral `any`, whenever the API is unavailable, the result is low-confidence, the key is unset, or `NODE_ENV=test` (so tests never spend API quota). (See `./README.md` for the avatar package; the repo uses ready-made DiceBear assets rather than hand-drawn art.)
3. **Slugify** — `slugifyBase` lowercases, collapses whitespace to `_`, strips anything outside `[a-z0-9_]`, caps at 30 chars, and falls back to `"player"` if nothing survives (`apps/server/src/username-rules.ts`). Candidates are then filtered through `isUsernameBlocked`, so a reserved route name or a `NOT_ALLOWED_USERNAMES` entry is never auto-assigned.
4. **Collision retry loop** — try the base, then `base_<random6>` up to 20 times, checking `isUsernameTaken` (a case-insensitive `lower(username)` lookup, `apps/server/src/db/repositories/profiles.ts:47`) before each insert:

```ts
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    if (!(await isUsernameTaken(candidate))) {
      try {
        const profile = await createProfile({
          userId,
          username: candidate,
          avatar,
        });
        return profile.username;
      } catch {}
    }
    candidate = `${base}_${randomSuffix()}`;
  }
  candidate = `player_${randomSuffix()}`;
```

The `try { ... } catch {}` around `createProfile` matters: `isUsernameTaken` plus an `INSERT` is a check-then-act race, and `user_profile.username` carries a `unique` constraint (`apps/server/src/db/schema.ts:171`). If two sign-ins race to the same username the loser's insert throws, the `catch` swallows it, and the loop generates a new suffix. After 20 attempts it falls through to a guaranteed-random `player_<random6>` and inserts unconditionally (`apps/server/src/username.ts:46`). The database unique index is the real authority; the loop is just an optimistic fast path.

## The auth tables & the Drizzle adapter mapping

Better Auth ships a fixed schema contract; the Drizzle adapter expects tables whose names and columns match. They live alongside the app's domain tables in `apps/server/src/db/schema.ts`:

- **`user`** (`:36`) — `id` (text PK, not a uuid — Better Auth generates these), `name`, unique `email`, `emailVerified`, `image`, timestamps. This is the canonical identity row; `user_profile`, `session`, `account`, friendships, conversations, etc. all `references(() => user.id, { onDelete: "cascade" })`.
- **`session`** (`:52`) — `id`, `expiresAt`, unique `token`, `ipAddress`, `userAgent`, and `userId` FK with `onDelete: "cascade"`. The cookie carries the `token`; one row per active sign-in (per device/browser). `ipAddress`/`userAgent` are what the settings page surfaces per session.
- **`account`** (`:65`) — links a `user` to an external provider login: `providerId` (`"google"`), `accountId` (the Google subject id), the OAuth `accessToken`/`refreshToken`/`idToken`, and a nullable `password` column reserved for the future email/password provider. One row per linked provider.
- **`verification`** (`:83`) — `identifier`/`value`/`expiresAt` rows used for verification/reset tokens (unused by the Google-only flow today, but required by the contract).

The adapter is wired in one line — `drizzleAdapter(db, { provider: "pg", schema })` (`apps/server/src/auth.ts:14`) — where `db` and `schema` come straight from `apps/server/src/db/client.ts:12`. Because the same `db` instance is shared, auth writes go through the same connection pool (and the same optional `DB_LATENCY_MS` latency wrapper) as everything else.

## Mounting `/api/auth/*`

Better Auth exposes a single WHATWG-`Request`→`Response` handler. It's mounted as a Hono sub-app that forwards *every* method and path to it (`apps/server/src/api/index.ts:14`):

```ts
const authApp = new Hono().all("*", (c) => getAuth().handler(c.req.raw));

export const app = new Hono<LoggerEnv>()
  .basePath("/api")
  .use("*", requestLogger)
  .route("/auth", authApp)
  .route("/account", accountRouter)
```

So `GET /api/auth/get-session`, `POST /api/auth/sign-in/social`, `GET /api/auth/callback/google`, `POST /api/auth/sign-out`, etc. are all handled by Better Auth — the app never enumerates them. `c.req.raw` is the underlying `Request`, which is exactly what `handler` wants.

How the request reaches Hono in the first place: the top-level server is Express, and a single regex route forwards `/api/*` into the Hono app via `@hono/node-server`'s `getRequestListener` (`apps/server/src/index.ts:23`). CORS is configured at the Express layer with `origin: env.webUrl, credentials: true` (`apps/server/src/index.ts:12`) so the browser is allowed to send the session cookie cross-origin.

## How routes read the session (REST)

Two patterns, both reading from the **request headers** (where the cookie lives):

- **`requireAuth` middleware.** The standard gate (`apps/server/src/api/middleware/auth.ts`) resolves the session, `401`s when there's no `user.id`, and stashes `userId`/`user`/`session` on the context:

```ts
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const result = await getAuth().api.getSession({ headers: c.req.raw.headers });
  if (!result?.user?.id) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", result.user.id);
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
};
```

Fully-authed routers (`conversations`, `friends`, `messages`, `notifications`, `gifs`) apply it once with `.use("*", requireAuth)`; `profiles` opts in per-route on `/me*`. Handlers then read `c.get("userId")`. The session is never passed in as a parameter — it's always re-derived from the request, server-side, so a client cannot spoof a `userId`.

- **Session management.** `apps/server/src/api/routes/account.ts` calls the Better Auth server API directly (`auth.api.*`) rather than `requireAuth`, because the session object is its payload (not just a gate), always passing `c.req.raw.headers`:
  - `GET /api/account/sessions` (`:5`) — guards on `getSession`, then `listSessions`, sorted newest-first by `updatedAt`. Returns `{ current, sessions }`.
  - `POST /api/account/sign-out` (`:23`) — `signOut`.
  - `POST /api/account/revoke-others` (`:28`) — guard, then `revokeOtherSessions` (keeps the current one).
  - `POST /api/account/revoke-session` (`:37`) — revoke a session by `token`. There's a subtlety here worth internalizing: if the supplied token *is* the current session's token, it calls `signOut` and returns `{ ok: true, signedOut: true }` instead of `revokeSession`, so the UI knows to redirect to `/auth`:

```ts
    if (current.session.token === token) {
      await auth.api.signOut({ headers });
      return c.json({ ok: true, signedOut: true });
    }
    await auth.api.revokeSession({ headers, body: { token } });
```

## How the socket reads the session (realtime)

The realtime layer authenticates **once, at connection time**, before any handler is attached. Socket.IO middleware (`io.use`) reads the raw `cookie` header from the handshake, hands it to the same `getSession`, and either attaches `socket.data.userId` or rejects the connection (`apps/server/src/realtime/index.ts:33`):

```ts
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie;
      const session = await getAuth().api.getSession({
        headers: new Headers(cookie ? { cookie } : {}),
      });
      const userId = session?.user?.id;
      if (!userId) {
        log.debug("socket auth rejected (no session)");
        return next(new Error("Unauthorized"));
      }
      socket.data.userId = userId;
      next();
    } catch (e) {
      log.warn({ err: e }, "socket auth failed");
      next(e instanceof Error ? e : new Error("Auth failed"));
    }
  });
```

The cookie reaches the handshake because the web client opens the socket with `withCredentials: true` (`apps/web/lib/socket/socket-context.tsx:46`) and the server enables `cors: { origin: env.webUrl, credentials: true }` on the IO server (`apps/server/src/realtime/index.ts:27`).

After this point, **every** chat and game handler trusts `socket.data.userId` as the authenticated identity for the lifetime of the connection — `join_room`, `make_move`, chat sends, friend requests, presence, etc. (`apps/server/src/realtime/index.ts:57`). Note the layering: this middleware only proves *who you are*; per-move/per-room authorization (are you a player in this game? a member of this conversation?) happens later in the game driver and chat handlers. See `./realtime.md`.

## End-to-end sign-in flow

A full trace from clicking the button to being authenticated on all three lanes:

1. **User clicks "Continue with Google."** `apps/web/app/auth/page.tsx:41` renders `<GoogleSignInButton>`, which calls `authClient.signIn.social({ provider: "google", callbackURL: ".../profile" })` (`apps/web/app/google-sign-in-button.tsx:20`). The `authClient` is a Better Auth React client pointed at `NEXT_PUBLIC_API_URL` (`apps/web/lib/auth-client.ts:3`).
2. **Browser → server.** The client hits `POST /api/auth/sign-in/social` on the **server**, which Better Auth handles via the catch-all (`apps/server/src/api/index.ts:14`) and responds with a redirect to Google's consent screen.
3. **Google OAuth.** User authenticates with Google; Google redirects back to `GET /api/auth/callback/google` on the server.
4. **Better Auth callback.** Better Auth exchanges the code, and via the Drizzle adapter upserts the `user` (`apps/server/src/db/schema.ts:36`) and `account` (`:65`) rows and creates a `session` row (`:52`).
5. **Profile provisioning (first sign-in only).** Creating the `user` row fires `databaseHooks.user.create.after` (`apps/server/src/auth.ts:26`) → `ensureUsernameForUser(id, name)` (`apps/server/src/username.ts:23`) → slugify + collision loop → `createProfile` inserts the `user_profile` row with a seeded avatar (`apps/server/src/db/repositories/profiles.ts:56`).
6. **Cookie set + redirect.** Better Auth sets the session cookie (in prod: `secure`, `SameSite=Lax`, cross-subdomain per `apps/server/src/auth.ts:48`) and redirects the browser to the `callbackURL` (`/profile`).
7. **RSC reads the session.** The `/profile` (and root layout) server component calls `getServerSession()` → `serverFetchJson("/api/auth/get-session")` (`apps/web/lib/get-server-session.ts:17`). `serverFetch` forwards the browser's cookies from `next/headers` `cookies()` with `cache: "no-store"` (`apps/web/lib/api-server.ts:13`), so the server resolves the session and returns `{ user, session }`. `getServerSession` is wrapped in `react.cache` so multiple components in one render share a single fetch.
8. **Socket connects.** Once `signedIn` is known, `<SocketProvider enabled>` opens the WebSocket with `withCredentials: true` (`apps/web/lib/socket/socket-context.tsx:44`); the handshake carries the same cookie; `io.use` resolves the session and sets `socket.data.userId` (`apps/server/src/realtime/index.ts:44`).
9. **Browser fetches.** Any subsequent client-side mutation (`SignOutForm`, friend actions, settings) uses `clientFetch(..., { credentials: "include" })` (`apps/web/lib/api-client.ts:12`), and the `requireAuth` middleware re-derives identity into `c.get("userId")` (`apps/server/src/api/middleware/auth.ts:16`).

Arrow summary:

```
click → authClient.signIn.social (auth-client.ts) → POST /api/auth/sign-in/social
  → Better Auth handler (api/index.ts:14) → Google consent
  → GET /api/auth/callback/google → drizzleAdapter upserts user/account/session
  → user.create.after hook (auth.ts:26) → ensureUsernameForUser (username.ts:23) → createProfile
  → Set-Cookie + redirect /profile
  → RSC getServerSession → serverFetch forwards cookie → /api/auth/get-session
  → socket handshake (withCredentials) → io.use getSession → socket.data.userId
```

## Sign-out & session management flow

The settings page (`apps/web/app/settings/page.tsx:17`) is an RSC that calls `getAccountSessions()` → `GET /api/account/sessions` (`apps/web/lib/get-account-sessions.ts:22`), splitting the list into the current session vs. others. It renders three client forms, each a thin `clientFetch` wrapper that then nudges the Next router:

- **`SignOutForm`** → `POST /api/account/sign-out`, then `router.push("/")` + `router.refresh()` (`apps/web/app/sign-out-form.tsx:16`).
- **`SessionEndForm`** (per other-session row) → `POST /api/account/revoke-session` with `{ token }`; if the response says `signedOut` it pushes to `/auth`, else refreshes (`apps/web/app/session-end-form.tsx:16`). This is what lets you end *the current* session from the list.
- **`RevokeOthersForm`** → `POST /api/account/revoke-others`, then refresh; it renders nothing when `otherSessionCount === 0` (`apps/web/app/revoke-others-form.tsx:17`).

`router.refresh()` is the trick that makes the UI consistent: it re-runs the RSC, which re-fetches `/api/account/sessions` server-side, so the revoked session disappears from the list without a manual client cache.

## Gotchas, invariants & conventions

- **Auth lives on the server, not the web app.** `betterAuth` is configured in `apps/server`, `baseURL` is the server URL, and the OAuth callback is `[server]/api/auth/callback/google`. The web app only holds a thin Better Auth *client* (`apps/web/lib/auth-client.ts`) plus cookie-forwarding fetch helpers.
- **Identity is always re-derived from the cookie, never trusted from the client.** REST → `requireAuth` reads `c.req.raw.headers`; sockets → `io.use` reads the handshake cookie. No route accepts a `userId` parameter as proof of identity.
- **Always go through `getAuth()`.** Nothing imports the bare `auth` object; the accessor (`apps/server/src/auth.ts:56`) keeps a single instance and is the mock point in tests (`mock.module` per the repo's test conventions).
- **No Google creds → no sign-in, gracefully.** `googleConfigured()` gates the provider (`apps/server/src/env.ts:54`); the sign-in page independently checks `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and shows setup instructions instead of a broken button (`apps/web/app/auth/page.tsx:10`). `BETTER_AUTH_SECRET` and `DATABASE_URL` are `required()` and crash startup if missing; Google creds are `optional()`.
- **`user.id` is `text`, not `uuid`.** Better Auth generates the id (`apps/server/src/db/schema.ts:37`). The app's own tables (`game`, `move`, `user_profile`, …) use uuid PKs but still store the auth user id as `text` in FK columns like `userId` / `creator_user_id`.
- **Profile provisioning is best-effort and idempotent.** The `create.after` hook swallows errors (`apps/server/src/auth.ts:36`); `ensureUsernameForUser` early-returns if a profile already exists (`apps/server/src/username.ts:28`). The DB unique constraint on `user_profile.username` — not the in-memory `isUsernameTaken` check — is the real collision authority.
- **`user_profile` ≠ `user`.** Better Auth owns `user`/`session`/`account`/`verification`; the application owns `user_profile` (username, avatar, stats, theme, layout). They join on `userId`, and the profile cascades on user delete.
- **Two web fetch paths, two env vars.** RSC uses `serverFetch` (`API_URL`, forwards `next/headers` cookies, `cache: "no-store"`); the browser uses `clientFetch` (`NEXT_PUBLIC_API_URL`, `credentials: "include"`). Use the server path inside RSCs and the client path inside `"use client"` components — they read the cookie from different places.
- **Auth-dependent pages set `export const dynamic = "force-dynamic"`** (e.g. `apps/web/app/auth/page.tsx:7`, `apps/web/app/settings/page.tsx:14`) because they depend on per-request cookies and must not be statically cached.
- **`getServerSession`/`getAccountSessions` are `react.cache`-wrapped** so the layout and a page in the same render share one network round-trip; don't reach for module-level memoization.
- **Cookies cross origins only because CORS allows it.** Both the Express HTTP layer (`apps/server/src/index.ts:12`) and the Socket.IO server (`apps/server/src/realtime/index.ts:27`) set `origin: env.webUrl, credentials: true`; the client mirrors this with `credentials: "include"` / `withCredentials: true`. Change the web origin and you must update `WEB_URL`.

## Where to go next

- [Architecture overview](./README.md) — the monorepo map and the "shared logic imported by both sides" insight.
- [Database](./database.md) — the Drizzle schema in full, including the `user_profile` and game tables the auth tables sit beside.
- [Realtime](./realtime.md) — what happens after the socket is authenticated: chat lane vs. game lane, drivers, and authorization per event.
- [Server API](./server-api.md) — the Hono router-per-feature layout that mounts `/api/auth/*` and reads identity via the `requireAuth` middleware.
- [Web](./web.md) — the Next.js App Router side, the `serverFetch`/`clientFetch` split, and the socket provider.
