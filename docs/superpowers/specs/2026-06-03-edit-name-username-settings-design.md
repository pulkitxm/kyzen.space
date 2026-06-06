# Edit name & username in Settings

Date: 2026-06-03
Status: Approved (design)

## Goal

Let a signed-in user change their **display name** and **username** from the Settings page. Username editing has live availability feedback, a server-generated suggestion list when the chosen name is unavailable, a configurable change cooldown, and a configurable blocklist.

## Background (current state)

- **Username** lives in `user_profile.username` (`text`, unique). Case-insensitive uniqueness is enforced in queries (`lower(username) = lower(...)`). It is the user's public profile URL via the catch-all route `apps/web/app/[username]/`.
- **Display name** is `user.name` (Better Auth's user table column). It is read across the app via `profiles.getDisplayName(userId)` and exposed on `GET /api/profiles/me` as `user.name`. There is no write path today.
- Provisioning (`apps/server/src/username.ts` → `ensureUsernameForUser`) already generates candidate usernames with random suffixes and batch-checks availability via `getTakenUsernames`. There is an inline `RESERVED` set in `apps/server/src/api/routes/profiles.ts` (`api`, `auth`, `games`, `profile`, `account`).
- There is **no** endpoint to update name or username, and **no** exposed username format validator (only the internal `slugifyBase` used during provisioning).
- The Settings page (`apps/web/app/settings/page.tsx`) already has an **Account** section (shows email, sessions, sign-out). It fetches data via `getAccountSessions`.

## Decisions (from brainstorming)

- **Availability:** live, debounced check as the user types (new endpoint).
- **Cooldown:** enabled, duration configurable via env var, default 30 days.
- **Format:** `^[a-z0-9_]{3,30}$`. The UI does **not** block typing uppercase; the server normalizes to lowercase before validating/storing. Non-conforming input (spaces/symbols) is rejected with a clear message plus suggestions.
- **Suggestions:** when a chosen username is unavailable for any reason, the API returns up to **5** suggestions; the UI shows them as clickable chips.
- **Blocklist:** a configurable env var `NOT_ALLOWED_USERNAMES` (CSV) of disallowed names (e.g. personal names), unioned with the reserved-route set.

## Environment variables (new)

Both must be added to `apps/server/src/env.ts`, `turbo.json` `globalEnv`, and `.env.example`.

- `NOT_ALLOWED_USERNAMES` — comma-separated blocklist, e.g. `pulkit,kanak,admin`. Parsed by a new `list(name)` helper in `env.ts` (split on `,`, trim, lowercase, drop empties). Default `[]`.
- `USERNAME_CHANGE_COOLDOWN_DAYS` — integer days between username changes, parsed via the existing `number()` helper. Default `30`. `0` disables the cooldown.

## Schema change

Add one nullable column to `user_profile` (`apps/server/src/db/schema.ts`):

- `usernameChangedAt: timestamp("username_changed_at")` — nullable; `null` means "never changed" so the first change is always allowed.

Applied via `db:push` (dev DB is push-managed; `db:migrate` is not used here).

## `apps/server/src/username.ts` — shared helpers

Extract pure, unit-testable helpers and reuse them in provisioning so behavior is consistent:

- `normalizeUsername(raw: string): string` → `raw.trim().toLowerCase()`.
- `isValidUsernameFormat(name: string): boolean` → `/^[a-z0-9_]{3,30}$/.test(name)` (expects already-normalized input).
- `RESERVED_USERNAMES: ReadonlySet<string>` — centralized. Seeded with the current top-level route segments and server namespaces so a username can never shadow a route:
  `api`, `auth`, `account`, `chat`, `friends`, `games`, `play`, `profile`, `settings`, `ui`.
  (Implementation audits `apps/web/app/` for the real navigable segments; non-route folders like `fonts` are excluded. `account`/`api` are server/API namespaces kept for safety.)
- `isUsernameBlocked(normalized: string): boolean` → `RESERVED_USERNAMES.has(normalized) || env.notAllowedUsernames.includes(normalized)`.
- `suggestUsernames(base: string, count = 5): Promise<string[]>` → slugifies `base` (reusing the existing slug logic), then reuses `getTakenUsernames` batch-checking to return up to `count` free, non-blocked variants (`base`, `base_<suffix>`, …); falls back to `player_<suffix>` when needed.

`ensureUsernameForUser` is refactored to use `isUsernameBlocked` (so auto-provisioned names also avoid the blocklist) and the shared slug/suggest helpers.

## Repository writes (`apps/server/src/db/repositories/profiles.ts`)

- `setDisplayName(userId: string, name: string): Promise<void>` — `update(user).set({ name, updatedAt: now }).where(eq(user.id, userId))`.
- `updateUsername(userId: string, username: string): Promise<void>` — sets `username` + `usernameChangedAt = now` on `user_profile`.

## Endpoints (`apps/server/src/api/routes/profiles.ts`, all `requireAuth`)

1. `GET /me/username-available?u=<raw>` → `{ available: boolean, reason?: "format" | "reserved" | "taken", suggestions?: string[] }`.
   - Normalize `u`. If it equals the caller's current username → `{ available: true }`.
   - Else check format → reserved/blocked → taken (`isUsernameTaken`). On the first failure, return `available: false` with `reason` and up to 5 `suggestions` (derived from the normalized/slugified input).
2. `PUT /me/username` `{ username }` → validates in order: format (`400`), reserved/blocked (`400`), cooldown (`429` with `nextChangeAt` ISO date), availability (`409`). On success: `updateUsername`, return `{ username }`.
   - Cooldown: if `usernameChangedAt` is set and `now - usernameChangedAt < USERNAME_CHANGE_COOLDOWN_DAYS`, reject `429`.
3. `PUT /me/name` `{ name }` → trim; validate length 1–50 (`400` otherwise); `setDisplayName`; return `{ name }`.
4. Extend `GET /me` to include `usernameEditableAt` (ISO string or `null`) in the `profile` object — computed server-side as `usernameChangedAt + USERNAME_CHANGE_COOLDOWN_DAYS`, or `null` when the username is editable now (never changed, or cooldown elapsed, or cooldown disabled). The client locks the field whenever `usernameEditableAt` is in the future. This keeps the cooldown policy server-only (no `NEXT_PUBLIC_*` mirror needed).

Error responses follow the existing `c.json({ error }, status)` convention.

## Frontend

New client component `apps/web/app/settings/account-identity-form.tsx`, rendered inside the Settings **Account** section (`apps/web/app/settings/page.tsx`). The server component is extended to fetch the profile (`serverFetchJson` to `/profiles/me`) and pass `name`, `username`, and `usernameEditableAt` as props.

- **Display name:** controlled text input + Save button → `PUT /me/name` via `clientFetchJson`. Inline success/error.
- **Username:** controlled text input with a debounced (~350ms) call to `GET /me/username-available`. Inline status: idle / checking / ✓ available / ✗ `<reason>`. When unavailable, render the returned suggestions as clickable chips that populate the field (and re-trigger the check). Save is disabled unless the current value is valid and available. On `429`, the field is locked and shows "You can change your username again on `<date>`." computed from `usernameChangedAt + cooldown`.
   - The lock and its date come directly from `usernameEditableAt` (from `GET /me`); the `429` response's `nextChangeAt` is a backstop if a save races the cooldown.
- Icons via `react-icons/fa6` (e.g. `FaCheck`, `FaXmark`), per house rules. No raw SVG.

## Tests

- **Unit** (`apps/server/tests/`): `normalizeUsername`, `isValidUsernameFormat`, `isUsernameBlocked` (reserved + env blocklist), `suggestUsernames` (returns N free, skips blocked/taken). Pure helpers exported for direct testing.
- **Route handlers**: mock the profiles repo + env via `mock.module` (house convention) and assert the status/branch matrix for `username-available`, `PUT /me/username` (400/409/429/200), and `PUT /me/name`.

## Docs & conventions to sync (part of this change)

- **`CLAUDE.md` + `AGENTS.md`** — add the reserved-routes rule:
  > **Reserved usernames vs. top-level routes.** The profile page is a catch-all `/[username]` route, so every top-level segment under `apps/web/app/` is a potential username collision. When you add a new top-level route, add its segment to `RESERVED_USERNAMES` in `apps/server/src/username.ts` if a user claiming that name would shadow the route. User-specific blocklisting is separate — that's the `NOT_ALLOWED_USERNAMES` env var.
- **`docs/architecture/database.md`** — document the new `username_changed_at` column.
- **Profiles routes / web settings docs** — document the new endpoints and the settings Account identity form.
- **`.env.example`** — the two new env vars with example values.

## Out of scope (YAGNI)

- Username change history / old-URL redirects.
- Email changes.
- Admin tooling for the blocklist (env var only).
