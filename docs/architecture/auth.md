# Authentication & Sessions

## What this is / why it matters

GameLobby has exactly **one** notion of identity, and it lives on the **server**. Authentication is implemented with [Better Auth](https://better-auth.com), configured once in `apps/server/src/auth.ts:12`, mounted as a catch-all route at `/api/auth/*`, and backed by four Drizzle/Postgres tables (`user`, `session`, `account`, `verification`). Sign-in is **Google OAuth** or an **anonymous guest session** today (email/password is stubbed out in the UI). The server is the sole issuer and validator of session cookies; the Next.js frontend never mints or inspects credentials itself - it always asks the server.

A **guest is a real identity, not a sessionless escape hatch.** The Better Auth `anonymous` plugin (`apps/server/src/auth.ts:18`) mints a genuine `user` row with `isAnonymous = true` and a throwaway email, so a guest gets the exact same session cookie, the same provisioned `user_profile` (username + avatar), and the same authenticated socket/REST lanes as a Google user. Everything downstream of identity - chat, presence, games - is identical for guests; the one deliberate behavioral branch is the **guest friend cap** (a guest can add at most `ANON_MAX_FRIENDS` = 5 friends; see below).

This matters because of the repo's core architectural principle: **the client is never trusted.** The same way the server authoritatively validates game moves against shared Zod schemas (see `./games-core-engine.md`), it also authoritatively decides *who you are*. There are exactly three places a request can prove identity, and **all three resolve the same Better Auth session from the same cookie**:

1. **RSC / SSR** - Next.js server components call the server over HTTP, forwarding the browser's cookies (`apps/web/lib/get-server-session.ts:17`).
2. **Browser fetches** - `"use client"` components call the server with `credentials: "include"` (`apps/web/lib/api-client.ts:11`).
3. **Socket.IO handshake** - the realtime middleware reads the cookie off the WebSocket handshake and resolves the session before any game/chat event is allowed (`apps/server/src/realtime/index.ts:42`).

A nice second-order effect: on a user's **first** sign-in, Better Auth fires a `databaseHooks.user.create.after` hook that provisions a `user_profile` row (username + a name-styled DiceBear avatar). So "auth" and "profile bootstrap" are a single atomic flow - by the time a session cookie exists, the user already has a username. The same hook runs for guests; it passes `{ skipGenderDetection: true }` when the new row is anonymous so a guest never triggers the external genderize.io call.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/server/src/auth.ts` | The Better Auth instance: secret, base URL, trusted origins, Drizzle adapter, `anonymous` (guest) plugin, Google provider, first-sign-in profile hook, prod cookie attributes. |
| `apps/server/src/guest-name.ts` | `generateGuestName()` - the `Guest-<random6>` display name the `anonymous` plugin assigns to a new guest `user` row. |
| `apps/server/src/username.ts` | `ensureUsernameForUser` (provisioning, with an `opts?: { skipGenderDetection? }` for guests) + `isUsernameBlocked` / `suggestUsernames`, wiring the `username-rules.ts` helpers to env + DB. |
| `apps/server/src/username-rules.ts` | Username rule helpers: CSV blocklist parse (`parseUsernameCsv`), `slugifyBase`, candidate/suggestion builders (`buildUsernameCandidates` / `selectSuggestions`), and cooldown math (`usernameEditableAt`). Imports `USERNAME_MAX_LENGTH` and `normalizeUsername` from `@gamelobby/shared` - normalize / format-check / `RESERVED_USERNAMES` themselves now live in `@gamelobby/shared` (`packages/shared/src/types/username.ts`, `packages/shared/src/constants/username.ts`). |
| `apps/server/src/api/index.ts` | Mounts Better Auth's request handler at `/api/auth/*` inside the Hono app. |
| `apps/server/src/api/middleware/auth.ts` | `requireAuth` middleware - how REST routers read the session from request headers and gate on it. |
| `apps/server/src/api/routes/account.ts` | Session-management REST (list sessions, sign out, revoke a session, revoke all others) **plus** the consent-gated account-merge endpoints `GET /merge/pending`, `POST /merge/:id/confirm`, `POST /merge/:id/discard`. |
| `packages/database/src/repositories/account-merge.ts` | The `accountMerge` repository: `recordPending` (called by `onLinkAccount`), `getById` / `getPendingForTarget` / `markResolved`, the privacy-safe `summarizeAnonAccount` (counts only), `deleteAnonUserData` (discard), and the `mergeAccounts(anonId, targetId)` migration transaction. |
| `apps/web/app/merge-consent.tsx` | The `MergeConsent` dialog: polls `GET /api/account/merge/pending`, shows the counts-only summary, and runs confirm / discard. Mounted in `app-shell.tsx` only when signed in and **not** anonymous. |
| `apps/web/lib/account-merge.ts` | The browser merge client: `getPendingMerge`, `confirmMerge(id)`, `discardMerge(id)`, plus the `PendingMerge` / `MergeSummary` types. |
| `packages/database/src/schema.ts` | The `user` / `session` / `account` / `verification` Drizzle tables the adapter maps onto, plus the `account_merge` ledger (in `@gamelobby/database`). |
| `packages/database/src/client.ts` | The Drizzle `db` + `schema` singleton handed to `drizzleAdapter` (imported by `auth.ts` from `@gamelobby/database`). |
| `packages/database/src/repositories/profiles.ts` | `getProfileByUserId`, `getTakenUsernames` (batched availability), `createProfile` used during provisioning. |
| `apps/server/src/realtime/index.ts` | Socket.IO `io.use(...)` auth middleware: resolve session from the handshake cookie, attach `socket.data.userId`. |
| `apps/server/src/env.ts` | `betterAuthSecret`, `betterAuthUrl`, `webUrl`, Google credentials, `googleConfigured()`. |
| `apps/web/lib/auth-client.ts` | Better Auth React client (`signIn.social`, `signIn.anonymous`, etc.) with the `anonymousClient()` plugin, pointed at `NEXT_PUBLIC_API_URL`. |
| `apps/web/lib/auth/ensure-identity.ts` | `ensureIdentity()` - lazily mints an anonymous session via `authClient.signIn.anonymous()` when none exists. |
| `apps/web/app/auth/guest-button.tsx` | The "Continue as a guest" button on the auth page → `ensureIdentity()` then `router.push("/")`. |
| `apps/web/app/guest-nudge.tsx` | The fixed "Sign in to save your games" nudge, rendered only when the session is `isAnonymous`. |
| `apps/web/lib/get-server-session.ts` | `getServerSession()` - RSC-side, cookie-forwarding, `react.cache`-deduped session read; the user shape carries an optional `isAnonymous`. |
| `apps/web/lib/get-account-sessions.ts` | `getAccountSessions()` - RSC read of the full session list for the settings page. |
| `apps/web/lib/api-server.ts` | `serverFetch*` - forwards the user's cookies from RSC to the server, `cache: "no-store"`. |
| `apps/web/lib/api-client.ts` | `clientFetch*` - browser fetch with `credentials: "include"`. |
| `apps/web/app/auth/page.tsx` | Sign-in page; redirects to `/profile` if already signed in. |
| `apps/web/app/google-sign-in-button.tsx` | The "Continue with Google" button → `authClient.signIn.social`. |
| `apps/web/app/sign-out-form.tsx` | Sign out the current session. |
| `apps/web/app/session-end-form.tsx` | Revoke one specific session by token. |
| `apps/web/app/revoke-others-form.tsx` | Revoke all sessions except the current one. |
| `apps/web/app/settings/page.tsx` | Redirects `/settings` → `/settings/account` (the default tab). |
| `apps/web/app/settings/account/page.tsx` | The Account tab: identity form + active-session list + the three session forms. |
| `apps/web/lib/socket/socket-context.tsx` | Socket.IO client; `withCredentials: true` so the session cookie rides the handshake. |

## The Better Auth instance

Everything funnels through one configured instance in `apps/server/src/auth.ts:12`. There is a single accessor, `getAuth()` (`apps/server/src/auth.ts:84`), so the rest of the codebase never imports the raw `auth` object directly - it asks for it, which keeps the dependency surface tiny and makes the instance trivially mockable in tests.

```ts
const auth = betterAuth({
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthUrl,
  trustedOrigins: [env.webUrl],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => generateGuestName(),
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        try {
          await accountMerge.recordPending(
            anonymousUser.user.id,
            newUser.user.id,
          );
          log.info(
            { anonId: anonymousUser.user.id, targetId: newUser.user.id },
            "recorded pending account merge",
          );
        } catch (err) {
          log.error(
            { err, anonId: anonymousUser.user.id, targetId: newUser.user.id },
            "failed to record pending account merge",
          );
        }
      },
    }),
  ],
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

- **`baseURL: env.betterAuthUrl`** (default `http://localhost:4000`, `apps/server/src/env.ts:36`) - Better Auth lives on the **server**, not the web app. The browser hits `${NEXT_PUBLIC_API_URL}/api/auth/...`, and the OAuth callback URI is `[server URL]/api/auth/callback/google` (the sign-in page literally tells you this at `apps/web/app/auth/page.tsx:50`).
- **`trustedOrigins: [env.webUrl]`** - only the Next.js origin (default `http://localhost:3000`) is allowed to drive auth flows, which is the CSRF/redirect allowlist.
- **`drizzleAdapter(db, { provider: "pg", schema })`** - `db` and `schema` are imported from `@gamelobby/database` (`apps/server/src/auth.ts:1`), so the adapter persists users/sessions/accounts into the very same Postgres + Drizzle singleton the rest of the server uses (`packages/database/src/client.ts:20`). No separate auth store.
- **`plugins: [anonymous({ … })]`** (`apps/server/src/auth.ts:17`) enables guest play. `signIn.anonymous` inserts a real `user` row with `isAnonymous = true` and a throwaway email; `generateName: () => generateGuestName()` (`apps/server/src/guest-name.ts:3`) sets the display name to `Guest-<random6>`, and `disableDeleteAnonymousUser: true` stops Better Auth from auto-deleting that row when the guest later links a real account - the guest's history (profile, games, messages) must survive the upgrade. The **`onLinkAccount` hook** (`apps/server/src/auth.ts:21`) fires when a guest signs in with Google: it does **not** migrate any data, it only records a *pending* merge via `accountMerge.recordPending(anonymousUser.user.id, newUser.user.id)` (`packages/database/src/repositories/account-merge.ts:30`), and the failure is caught and logged so a recorder hiccup never blocks the link. The actual data migration is **consent-gated** and runs later, only when the now-real user explicitly confirms (or discards) the merge via the `/api/account/merge/*` endpoints - see "The account-merge flow" below.
- **`socialProviders`** is conditional on `googleConfigured()` (`apps/server/src/env.ts:58`), which returns `true` only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Without them the object is `{}` and Google sign-in is unavailable, but the **guest button still works** (the anonymous plugin needs no external credentials), and the UI degrades gracefully (see below).

The `advanced` block only turns on in production (`apps/server/src/auth.ts:74`):

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

This is the most load-bearing piece of the config. Better Auth's Drizzle adapter inserts the `user` row - for a Google sign-in *or* a guest `signIn.anonymous` - and the `databaseHooks.user.create.after` hook runs immediately afterward and bootstraps the application-level profile (`apps/server/src/auth.ts:48`):

```ts
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          try {
            const isAnon =
              (createdUser as { isAnonymous?: boolean }).isAnonymous === true;
            const username = await ensureUsernameForUser(
              createdUser.id,
              createdUser.name,
              { skipGenderDetection: isAnon },
            );
            log.info(
              { userId: createdUser.id, username, isAnon },
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

The hook reads `isAnonymous` off the freshly-created row and threads `{ skipGenderDetection: isAnon }` into `ensureUsernameForUser`, so a guest's avatar uses the neutral `any` style and **never spends genderize.io quota** (their `Guest-<random6>` name carries no gender signal anyway). Note the **catch-and-log**: provisioning failure does not abort account creation. The hook is best-effort; the auth row is the source of truth, and a profile can be (re-)created later because `ensureUsernameForUser` is idempotent (it early-returns an existing profile). The split is deliberate - Better Auth owns the `user`/`session`/`account` tables; the app owns `user_profile` (username, avatar, stats, theme), which is keyed by `userId` with a unique constraint (`packages/database/src/schema.ts:173`).

## Username generation

`ensureUsernameForUser` (`apps/server/src/username.ts:43`) turns a Google display name into a unique, URL-safe username and creates the profile. The flow:

1. **Idempotency guard** - `getProfileByUserId` first; if a profile exists, return its username (`apps/server/src/username.ts:48`). This is why the hook is safe to retry.
2. **Name-styled seeded avatar** - `predictAvatarStyle(displayName)` (`apps/server/src/services/gender-detection.ts`) guesses a `feminine`/`masculine`/`any` style from the user's first name, then `randomAvatarConfig(userId, style)` produces a deterministic DiceBear avataaars config seeded by the user id with that style bias (`apps/server/src/username.ts:54`). Same user → same starting avatar; the style only nudges hairstyle and facial-hair probability and stays fully editable afterwards. The guess calls the genderize.io API (keyed by `GENDERIZE_API_KEY`, ~2s timeout) and falls back to an offline name dictionary (`gender-detection-from-name`), then to a neutral `any`, whenever the API is unavailable, the result is low-confidence, the key is unset, or `NODE_ENV=test` (so tests never spend API quota). When the caller passes `opts.skipGenderDetection` (the guest case, `apps/server/src/username.ts:51`) the prediction is skipped entirely and the style is forced to `any`. (See `./README.md` for the avatar package; the repo uses ready-made DiceBear assets rather than hand-drawn art.)
3. **Slugify + build a candidate pool** - `slugifyBase` lowercases, collapses whitespace to `_`, strips anything outside `[a-z0-9_]`, caps at `USERNAME_MAX_LENGTH` (30) chars, and falls back to `"player"` if nothing survives (`apps/server/src/username-rules.ts:11`). `buildUsernameCandidates(base, CANDIDATE_COUNT)` then produces up to `CANDIDATE_COUNT` (20) candidates - the base, then `base_<random6>` variants (`apps/server/src/username-rules.ts:26`) - filtered through `isUsernameBlocked`, so a reserved route name or a `NOT_ALLOWED_USERNAMES` entry is never auto-assigned (`apps/server/src/username.ts:56`).
4. **Batched availability check** - instead of one `SELECT`-per-candidate, the candidates are scanned in batches of `BATCH_SIZE` (5). Each batch does a single `getTakenUsernames(batch)` lookup (a case-insensitive `lower(username)` `IN (...)` query, `packages/database/src/repositories/profiles.ts:62`) and inserts the first candidate the batch reports free (`apps/server/src/username.ts:60`):

```ts
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    const taken = await profiles.getTakenUsernames(batch);
    for (const candidate of batch) {
      if (taken.has(candidate.toLowerCase())) continue;
      try {
        const profile = await profiles.createProfile({
          userId,
          username: candidate,
          avatar,
        });
        return profile.username;
      } catch {}
    }
  }
```

The `try { ... } catch {}` around `createProfile` matters: the batched availability read plus an `INSERT` is still a check-then-act race, and `user_profile.username` carries a `unique` constraint (`packages/database/src/schema.ts:175`). If two sign-ins race to the same username the loser's insert throws, the `catch` swallows it, and the loop moves to the next candidate. If every candidate in the pool is taken, it falls through to a guaranteed-random `player_<random6>` and inserts unconditionally (`apps/server/src/username.ts:76`). The database unique index is the real authority; the candidate scan is just an optimistic fast path that the batching makes cheaper (≤4 queries for 20 candidates instead of up to 20).

## The auth tables & the Drizzle adapter mapping

Better Auth ships a fixed schema contract; the Drizzle adapter expects tables whose names and columns match. They live alongside the app's domain tables in `packages/database/src/schema.ts`:

- **`user`** (`:43`) - `id` (text PK, not a uuid - Better Auth generates these), `name`, unique `email`, `emailVerified`, `image`, `isAnonymous` (`is_anonymous boolean NOT NULL DEFAULT false`, `schema.ts:51` - the guest flag the `anonymous` plugin sets), timestamps. This is the canonical identity row; `user_profile`, `session`, `account`, friendships, conversations, etc. all `references(() => user.id, { onDelete: "cascade" })`.
- **`session`** (`:60`) - `id`, `expiresAt`, unique `token`, `ipAddress`, `userAgent`, and `userId` FK with `onDelete: "cascade"`. The cookie carries the `token`; one row per active sign-in (per device/browser). A guest session is an ordinary row here too. `ipAddress`/`userAgent` are what the settings page surfaces per session.
- **`account`** (`:73`) - links a `user` to an external provider login: `providerId` (`"google"`), `accountId` (the Google subject id), the OAuth `accessToken`/`refreshToken`/`idToken`, and a nullable `password` column reserved for the future email/password provider. One row per linked provider; a guest has no `account` row until they link one.
- **`verification`** (`:91`) - `identifier`/`value`/`expiresAt` rows used for verification/reset tokens (unused by the Google-only flow today, but required by the contract).

The adapter is wired in one line - `drizzleAdapter(db, { provider: "pg", schema })` (`apps/server/src/auth.ts:16`) - where `db` and `schema` are imported from `@gamelobby/database` (`apps/server/src/auth.ts:1`), backed by the singleton in `packages/database/src/client.ts:20`. Because the same `db` instance is shared, auth writes go through the same connection pool (and the same optional `DB_LATENCY_MS` latency wrapper, applied inside the database package) as everything else.

## Mounting `/api/auth/*`

Better Auth exposes a single WHATWG-`Request`→`Response` handler. It's mounted as a Hono sub-app that forwards *every* method and path to it (`apps/server/src/api/index.ts:15`):

```ts
const authApp = new Hono().all("*", (c) => getAuth().handler(c.req.raw));

export const app = new Hono<LoggerEnv>()
  .basePath("/api")
  .use("*", requestLogger)
  .route("/auth", authApp)
  .route("/account", accountRouter)
```

So `GET /api/auth/get-session`, `POST /api/auth/sign-in/social`, `GET /api/auth/callback/google`, `POST /api/auth/sign-out`, etc. are all handled by Better Auth - the app never enumerates them. `c.req.raw` is the underlying `Request`, which is exactly what `handler` wants.

How the request reaches Hono in the first place: the top-level server is Express, and a single regex route forwards `/api/*` into the Hono app via `@hono/node-server`'s `getRequestListener` (`apps/server/src/index.ts:45`). CORS is configured at the Express layer with `origin: env.webUrl, credentials: true` (`apps/server/src/index.ts:18`) so the browser is allowed to send the session cookie cross-origin.

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

Fully-authed routers (`conversations`, `friends`, `messages`, `notifications`, `gifs`) apply it once with `.use("*", requireAuth)`; `profiles` opts in per-route on `/me*`. Handlers then read `c.get("userId")`. The session is never passed in as a parameter - it's always re-derived from the request, server-side, so a client cannot spoof a `userId`.

- **Session management.** `apps/server/src/api/routes/account.ts` calls the Better Auth server API directly (`auth.api.*`) rather than `requireAuth`, because the session object is its payload (not just a gate), always passing `c.req.raw.headers`:
  - `GET /api/account/sessions` (`:5`) - guards on `getSession`, then `listSessions`, sorted newest-first by `updatedAt`. Returns `{ current, sessions }`.
  - `POST /api/account/sign-out` (`:23`) - `signOut`.
  - `POST /api/account/revoke-others` (`:28`) - guard, then `revokeOtherSessions` (keeps the current one).
  - `POST /api/account/revoke-session` (`:37`) - revoke a session by `token`. There's a subtlety here worth internalizing: if the supplied token *is* the current session's token, it calls `signOut` and returns `{ ok: true, signedOut: true }` instead of `revokeSession`, so the UI knows to redirect to `/auth`:

```ts
    if (current.session.token === token) {
      await auth.api.signOut({ headers });
      return c.json({ ok: true, signedOut: true });
    }
    await auth.api.revokeSession({ headers, body: { token } });
```

## How the socket reads the session (realtime)

The realtime layer authenticates **once, at connection time**, before any handler is attached. Socket.IO middleware (`io.use`) reads the raw `cookie` header from the handshake, hands it to the same `getSession`, and either attaches `socket.data.userId` or rejects the connection (`apps/server/src/realtime/index.ts:39`):

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

The cookie reaches the handshake because the web client opens the socket with `withCredentials: true` (`apps/web/lib/socket/socket-context.tsx:47`) and the server enables `cors: { origin: env.webUrl, credentials: true }` on the IO server (`apps/server/src/realtime/index.ts:32`).

After this point, **every** chat and game handler trusts `socket.data.userId` as the authenticated identity for the lifetime of the connection - `join_room`, `make_move`, chat sends, friend requests, presence, etc. (`apps/server/src/realtime/index.ts:58`). Note the layering: this middleware only proves *who you are*; per-move/per-room authorization (are you a player in this game? a member of this conversation?) happens later in the game driver and chat handlers. See `./realtime.md`.

## End-to-end sign-in flow

A full trace from clicking the button to being authenticated on all three lanes:

1. **User clicks "Continue with Google."** `apps/web/app/auth/page.tsx:41` renders `<GoogleSignInButton>`, which calls `authClient.signIn.social({ provider: "google", callbackURL: ".../profile" })` (`apps/web/app/google-sign-in-button.tsx:20`). The `authClient` is a Better Auth React client (with the `anonymousClient()` plugin) pointed at `NEXT_PUBLIC_API_URL` (`apps/web/lib/auth-client.ts:4`).
2. **Browser → server.** The client hits `POST /api/auth/sign-in/social` on the **server**, which Better Auth handles via the catch-all (`apps/server/src/api/index.ts:15`) and responds with a redirect to Google's consent screen.
3. **Google OAuth.** User authenticates with Google; Google redirects back to `GET /api/auth/callback/google` on the server.
4. **Better Auth callback.** Better Auth exchanges the code, and via the Drizzle adapter upserts the `user` (`packages/database/src/schema.ts:43`) and `account` (`:73`) rows and creates a `session` row (`:60`).
5. **Profile provisioning (first sign-in only).** Creating the `user` row fires `databaseHooks.user.create.after` (`apps/server/src/auth.ts:51`) → `ensureUsernameForUser(id, name, { skipGenderDetection })` (`apps/server/src/username.ts:43`) → slugify + batched candidate scan → `createProfile` inserts the `user_profile` row with a seeded avatar (`packages/database/src/repositories/profiles.ts:74`).
6. **Cookie set + redirect.** Better Auth sets the session cookie (in prod: `secure`, `SameSite=Lax`, cross-subdomain per `apps/server/src/auth.ts:74`) and redirects the browser to the `callbackURL` (`/profile`).
7. **RSC reads the session.** The `/profile` (and root layout) server component calls `getServerSession()` → `serverFetchJson("/api/auth/get-session")` (`apps/web/lib/get-server-session.ts:18`). `serverFetch` forwards the browser's cookies from `next/headers` `cookies()` with `cache: "no-store"` (`apps/web/lib/api-server.ts:13`), so the server resolves the session and returns `{ user, session }`. `getServerSession` is wrapped in `react.cache` so multiple components in one render share a single fetch.
8. **Socket connects.** Once `signedIn` is known, `<SocketProvider enabled>` opens the WebSocket with `withCredentials: true` (`apps/web/lib/socket/socket-context.tsx:47`); the handshake carries the same cookie; `io.use` resolves the session and sets `socket.data.userId` (`apps/server/src/realtime/index.ts:50`).
9. **Browser fetches.** Any subsequent client-side mutation (`SignOutForm`, friend actions, settings) uses `clientFetch(..., { credentials: "include" })` (`apps/web/lib/api-client.ts:11`), and the `requireAuth` middleware re-derives identity into `c.get("userId")` (`apps/server/src/api/middleware/auth.ts:16`).

Arrow summary:

```
click → authClient.signIn.social (auth-client.ts) → POST /api/auth/sign-in/social
  → Better Auth handler (api/index.ts:15) → Google consent
  → GET /api/auth/callback/google → drizzleAdapter upserts user/account/session
  → user.create.after hook (auth.ts:51) → ensureUsernameForUser (username.ts:43) → createProfile
  → Set-Cookie + redirect /profile
  → RSC getServerSession → serverFetch forwards cookie → /api/auth/get-session
  → socket handshake (withCredentials) → io.use getSession → socket.data.userId
```

**The guest flow is the same trace with one shortcut.** "Continue as a guest" (`apps/web/app/auth/guest-button.tsx`) calls `ensureIdentity()` (`apps/web/lib/auth/ensure-identity.ts:3`), which does `authClient.signIn.anonymous()` instead of `signIn.social` - there is no OAuth round-trip, so steps 1-4 collapse into a single `POST /api/auth/sign-in/anonymous` that inserts the `user` (`isAnonymous = true`) + `session` rows. The same `user.create.after` provisioning hook (step 5, now with `skipGenderDetection: true`), cookie set (step 6), RSC read (step 7), and socket connect (step 8) all run identically. From the socket and REST layers' perspective a guest is indistinguishable from a Google user.

**A guest can also be minted server-side, with no client call at all.** The public invite-accept route `POST /api/invite/:token/accept` (guest identity, Phase 3) does this: when the opener carries no session it calls `auth.api.signInAnonymous({ headers, returnHeaders: true })` from the server and forwards each minted `Set-Cookie` onto the response (`apps/server/src/api/routes/invite.ts:39`). So a brand-new visitor who clicks a shared link gets a real guest identity in the same round trip that joins them to the game - the same `anonymous` plugin and the same `user.create.after` provisioning run, just driven by the server API instead of the browser client. See [`server-api.md`](./server-api.md) for the full invite-accept contract.

## Sign-out & session management flow

The Account settings tab (`apps/web/app/settings/account/page.tsx:27`) is an RSC that calls `getAccountSessions()` → `GET /api/account/sessions` (`apps/web/lib/get-account-sessions.ts:22`), splitting the list into the current session vs. others (`/settings` itself just `redirect`s here). It renders three client forms, each a thin `clientFetch` wrapper that then nudges the Next router:

- **`SignOutForm`** → `POST /api/account/sign-out`, then `router.push("/")` + `router.refresh()` (`apps/web/app/sign-out-form.tsx:16`).
- **`SessionEndForm`** (per other-session row) → `POST /api/account/revoke-session` with `{ token }`; if the response says `signedOut` it pushes to `/auth`, else refreshes (`apps/web/app/session-end-form.tsx:16`). This is what lets you end *the current* session from the list.
- **`RevokeOthersForm`** → `POST /api/account/revoke-others`, then refresh; it renders nothing when `otherSessionCount === 0` (`apps/web/app/revoke-others-form.tsx:17`).

`router.refresh()` is the trick that makes the UI consistent: it re-runs the RSC, which re-fetches `/api/account/sessions` server-side, so the revoked session disappears from the list without a manual client cache.

## The account-merge flow

When a guest signs in with Google, Better Auth **links** the anonymous account to the new real one and fires `onLinkAccount`. The merge of the guest's data is **not** automatic - it is consent-gated, so a user always sees exactly what they're about to fold in before anything moves.

1. **Record (server, automatic).** `onLinkAccount` (`apps/server/src/auth.ts:21`) calls `accountMerge.recordPending(anonId, targetId)` (`packages/database/src/repositories/account-merge.ts:30`), which `parse()`s the ids with `recordAccountMergeInputSchema` (anon ≠ target) and inserts a `pending` row in `account_merge`. No data is touched. The recorder is wrapped in `try/catch` so a failure logs but never aborts the account link.
2. **Nudge (web).** `MergeConsent` (`apps/web/app/merge-consent.tsx:65`) is mounted in the app shell with `enabled={signedIn && !isAnonymous}` (`apps/web/app/app-shell.tsx:67`). When enabled it calls `getPendingMerge()` → `GET /api/account/merge/pending` (`apps/web/lib/account-merge.ts:20`); a non-null `pending` renders a fixed dialog showing the **counts-only** summary (games / conversations / friends / stat lines) and the target email - never raw guest content.
3. **Confirm (server).** `POST /api/account/merge/:id/confirm` (`apps/server/src/api/routes/account.ts:73`) loads the row, asserts `c.get("userId") === row.targetUserId` (else **403**), requires it still `pending` (else **404** missing / **409** resolved), runs `accountMerge.mergeAccounts(anonId, targetId)` (`packages/database/src/repositories/account-merge.ts:180`), then `markResolved(id, "confirmed")`. `mergeAccounts` is one transaction that sums `user_profile.stats` per `gameType`, re-points `game` / `game_player` / `move` / `friendship` / `conversation_member` / `message` / `notification` from the anon id onto the target, collapses self-references (self-friendship, self-DM, duplicate seat), and finally deletes the anon `user_profile` + `user`.
4. **Discard (server).** `POST /api/account/merge/:id/discard` (`apps/server/src/api/routes/account.ts:85`) runs the same ownership / status gate, then `accountMerge.deleteAnonUserData(anonId)` (`packages/database/src/repositories/account-merge.ts:117`) - it deletes the anon's FK-less `game_player` seats and `move` rows directly, deletes only the games where the anon was the *sole* seat (so a real opponent's history survives), and deletes the anon `user`. Then `markResolved(id, "discarded")`.

The web dialog calls `confirmMerge(id)` / `discardMerge(id)` (`apps/web/lib/account-merge.ts:27`) and `router.refresh()` so the merged history shows up immediately. See [`server-api.md`](./server-api.md) for the endpoint contract, [`database.md`](./database.md) for the repository, and [`web.md`](./web.md) for the dialog.

## Gotchas, invariants & conventions

- **Auth lives on the server, not the web app.** `betterAuth` is configured in `apps/server`, `baseURL` is the server URL, and the OAuth callback is `[server]/api/auth/callback/google`. The web app only holds a thin Better Auth *client* (`apps/web/lib/auth-client.ts`) plus cookie-forwarding fetch helpers.
- **Identity is always re-derived from the cookie, never trusted from the client.** REST → `requireAuth` reads `c.req.raw.headers`; sockets → `io.use` reads the handshake cookie. No route accepts a `userId` parameter as proof of identity.
- **Always go through `getAuth()`.** Nothing imports the bare `auth` object; the accessor (`apps/server/src/auth.ts:84`) keeps a single instance and is the mock point in tests (`mock.module` per the repo's test conventions).
- **A guest is a real `user`, and the rest of the stack barely branches on it.** `isAnonymous` is read in only a few places - the provisioning hook (to skip gender detection), the web layout/nudge (to surface the upgrade prompt), and the **guest friend cap**: `sendFriendRequest` (`apps/server/src/chat/friends-service.ts`) checks `profiles.isAnonymousUser`, then compares `friends.countFriendsAndOutgoing` against `ANON_MAX_FRIENDS` (`@gamelobby/shared/constants`), so a guest can hold at most 5 friends-plus-outstanding-requests and the 6th add is rejected with a 403 (`ANON_FRIEND_LIMIT_MESSAGE`) prompting them to log in. The cap is enforced once in the service, so both the socket lane and `POST /api/friends/requests` honor it. Aside from that, chat, presence, games, and authorization treat a guest `userId` like any other. `disableDeleteAnonymousUser: true` keeps the guest row (and its history) alive after the account link, and the merge that follows is **consent-gated**: `onLinkAccount` only *records* a pending merge (it never moves data), and the migration runs only when the user confirms via `/api/account/merge/:id/confirm`. So a Google sign-in that links a guest never silently rewrites or deletes the guest's rows - nothing changes until consent.
- **No Google creds → no Google sign-in, but guests still work.** `googleConfigured()` gates the provider (`apps/server/src/env.ts:58`); the sign-in page independently checks `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and shows setup instructions instead of a broken button (`apps/web/app/auth/page.tsx:17`). The `anonymous` plugin needs no external credentials, so the "Continue as a guest" button is always available. `BETTER_AUTH_SECRET` and `DATABASE_URL` are `required()` and crash startup if missing; Google creds are `optional()`.
- **`user.id` is `text`, not `uuid`.** Better Auth generates the id (`packages/database/src/schema.ts:44`). The app's own tables (`game`, `move`, `user_profile`, …) use uuid PKs but still store the auth user id as `text` in FK columns like `userId` / `creator_user_id`.
- **Profile provisioning is best-effort and idempotent.** The `create.after` hook swallows errors (`apps/server/src/auth.ts:64`); `ensureUsernameForUser` early-returns if a profile already exists (`apps/server/src/username.ts:48`). The DB unique constraint on `user_profile.username` - not the in-memory `getTakenUsernames` batch read - is the real collision authority.
- **`user_profile` ≠ `user`.** Better Auth owns `user`/`session`/`account`/`verification`; the application owns `user_profile` (username, avatar, stats, theme, layout). They join on `userId`, and the profile cascades on user delete.
- **Two web fetch paths, two env vars.** RSC uses `serverFetch` (`API_URL`, forwards `next/headers` cookies, `cache: "no-store"`); the browser uses `clientFetch` (`NEXT_PUBLIC_API_URL`, `credentials: "include"`). Use the server path inside RSCs and the client path inside `"use client"` components - they read the cookie from different places.
- **Auth-dependent pages set `export const dynamic = "force-dynamic"`** (e.g. `apps/web/app/auth/page.tsx:14`, `apps/web/app/settings/account/page.tsx:24`) because they depend on per-request cookies and must not be statically cached.
- **`getServerSession`/`getAccountSessions` are `react.cache`-wrapped** so the layout and a page in the same render share one network round-trip; don't reach for module-level memoization.
- **Cookies cross origins only because CORS allows it.** Both the Express HTTP layer (`apps/server/src/index.ts:18`) and the Socket.IO server (`apps/server/src/realtime/index.ts:32`) set `origin: env.webUrl, credentials: true`; the client mirrors this with `credentials: "include"` / `withCredentials: true`. Change the web origin and you must update `WEB_URL`.

## Where to go next

- [Architecture overview](./README.md) - the monorepo map and the "shared logic imported by both sides" insight.
- [Database schema](./database-schema.md) - the Drizzle schema in full, including the `user_profile` and game tables the auth tables sit beside.
- [Realtime](./realtime.md) - what happens after the socket is authenticated: chat lane vs. game lane, drivers, and authorization per event.
- [Server API](./server-api.md) - the Hono router-per-feature layout that mounts `/api/auth/*` and reads identity via the `requireAuth` middleware.
- [Web](./web.md) - the Next.js App Router side, the `serverFetch`/`clientFetch` split, and the socket provider.
