# Invite Links (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any player share a link that drops the opener (signing them in as a guest if needed) straight into a playable game with the inviter, with an "Add as friend" prompt layered on top. Reuse the existing `getOrCreateDm` + `createGameInConversation` machinery; the only new server logic is the invite token (high-entropy, DB-backed, expiring), a public peek/accept pair of routes, and a new `game_invite` notification type.

**Architecture:** A new `game_invite` table stores a cryptographically random `token` (NOT the 6-char game code), the `inviterUserId`, `gameType`, optional `config`, optional `seatingMode`, and an `expiresAt` defaulting to now + 24h. A new `invites` repository (the only place that touches the table) exposes `create` and `getByToken`, generating the token with a `crypto.randomBytes`-based base64url helper. Three Hono routes under `/api/invite`: `POST /api/invite` (auth) mints a token + row and returns `{ token, url }`; `GET /api/invite/:token` (PUBLIC) peeks, returning only `{ gameType, inviter: { username, avatar }, expired }` (never the inviter's email or any third party's data); `POST /api/invite/:token/accept` (PUBLIC) resolves the token (rejecting expired/unknown with one uniform shape), mints an anonymous session when logged out (Better Auth `auth.api.signInAnonymous` with `returnHeaders: true`, copying `Set-Cookie` onto the Hono response), no-ops self-acceptance, then `getOrCreateDm` + `createGameInConversation` + `notify(inviter, "game_invite", { gameId })`. The web adds a top-level `/invite/[token]` client page that paints `getGameSkeleton(gameType)` + an inviter banner on the first frame from the peek, fires the accept underneath, then crossfades (motion) to `/play/<gameId>`, plus a non-blocking "Add as friend" popup wired to the existing friend-request socket flow, and an "Invite a friend (link)" button in the game lobby.

**Tech Stack:** Drizzle/Postgres, Zod (in `@gamelobby/shared` only), Hono, Better Auth 1.6.11 (`auth.api.signInAnonymous`), Next.js 16 App Router, `motion/react` (`m` + `AnimatePresence`, already wrapped by `LazyMotion`/`domAnimation` in `apps/web/app/providers.tsx`), `react-icons/fa6`, Bun test (`mock.module`).

**Scope note:** This phase depends on Phase 0 (the anonymous plugin must be registered in `apps/server/src/auth.ts` and `isAnonymous` must exist on `user`). The accept route mints anon sessions through the server-side Better Auth API; Phase 0 already set `disableDeleteAnonymousUser: true`, so opening an invite never produces an orphaned auto-deleted row. Links are **reusable until expiry** (each acceptance spins up a fresh game); single-use (`redeemedAt`) is a deferred tweak. A lightweight per-inviter in-memory rate limiter caps mass game creation on `accept`; a cross-node Redis limiter is a follow-up (noted in Task 6).

**Prerequisite:** Postgres running. Run `bun run db:start` once before Task 1's `db:push`. The integration test in Task 8 also needs the DB up.

---

## File Structure

- `packages/shared/src/types/db/index.ts` - add `GameInviteRow` type (create the hand-written row type; keeps `drift-guard` green) (modify).
- `packages/database/src/schema.ts` - add the `game_invite` table (modify).
- `packages/database/src/drift-guard.ts` - add the `Expect<Equal<typeof gameInvite.$inferSelect, GameInviteRow>>` entry (modify).
- `packages/shared/src/types/db/io.ts` - `createGameInviteInputSchema`; re-use `notificationTypeSchema` from chat (modify).
- `packages/shared/src/types/chat/dto.ts` - add `game_invite` to `NotificationType` (modify).
- `packages/shared/src/types/chat/schemas.ts` - move/define `notificationTypeSchema` (with `game_invite`) here (modify).
- `packages/shared/src/types/chat/index.ts` - export `notificationTypeSchema` (modify).
- `packages/shared/src/constants/username.ts` - add `invite` to `RESERVED_USERNAMES` (modify).
- `packages/database/src/invite-token.ts` - `generateInviteToken()` secure-random helper (create).
- `packages/database/src/repositories/invites.ts` - `create` / `getByToken` repository (create).
- `packages/database/src/index.ts` - export the `invites` namespace + `GameInviteRow` + `CreateGameInviteInput` (modify).
- `apps/server/src/chat/invite-service.ts` - `createInvite`, `peekInvite`, `acceptInvite` pure service functions (create).
- `apps/server/src/api/routes/invite.ts` - the three Hono routes; cookie minting on accept (create).
- `apps/server/src/api/index.ts` - register `/invite` (modify).
- `apps/web/lib/invite-client.ts` - `createInviteLink()` client helper (create).
- `apps/web/app/invite/[token]/page.tsx` - the snappy accept page (skeleton + banner + crossfade + add-friend popup) (create).
- `apps/web/app/games/_shared/game-lobby.tsx` - "Invite a friend (link)" button (modify).
- Tests: `packages/shared/tests/notification-type.test.ts`, `packages/shared/tests/reserved-usernames.test.ts`, `packages/database/tests/invite-token.test.ts`, `apps/server/tests/invite-service.test.ts`, `apps/server/tests/invite-route.test.ts`, `apps/server/integration/invite-flow.test.ts` (create).

---

## Task 1: Add the `game_invite` table, `GameInviteRow`, and the drift-guard entry

The `drift-guard` (`packages/database/src/drift-guard.ts`) asserts `Equal<typeof <table>.$inferSelect, <Row>>` at compile time, so the table, the hand-written row type, and the guard entry must move together. We use that guard as the test.

**Files:**
- Modify: `packages/shared/src/types/db/index.ts` (after the `NotificationRow` type, near line 197)
- Modify: `packages/database/src/schema.ts` (append after the `notification` table, near line 298)
- Modify: `packages/database/src/drift-guard.ts:1-53`

- [ ] **Step 1: Add the hand-written `GameInviteRow` (this should break type-check once the guard is added)**

In `packages/shared/src/types/db/index.ts`, add the row type immediately after the `NotificationRow` block (after line 197):

```ts
export type GameInviteRow = {
  id: string;
  token: string;
  inviterUserId: string;
  gameType: string;
  config: unknown;
  seatingMode: SeatingMode | null;
  expiresAt: Date;
  createdAt: Date;
};
```

- [ ] **Step 2: Add the `game_invite` table to the schema**

In `packages/database/src/schema.ts`, append the table after the `notification` table (after line 298). The `text`, `jsonb`, `timestamp`, `uuid`, `index`, `unique` imports already exist (lines 24-36) and `SeatingMode` is already imported type-only (line 21), and `user` is defined above:

```ts
export const gameInvite = pgTable(
  "game_invite",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique("game_invite_token_uq"),
    inviterUserId: text("inviter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    gameType: text("game_type").notNull(),
    config: jsonb("config").$type<unknown>(),
    seatingMode: text("seating_mode").$type<SeatingMode>(),
    expiresAt: timestamp("expires_at")
      .$defaultFn(() => new Date(Date.now() + 24 * 60 * 60 * 1000))
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("game_invite_inviter_idx").on(t.inviterUserId)],
);
```

- [ ] **Step 3: Add the drift-guard entry**

In `packages/database/src/drift-guard.ts`, add `gameInvite` to the schema import block (line 16-30) and `GameInviteRow` to the type import block (line 1-15), then append the assertion to `SchemaDriftChecks`:

```ts
import type {
  AccountRow,
  ConversationMemberRow,
  ConversationRow,
  FriendshipRow,
  GameInviteRow,
  GamePlayerRow,
  GameRow,
  MessageRow,
  MoveRow,
  NotificationRow,
  SessionRow,
  UserProfileRow,
  UserRow,
  VerificationRow,
} from "@gamelobby/shared/types";
import type {
  account,
  conversation,
  conversationMember,
  friendship,
  game,
  gameInvite,
  gamePlayer,
  message,
  move,
  notification,
  session,
  user,
  userProfile,
  verification,
} from "./schema";
```

```ts
export type SchemaDriftChecks = [
  Expect<Equal<typeof user.$inferSelect, UserRow>>,
  Expect<Equal<typeof session.$inferSelect, SessionRow>>,
  Expect<Equal<typeof account.$inferSelect, AccountRow>>,
  Expect<Equal<typeof verification.$inferSelect, VerificationRow>>,
  Expect<Equal<typeof game.$inferSelect, GameRow>>,
  Expect<Equal<typeof move.$inferSelect, MoveRow>>,
  Expect<Equal<typeof gamePlayer.$inferSelect, GamePlayerRow>>,
  Expect<Equal<typeof userProfile.$inferSelect, UserProfileRow>>,
  Expect<Equal<typeof friendship.$inferSelect, FriendshipRow>>,
  Expect<Equal<typeof conversation.$inferSelect, ConversationRow>>,
  Expect<Equal<typeof conversationMember.$inferSelect, ConversationMemberRow>>,
  Expect<Equal<typeof message.$inferSelect, MessageRow>>,
  Expect<Equal<typeof notification.$inferSelect, NotificationRow>>,
  Expect<Equal<typeof gameInvite.$inferSelect, GameInviteRow>>,
];
```

- [ ] **Step 4: Run type-check to verify the drift-guard is satisfied**

Run: `bun run type-check`
Expected: PASS (the hand-written `GameInviteRow` matches `gameInvite.$inferSelect`; if it FAILs, the column/row shapes disagree - reconcile them).

- [ ] **Step 5: Generate the migration and push to the dev DB**

Run: `bun run db:start` (if not already running)
Run: `bun run db:generate` (creates a migration adding the `game_invite` table under `packages/database/src/drizzle/`)
Run: `bun run db:push`
Expected: both succeed; `db:push` reports the `game_invite` table created.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/db/index.ts packages/database/src/schema.ts packages/database/src/drift-guard.ts packages/database/src/drizzle
git commit -m "feat(db): add game_invite table for invite links"
```

---

## Task 2: `game_invite` notification type (shared schemas)

Today `NotificationType` is `friend_request | friend_accepted | game_started | game_challenge` (`packages/shared/src/types/chat/dto.ts:87-91`) and the only Zod enum is `notificationTypeSchema` in `packages/shared/src/types/db/io.ts:13-18`. We add `game_invite` to the union and consolidate the Zod enum into `chat/schemas.ts` (single source of truth), having `db/io.ts` import it so there is no duplicate `export const`.

**Files:**
- Modify: `packages/shared/src/types/chat/dto.ts:87-91`
- Modify: `packages/shared/src/types/chat/schemas.ts` (after `notificationPayloadSchema`, near line 34)
- Modify: `packages/shared/src/types/chat/index.ts` (the schemas export block, near line 25-44)
- Modify: `packages/shared/src/types/db/io.ts:1-18`
- Test: `packages/shared/tests/notification-type.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/notification-type.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { notificationTypeSchema } from "../src/types/chat/schemas";

describe("notificationTypeSchema", () => {
  it("accepts game_invite", () => {
    expect(notificationTypeSchema.parse("game_invite")).toBe("game_invite");
  });

  it("still accepts the existing notification types", () => {
    for (const t of [
      "friend_request",
      "friend_accepted",
      "game_started",
      "game_challenge",
    ]) {
      expect(notificationTypeSchema.parse(t)).toBe(t);
    }
  });

  it("rejects an unknown type", () => {
    expect(notificationTypeSchema.safeParse("nope").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/shared && bun test tests/notification-type.test.ts`
Expected: FAIL - `notificationTypeSchema` is not exported from `../src/types/chat/schemas` yet (and would not accept `game_invite`).

- [ ] **Step 3: Add `game_invite` to the `NotificationType` union**

In `packages/shared/src/types/chat/dto.ts`, change the `NotificationType` type:

```ts
export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "game_started"
  | "game_challenge"
  | "game_invite";
```

- [ ] **Step 4: Define `notificationTypeSchema` in `chat/schemas.ts`**

In `packages/shared/src/types/chat/schemas.ts`, add the enum right after `notificationPayloadSchema` (after line 34):

```ts
export const notificationTypeSchema = z.enum([
  "friend_request",
  "friend_accepted",
  "game_started",
  "game_challenge",
  "game_invite",
]);
```

- [ ] **Step 5: Export it from the chat barrel**

In `packages/shared/src/types/chat/index.ts`, add `notificationTypeSchema` to the schemas `export {` block (alphabetically, immediately after `notificationPayloadSchema`, which is the last entry at line 42):

```ts
  gifMetaSchema,
  notificationPayloadSchema,
  notificationTypeSchema,
```

- [ ] **Step 6: Re-use the enum in `db/io.ts` (remove the duplicate)**

In `packages/shared/src/types/db/io.ts`, replace the local `notificationTypeSchema` definition (lines 13-18) with an import. Add to the import block at the top:

```ts
import { z } from "zod";
import { notificationTypeSchema } from "../chat/schemas";
import { gameTypeSchema } from "../games/core";
import {
  gamePlayerSchema,
  gameStatusSchema,
  seatingModeSchema,
} from "../games/wire";
import { patternIdSchema } from "../pattern";
import { colorModeSchema, themeIdSchema } from "../theme";
```

Then delete the `export const notificationTypeSchema = z.enum([...]);` block (lines 13-18). `createNotificationInputSchema` (line 49-54) keeps referencing `notificationTypeSchema`, now sourced from the import. Leave the rest of the file unchanged.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd packages/shared && bun test tests/notification-type.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Run type-check (the import move must not create a cycle)**

Run: `bun run type-check`
Expected: PASS. (`db/index.ts` already imports `NotificationType` from `../chat/dto`, so the `db → chat` direction is established; importing the value `notificationTypeSchema` follows the same direction with no cycle.)

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types/chat/dto.ts packages/shared/src/types/chat/schemas.ts packages/shared/src/types/chat/index.ts packages/shared/src/types/db/io.ts packages/shared/tests/notification-type.test.ts
git commit -m "feat(shared): add game_invite notification type"
```

---

## Task 3: Reserve the `invite` username

`/invite/[token]` becomes a new top-level segment under `apps/web/app/`, so per CLAUDE.md it must be in `RESERVED_USERNAMES` or a user named `invite` would shadow the route.

**Files:**
- Modify: `packages/shared/src/constants/username.ts:6-17`
- Test: `packages/shared/tests/reserved-usernames.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/reserved-usernames.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { RESERVED_USERNAMES } from "../src/constants/username";

describe("RESERVED_USERNAMES", () => {
  it("reserves the invite top-level route segment", () => {
    expect(RESERVED_USERNAMES.has("invite")).toBe(true);
  });

  it("keeps the existing reserved segments", () => {
    for (const name of [
      "api",
      "auth",
      "account",
      "chat",
      "friends",
      "games",
      "play",
      "profile",
      "settings",
      "ui",
    ]) {
      expect(RESERVED_USERNAMES.has(name)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/shared && bun test tests/reserved-usernames.test.ts`
Expected: FAIL - `invite` is not in the set.

- [ ] **Step 3: Add `invite` to the set**

In `packages/shared/src/constants/username.ts`, add `invite` to `RESERVED_USERNAMES` (alphabetically, after `friends`):

```ts
export const RESERVED_USERNAMES = new Set([
  "api",
  "auth",
  "account",
  "chat",
  "friends",
  "games",
  "invite",
  "play",
  "profile",
  "settings",
  "ui",
]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/shared && bun test tests/reserved-usernames.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/username.ts packages/shared/tests/reserved-usernames.test.ts
git commit -m "feat(shared): reserve the invite username for the /invite route"
```

---

## Task 4: Secure invite-token helper + `createGameInviteInputSchema`

The token must be high-entropy and unguessable, and **must NOT** be the 6-char `generateGameCode` (a 32-symbol, 6-char code is trivially brute-forceable as a link). We generate 32 random bytes via `node:crypto` `randomBytes` and base64url-encode them (43 url-safe chars, ~256 bits).

**Files:**
- Create: `packages/database/src/invite-token.ts`
- Modify: `packages/shared/src/types/db/io.ts` (append `createGameInviteInputSchema` after `createProfileInputSchema`, near line 60)
- Modify: `packages/shared/src/types/db/index.ts` (add the `CreateGameInviteInput` type after `CreateProfileInput`, near line 241)
- Test: `packages/database/tests/invite-token.test.ts` (create)

- [ ] **Step 1: Write the failing test for the token helper**

Create `packages/database/tests/invite-token.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { generateGameCode } from "@gamelobby/shared/types";
import { generateInviteToken, INVITE_TOKEN_LENGTH } from "../src/invite-token";

describe("generateInviteToken", () => {
  it("is long and high-entropy (>= 43 url-safe chars)", () => {
    const token = generateInviteToken();
    expect(token.length).toBe(INVITE_TOKEN_LENGTH);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is never the 6-char game code shape", () => {
    expect(generateInviteToken().length).not.toBe(generateGameCode().length);
  });

  it("does not collide across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateInviteToken());
    expect(seen.size).toBe(5000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/database && bun test tests/invite-token.test.ts`
Expected: FAIL - module `../src/invite-token` does not exist.

- [ ] **Step 3: Implement the token helper**

Create `packages/database/src/invite-token.ts`:

```ts
import { randomBytes } from "node:crypto";

const INVITE_TOKEN_BYTES = 32;

export const INVITE_TOKEN_LENGTH = 43;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/database && bun test tests/invite-token.test.ts`
Expected: PASS (3 tests). (`randomBytes(32).toString("base64url")` yields exactly 43 chars with no padding.)

- [ ] **Step 5: Add the create-input schema and type to shared**

In `packages/shared/src/types/db/io.ts`, append after `createProfileInputSchema` (after line 60):

```ts
export const createGameInviteInputSchema = z.object({
  inviterUserId: z.string().min(1),
  gameType: gameTypeSchema,
  token: z.string().min(1),
  config: z.unknown().optional(),
  seatingMode: seatingModeSchema.nullable().optional(),
  expiresAt: z.date(),
});
```

In `packages/shared/src/types/db/index.ts`, add the inferred type after `CreateProfileInput` (after line 241). First extend the `./io` re-export - `db/index.ts` already does `export * from "./io"` (line 17), so the schema is re-exported automatically; only the input *type* needs a hand-written entry to match repository style. Add:

```ts
export type CreateGameInviteInput = {
  inviterUserId: string;
  gameType: GameType;
  token: string;
  config?: unknown;
  seatingMode?: SeatingMode | null;
  expiresAt: Date;
};
```

(`GameType` and `SeatingMode` are already imported/defined in this file - `GameType` at line 12, `SeatingMode` at line 28.)

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/invite-token.ts packages/database/tests/invite-token.test.ts packages/shared/src/types/db/io.ts packages/shared/src/types/db/index.ts
git commit -m "feat(db): add secure invite-token helper and create-invite schema"
```

---

## Task 5: `invites` repository (`create` / `getByToken`)

The repository is the only code allowed to touch the `game_invite` table; it validates its input with the shared Zod schema, mirroring `notifications.create` and `games.createGame`.

**Files:**
- Create: `packages/database/src/repositories/invites.ts`
- Modify: `packages/database/src/index.ts:24-30`
- Test: covered structurally by the route/integration tests (Tasks 7-8); the repo is exercised against the live DB in Task 8.

- [ ] **Step 1: Implement the repository**

Create `packages/database/src/repositories/invites.ts`:

```ts
import {
  type CreateGameInviteInput,
  createGameInviteInputSchema,
  type GameInviteRow,
} from "@gamelobby/shared/types";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { gameInvite } from "../schema";

export async function create(
  input: CreateGameInviteInput,
): Promise<GameInviteRow> {
  createGameInviteInputSchema.parse(input);
  const [row] = await db
    .insert(gameInvite)
    .values({
      inviterUserId: input.inviterUserId,
      gameType: input.gameType,
      token: input.token,
      config: input.config ?? null,
      seatingMode: input.seatingMode ?? null,
      expiresAt: input.expiresAt,
    })
    .returning();
  if (!row) throw new Error("Failed to create invite");
  return row;
}

export async function getByToken(
  token: string,
): Promise<GameInviteRow | null> {
  const [row] = await db
    .select()
    .from(gameInvite)
    .where(eq(gameInvite.token, token))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 2: Export the namespace, types, and token helper from the barrel**

In `packages/database/src/index.ts`, add `invites` to the namespace exports (alphabetically, after `games`), add the new types to the `export type { ... }` block, and re-export the token helper (the package only exposes the `.` export - there is no deep-import path, so everything must flow through the barrel):

```ts
export type {
  ConversationMemberRow,
  ConversationRow,
  CreateGameInput,
  CreateGameInviteInput,
  CreateMessageInput,
  CreateNotificationInput,
  CreateProfileInput,
  FriendshipRow,
  GameInviteRow,
  GamePlayer,
  GamePlayerRow,
  GameRecord,
  GameRow,
  GameStat,
  GameStatus,
  GameUpdate,
  MessageRow,
  MoveRow,
  NotificationRow,
  ProfileStats,
  PublicUserRow,
  SeatingMode,
  UserProfileRow,
} from "@gamelobby/shared/types";
export { createDb, type DB, db, schema } from "./client";
export {
  generateInviteToken,
  INVITE_TOKEN_LENGTH,
} from "./invite-token";
export * as conversations from "./repositories/conversations";
export * as friends from "./repositories/friends";
export * as games from "./repositories/games";
export * as invites from "./repositories/invites";
export * as messages from "./repositories/messages";
export * as notifications from "./repositories/notifications";
export * as profiles from "./repositories/profiles";
```

(Move the token helper's authoritative test in Task 4 to import from `../src/invite-token` directly - that intra-package relative import is fine; only *cross-package* consumers must use the `@gamelobby/database` barrel.)

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/repositories/invites.ts packages/database/src/index.ts
git commit -m "feat(db): add invites repository (create + getByToken)"
```

---

## Task 6: Invite service (`createInvite` / `peekInvite` / `acceptInvite`)

Per `docs/architecture/testing.md`, keep the logic in a plain service so it is unit-testable independent of HTTP/cookie plumbing. The service never sets cookies (that is the route's job) - `acceptInvite` takes an *already-resolved* `accepterUserId` and returns a `ServiceResult`. Security/privacy is enforced here: `peekInvite` returns only `{ gameType, inviter: { username, avatar }, expired }` (no email, no third-party data); unknown and expired tokens return the **same** `expired: true` peek shape (no enumeration oracle); `acceptInvite` rejects expired/unknown tokens, no-ops self-acceptance, and is guarded by a per-inviter rate limiter against mass game creation.

`acceptInvite` passes `seatingMode: "challenge"` and `challengedUserId: accepterUserId` to `createGameInConversation` to mirror the friend-challenge path (per the spec). Because `getOrCreateDm` returns a `kind: "dm"` conversation, `createGameInConversation` will internally force `seatingMode = "open"` and `challengedUserId = null` and ignore those two inputs - the accepter is seated when they `join_room`. That is expected and correct. The unit test below asserts the **arguments the service passes** to the mocked `createGameInConversation` (which records its input verbatim), so `createGameArgs.seatingMode === "challenge"` / `createGameArgs.challengedUserId === "accepter-9"` are valid mock-capture assertions; the *persisted* game's open seating is verified separately in the integration test (Task 8).

**Files:**
- Create: `apps/server/src/chat/invite-service.ts`
- Test: `apps/server/tests/invite-service.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/invite-service.test.ts`:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

type Invite = {
  id: string;
  token: string;
  inviterUserId: string;
  gameType: string;
  config: unknown;
  seatingMode: "open" | "challenge" | null;
  expiresAt: Date;
  createdAt: Date;
} | null;

let invite: Invite = null;
// biome-ignore lint/suspicious/noExplicitAny: test capture
let createInviteInput: any = null;
let publicUser: { id: string; username: string; displayName: string | null; avatar: unknown } | null =
  { id: "inviter-1", username: "alice", displayName: "Alice", avatar: { seed: "x" } };
let dmCreated: { a: string; b: string } | null = null;
// biome-ignore lint/suspicious/noExplicitAny: test capture
let createGameArgs: any = null;
const notifyCalls: Array<{ userId: string; type: string; payload: unknown }> = [];

mock.module("@gamelobby/database", () => ({
  generateInviteToken: () => "x".repeat(43),
  INVITE_TOKEN_LENGTH: 43,
  invites: {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    create: async (input: any) => {
      createInviteInput = input;
      return {
        id: "inv-1",
        token: input.token,
        inviterUserId: input.inviterUserId,
        gameType: input.gameType,
        config: input.config ?? null,
        seatingMode: input.seatingMode ?? null,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      };
    },
    getByToken: async () => invite,
  },
  conversations: {
    getOrCreateDm: async (a: string, b: string) => {
      dmCreated = { a, b };
      return { conversation: { id: "conv-1" }, created: true };
    },
  },
  profiles: {
    getPublicUser: async () => publicUser,
  },
  games: {},
  friends: {},
  messages: {},
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

mock.module("../src/chat/games-in-chat-service", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  createGameInConversation: async (input: any) => {
    createGameArgs = input;
    return { ok: true, value: { game: { id: "GAMECD" } } };
  },
}));

mock.module("../src/realtime/notify", () => ({
  notify: async (
    userId: string,
    type: string,
    opts?: { payload?: unknown },
  ) => {
    notifyCalls.push({ userId, type, payload: opts?.payload });
  },
}));

const { createInvite, peekInvite, acceptInvite } = await import(
  "../src/chat/invite-service"
);

function future(): Date {
  return new Date(Date.now() + 60_000);
}
function past(): Date {
  return new Date(Date.now() - 60_000);
}

beforeEach(() => {
  invite = null;
  createInviteInput = null;
  publicUser = {
    id: "inviter-1",
    username: "alice",
    displayName: "Alice",
    avatar: { seed: "x" },
  };
  dmCreated = null;
  createGameArgs = null;
  notifyCalls.length = 0;
});

describe("createInvite", () => {
  test("mints a high-entropy token and persists the row", async () => {
    const res = await createInvite({
      inviterUserId: "inviter-1",
      gameType: TIC_TAC_TOE,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.token.length).toBeGreaterThanOrEqual(43);
      expect(res.value.url).toContain(`/invite/${res.value.token}`);
    }
    expect(createInviteInput.inviterUserId).toBe("inviter-1");
    expect(createInviteInput.expiresAt instanceof Date).toBe(true);
  });
});

describe("peekInvite", () => {
  test("returns gameType + inviter (no email) and expired=false", async () => {
    invite = {
      id: "inv-1",
      token: "t",
      inviterUserId: "inviter-1",
      gameType: TIC_TAC_TOE,
      config: null,
      seatingMode: "challenge",
      expiresAt: future(),
      createdAt: new Date(),
    };
    const res = await peekInvite("t");
    expect(res).toEqual({
      gameType: TIC_TAC_TOE,
      inviter: { username: "alice", avatar: { seed: "x" } },
      expired: false,
    });
    expect(JSON.stringify(res)).not.toContain("email");
  });

  test("unknown and expired tokens return the same expired shape (no oracle)", async () => {
    invite = null;
    const unknown = await peekInvite("nope");

    invite = {
      id: "inv-1",
      token: "t",
      inviterUserId: "inviter-1",
      gameType: TIC_TAC_TOE,
      config: null,
      seatingMode: null,
      expiresAt: past(),
      createdAt: new Date(),
    };
    const expired = await peekInvite("t");

    expect(unknown.expired).toBe(true);
    expect(expired.expired).toBe(true);
    expect(unknown.inviter).toBeNull();
    expect(expired.inviter).toBeNull();
    expect(unknown.gameType).toBeNull();
    expect(expired.gameType).toBeNull();
  });
});

describe("acceptInvite", () => {
  test("creates the DM + game and notifies the inviter with game_invite", async () => {
    invite = {
      id: "inv-1",
      token: "t",
      inviterUserId: "inviter-1",
      gameType: TIC_TAC_TOE,
      config: { variant: "x" },
      seatingMode: "challenge",
      expiresAt: future(),
      createdAt: new Date(),
    };
    const res = await acceptInvite("t", "accepter-9");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.gameId).toBe("GAMECD");
      expect(res.value.selfInvite).toBe(false);
      expect(res.value.inviter).toEqual({ username: "alice", avatar: { seed: "x" } });
    }
    expect(dmCreated).toEqual({ a: "inviter-1", b: "accepter-9" });
    expect(createGameArgs.userId).toBe("inviter-1");
    expect(createGameArgs.challengedUserId).toBe("accepter-9");
    expect(createGameArgs.seatingMode).toBe("challenge");
    expect(createGameArgs.config).toEqual({ variant: "x" });
    expect(notifyCalls).toEqual([
      {
        userId: "inviter-1",
        type: "game_invite",
        payload: { gameId: "GAMECD" },
      },
    ]);
  });

  test("rejects an expired token", async () => {
    invite = {
      id: "inv-1",
      token: "t",
      inviterUserId: "inviter-1",
      gameType: TIC_TAC_TOE,
      config: null,
      seatingMode: null,
      expiresAt: past(),
      createdAt: new Date(),
    };
    const res = await acceptInvite("t", "accepter-9");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
    expect(createGameArgs).toBeNull();
  });

  test("rejects an unknown token with the same shape as expired", async () => {
    invite = null;
    const res = await acceptInvite("nope", "accepter-9");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  test("opening your own link is a no-op (no self-game)", async () => {
    invite = {
      id: "inv-1",
      token: "t",
      inviterUserId: "inviter-1",
      gameType: TIC_TAC_TOE,
      config: null,
      seatingMode: null,
      expiresAt: future(),
      createdAt: new Date(),
    };
    const res = await acceptInvite("t", "inviter-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.selfInvite).toBe(true);
      expect(res.value.gameId).toBeNull();
    }
    expect(createGameArgs).toBeNull();
    expect(notifyCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test tests/invite-service.test.ts`
Expected: FAIL - module `../src/chat/invite-service` does not exist.

- [ ] **Step 3: Implement the service**

Create `apps/server/src/chat/invite-service.ts`:

```ts
import {
  conversations,
  generateInviteToken,
  invites,
  profiles,
} from "@gamelobby/database";
import type { AvatarConfig, GameType, SeatingMode } from "@gamelobby/shared/types";
import { env } from "../env";
import { notify } from "../realtime/notify";
import { createGameInConversation } from "./games-in-chat-service";
import { fail, ok, type ServiceResult } from "./result";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

type InviterPublic = { username: string; avatar: AvatarConfig | null };

type PeekResult = {
  gameType: GameType | null;
  inviter: InviterPublic | null;
  expired: boolean;
};

const ACCEPT_WINDOW_MS = 60 * 1000;
const ACCEPT_MAX_PER_WINDOW = 20;
const acceptBuckets = new Map<string, number[]>();

function acceptAllowed(inviterUserId: string): boolean {
  const now = Date.now();
  const recent = (acceptBuckets.get(inviterUserId) ?? []).filter(
    (t) => now - t < ACCEPT_WINDOW_MS,
  );
  if (recent.length >= ACCEPT_MAX_PER_WINDOW) {
    acceptBuckets.set(inviterUserId, recent);
    return false;
  }
  recent.push(now);
  acceptBuckets.set(inviterUserId, recent);
  return true;
}

export async function createInvite(input: {
  inviterUserId: string;
  gameType: GameType;
  config?: unknown;
  seatingMode?: SeatingMode | null;
}): Promise<ServiceResult<{ token: string; url: string }>> {
  const token = generateInviteToken();
  await invites.create({
    inviterUserId: input.inviterUserId,
    gameType: input.gameType,
    token,
    config: input.config,
    seatingMode: input.seatingMode ?? null,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  const url = `${env.webUrl}/invite/${token}`;
  return ok({ token, url });
}

export async function peekInvite(token: string): Promise<PeekResult> {
  const row = await invites.getByToken(token);
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return { gameType: null, inviter: null, expired: true };
  }
  const inviter = await profiles.getPublicUser(row.inviterUserId);
  return {
    gameType: row.gameType as GameType,
    inviter: inviter
      ? { username: inviter.username, avatar: inviter.avatar }
      : null,
    expired: false,
  };
}

export async function acceptInvite(
  token: string,
  accepterUserId: string,
): Promise<
  ServiceResult<{
    gameId: string | null;
    selfInvite: boolean;
    inviter: InviterPublic | null;
  }>
> {
  const row = await invites.getByToken(token);
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return fail("Invite not found or expired", 404);
  }

  const inviterPublic = await profiles.getPublicUser(row.inviterUserId);
  const inviter = inviterPublic
    ? { username: inviterPublic.username, avatar: inviterPublic.avatar }
    : null;

  if (row.inviterUserId === accepterUserId) {
    return ok({ gameId: null, selfInvite: true, inviter });
  }

  if (!acceptAllowed(row.inviterUserId)) {
    return fail("Too many invites accepted, try again shortly", 409);
  }

  const { conversation } = await conversations.getOrCreateDm(
    row.inviterUserId,
    accepterUserId,
  );

  const created = await createGameInConversation({
    userId: row.inviterUserId,
    conversationId: conversation.id,
    gameType: row.gameType as GameType,
    seatingMode: "challenge",
    challengedUserId: accepterUserId,
    config: row.config ?? undefined,
  });
  if (!created.ok) return fail(created.error, created.status);

  await notify(row.inviterUserId, "game_invite", {
    actorId: accepterUserId,
    payload: { gameId: created.value.game.id },
  });

  return ok({ gameId: created.value.game.id, selfInvite: false, inviter });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/server && bun test tests/invite-service.test.ts`
Expected: PASS (createInvite, peekInvite x2, acceptInvite x4).

- [ ] **Step 5: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/chat/invite-service.ts apps/server/tests/invite-service.test.ts
git commit -m "feat(server): invite service (create/peek/accept) with privacy + rate limit"
```

---

## Task 7: Invite Hono routes (`POST /api/invite`, public peek + accept) with anon minting

`POST /api/invite` uses `requireAuth`. `GET /api/invite/:token` and `POST /api/invite/:token/accept` are **public** (no `requireAuth`). On accept, if there is no session we mint an anonymous user through `auth.api.signInAnonymous({ headers, returnHeaders: true })` and copy its `Set-Cookie` header(s) onto the Hono response so the browser is logged in as the guest (Phase 0 registered the plugin). Unknown/expired tokens return a uniform 404 from the service.

**Files:**
- Create: `apps/server/src/api/routes/invite.ts`
- Modify: `apps/server/src/api/index.ts:5-27`
- Test: `apps/server/tests/invite-route.test.ts` (create)

- [ ] **Step 1: Write the failing route test**

Create `apps/server/tests/invite-route.test.ts`:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

type Session = { user: { id: string } } | null;
let session: Session = null;
let anonCalls = 0;
// biome-ignore lint/suspicious/noExplicitAny: test capture
let createInviteArgs: any = null;
// biome-ignore lint/suspicious/noExplicitAny: test capture
let acceptArgs: any[] = [];
// biome-ignore lint/suspicious/noExplicitAny: test capture
let peekArg: string | null = null;

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () => session,
      signInAnonymous: async () => {
        anonCalls += 1;
        const headers = new Headers();
        headers.append(
          "set-cookie",
          "better-auth.session_token=anon-token; Path=/; HttpOnly",
        );
        session = { user: { id: "anon-99" } };
        return { headers, response: { user: { id: "anon-99" } } };
      },
    },
  }),
}));

mock.module("../src/chat/invite-service", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  createInvite: async (input: any) => {
    createInviteArgs = input;
    return { ok: true, value: { token: "tok-123", url: "http://web/invite/tok-123" } };
  },
  peekInvite: async (token: string) => {
    peekArg = token;
    if (token === "missing") {
      return { gameType: null, inviter: null, expired: true };
    }
    return {
      gameType: TIC_TAC_TOE,
      inviter: { username: "alice", avatar: null },
      expired: false,
    };
  },
  acceptInvite: async (token: string, accepterUserId: string) => {
    acceptArgs.push({ token, accepterUserId });
    if (token === "missing") {
      return { ok: false, error: "Invite not found or expired", status: 404 };
    }
    if (accepterUserId === "inviter-1") {
      return { ok: true, value: { gameId: null, selfInvite: true, inviter: { username: "alice", avatar: null } } };
    }
    return {
      ok: true,
      value: { gameId: "GAMECD", selfInvite: false, inviter: { username: "alice", avatar: null } },
    };
  },
}));

const { inviteRouter } = await import("../src/api/routes/invite");

beforeEach(() => {
  session = null;
  anonCalls = 0;
  createInviteArgs = null;
  acceptArgs = [];
  peekArg = null;
});

describe("POST /api/invite", () => {
  test("401 without a session", async () => {
    const res = await inviteRouter.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameType: TIC_TAC_TOE }),
    });
    expect(res.status).toBe(401);
  });

  test("creates a token + url for the authed inviter", async () => {
    session = { user: { id: "inviter-1" } };
    const res = await inviteRouter.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameType: TIC_TAC_TOE }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      token: "tok-123",
      url: "http://web/invite/tok-123",
    });
    expect(createInviteArgs.inviterUserId).toBe("inviter-1");
    expect(createInviteArgs.gameType).toBe(TIC_TAC_TOE);
  });

  test("400 for an unknown game type", async () => {
    session = { user: { id: "inviter-1" } };
    const res = await inviteRouter.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameType: "chess" }),
    });
    expect(res.status).toBe(400);
    expect(createInviteArgs).toBeNull();
  });
});

describe("GET /api/invite/:token (public peek)", () => {
  test("returns gameType + inviter, never email, without a session", async () => {
    const res = await inviteRouter.request("/tok-123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      gameType: TIC_TAC_TOE,
      inviter: { username: "alice", avatar: null },
      expired: false,
    });
    expect(JSON.stringify(body)).not.toContain("email");
    expect(peekArg).toBe("tok-123");
  });

  test("missing/expired token returns expired with no inviter", async () => {
    const res = await inviteRouter.request("/missing");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      gameType: null,
      inviter: null,
      expired: true,
    });
  });
});

describe("POST /api/invite/:token/accept (public)", () => {
  test("mints an anon session and sets the cookie when logged out", async () => {
    session = null;
    const res = await inviteRouter.request("/tok-123/accept", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(anonCalls).toBe(1);
    expect(res.headers.get("set-cookie")).toContain("better-auth.session_token");
    expect(acceptArgs).toEqual([{ token: "tok-123", accepterUserId: "anon-99" }]);
    expect(await res.json()).toEqual({
      gameId: "GAMECD",
      selfInvite: false,
      inviter: { username: "alice", avatar: null },
    });
  });

  test("does not mint when already signed in", async () => {
    session = { user: { id: "accepter-7" } };
    const res = await inviteRouter.request("/tok-123/accept", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(anonCalls).toBe(0);
    expect(acceptArgs).toEqual([{ token: "tok-123", accepterUserId: "accepter-7" }]);
  });

  test("opening your own link is a no-op (selfInvite, no game)", async () => {
    session = { user: { id: "inviter-1" } };
    const res = await inviteRouter.request("/tok-123/accept", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      gameId: null,
      selfInvite: true,
      inviter: { username: "alice", avatar: null },
    });
  });

  test("404 for a missing/expired token", async () => {
    session = { user: { id: "accepter-7" } };
    const res = await inviteRouter.request("/missing/accept", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test tests/invite-route.test.ts`
Expected: FAIL - module `../src/api/routes/invite` does not exist.

- [ ] **Step 3: Implement the routes**

Create `apps/server/src/api/routes/invite.ts`:

```ts
import { gameTypeSchema } from "@gamelobby/shared/types";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import {
  acceptInvite,
  createInvite,
  peekInvite,
} from "../../chat/invite-service";
import { readJson } from "../auth-context";
import { type AuthEnv, requireAuth } from "../middleware/auth";

const createInviteRouter = new Hono<AuthEnv>()
  .use("*", requireAuth)
  .post("/", async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const parsedType = gameTypeSchema.safeParse(body?.gameType);
    if (!parsedType.success) return c.json({ error: "Invalid game type" }, 400);
    const res = await createInvite({
      inviterUserId: userId,
      gameType: parsedType.data,
      config: body?.config,
    });
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json(res.value);
  });

export const inviteRouter = new Hono()
  .route("/", createInviteRouter)
  .get("/:token", async (c) => {
    const peek = await peekInvite(c.req.param("token"));
    return c.json(peek);
  })
  .post("/:token/accept", async (c) => {
    const auth = getAuth();
    const headers = c.req.raw.headers;
    let accepterUserId: string | null = null;

    const session = await auth.api.getSession({ headers });
    if (session?.user?.id) {
      accepterUserId = session.user.id;
    } else {
      const minted = await auth.api.signInAnonymous({
        headers,
        returnHeaders: true,
      });
      accepterUserId = minted.response?.user?.id ?? null;
      for (const cookie of minted.headers.getSetCookie()) {
        c.header("set-cookie", cookie, { append: true });
      }
    }

    if (!accepterUserId) {
      return c.json({ error: "Could not start a session" }, 500);
    }

    const res = await acceptInvite(c.req.param("token"), accepterUserId);
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json(res.value);
  });
```

- [ ] **Step 4: Register the router in the API app**

In `apps/server/src/api/index.ts`, add the import (alphabetically with the others) and the `.route()` mount:

```ts
import { gifsRouter } from "./routes/gifs";
import { inviteRouter } from "./routes/invite";
import { messagesRouter } from "./routes/messages";
```

```ts
  .route("/conversations", conversationsRouter)
  .route("/messages", messagesRouter)
  .route("/notifications", notificationsRouter)
  .route("/invite", inviteRouter)
  .route("/gifs", gifsRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/server && bun test tests/invite-route.test.ts`
Expected: PASS (POST create x3, GET peek x2, POST accept x4).

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/api/routes/invite.ts apps/server/src/api/index.ts apps/server/tests/invite-route.test.ts
git commit -m "feat(server): invite routes (create + public peek/accept with anon mint)"
```

---

## Task 8: Integration test - accept creates the DM + game + game_invite notification

This exercises the real DB end-to-end: an inviter mints a token (repo), an accepter accepts (service), and we assert a DM, a live game, and a `game_invite` notification for the inviter all exist. Follows the harness conventions (`DB_UP`, `describe.skipIf`, `afterAll(h.cleanup)`).

**Important behavior to assert correctly:** `acceptInvite` calls `getOrCreateDm`, so the game is created in a `kind: "dm"` conversation. In `createGameInConversation` (`apps/server/src/chat/games-in-chat-service.ts`), a DM conversation **forces `seatingMode = "open"` and `challengedUserId = null`** regardless of the `seatingMode: "challenge"` / `challengedUserId` the service passes in - the second seat is filled when the accepter `join_room`s their board, exactly like the existing friend path. The persisted game therefore has `seatingMode === "open"`, `challengedUserId === null`, and only the inviter pre-seated. Assert those (not `challengedUserId === accepter.id`). The accepter still receives a `game_started` notification from `announceGame` (the DM's other member), and the inviter separately receives the `game_invite` notification this test checks.

**Files:**
- Create: `apps/server/integration/invite-flow.test.ts`

- [ ] **Step 1: Write the integration test**

Create `apps/server/integration/invite-flow.test.ts`:

```ts
import { afterAll, describe, expect, it } from "bun:test";
import {
  conversations,
  games,
  generateInviteToken,
  invites,
  notifications,
} from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { acceptInvite, peekInvite } from "../src/chat/invite-service";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("inv");

afterAll(h.cleanup);

describe.skipIf(!DB_UP)("invite accept flow", () => {
  it("peek returns gameType + inviter without leaking email", async () => {
    const inviter = await h.makeUser("peekHost");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const peek = await peekInvite(token);
    expect(peek.expired).toBe(false);
    expect(peek.gameType).toBe(TIC_TAC_TOE);
    expect(peek.inviter?.username).toBe(inviter.username);
    expect(JSON.stringify(peek)).not.toContain("@itest.local");
  });

  it("accept creates the DM, a live game, and a game_invite notification", async () => {
    const inviter = await h.makeUser("acceptHost");
    const accepter = await h.makeUser("guest");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await acceptInvite(token, accepter.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.selfInvite).toBe(false);
    expect(res.value.gameId).toBeTruthy();
    h.trackGame(res.value.gameId as string);

    const dm = await conversations.findDm(inviter.id, accepter.id);
    expect(dm).not.toBeNull();

    const game = await games.getGameByCode(res.value.gameId as string);
    expect(game?.gameType).toBe(TIC_TAC_TOE);
    expect(game?.creatorUserId).toBe(inviter.id);
    expect(game?.seatingMode).toBe("open");
    expect(game?.challengedUserId).toBeNull();
    expect(game?.players.some((p) => p.userId === inviter.id)).toBe(true);

    const inviterNotifs = await notifications.listForUser(inviter.id, {
      unreadOnly: true,
    });
    expect(
      inviterNotifs.notifications.some((n) => n.type === "game_invite"),
    ).toBe(true);
  });

  it("opening your own link does not create a self-game", async () => {
    const inviter = await h.makeUser("selfHost");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await acceptInvite(token, inviter.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.selfInvite).toBe(true);
      expect(res.value.gameId).toBeNull();
    }
  });

  it("rejects an expired token", async () => {
    const inviter = await h.makeUser("expHost");
    const accepter = await h.makeUser("expGuest");
    const token = generateInviteToken();
    await invites.create({
      inviterUserId: inviter.id,
      gameType: TIC_TAC_TOE,
      token,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const res = await acceptInvite(token, accepter.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the integration test (DB required)**

Run: `bun run db:start` (if not already running)
Run: `cd apps/server && bun run test:integration`
Expected: the `invite accept flow` suite passes (4 tests); the rest of the integration suite is unaffected. If `DB_UP` is false the suite is skipped (not failed).

- [ ] **Step 3: Commit**

```bash
git add apps/server/integration/invite-flow.test.ts
git commit -m "test(server): integration coverage for invite accept (DM + game + notification)"
```

---

## Task 9: Web - `createInviteLink()` helper + "Invite a friend (link)" lobby button

The lobby button mints a link via `POST /api/invite` and copies the URL to the clipboard. It mints a guest identity first via `ensureIdentity()` (Phase 0) so a logged-out visitor can create a link, then calls the authed endpoint.

**Files:**
- Create: `apps/web/lib/invite-client.ts`
- Modify: `apps/web/app/games/_shared/game-lobby.tsx`

- [ ] **Step 1: Implement the client helper**

Create `apps/web/lib/invite-client.ts`:

```ts
import { clientFetchJson } from "@/lib/api-client";

export type InviteLink = { token: string; url: string };

export async function createInviteLink(
  gameType: string,
  config?: Record<string, unknown>,
): Promise<InviteLink> {
  return clientFetchJson<InviteLink>("/api/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameType, config }),
  });
}
```

- [ ] **Step 2: Add the lobby button**

In `apps/web/app/games/_shared/game-lobby.tsx`, add imports at the top (after the existing imports, lines 1-6):

```tsx
import { useCallback } from "react";
import { FaLink } from "react-icons/fa6";
import { ensureIdentity } from "@/lib/auth/ensure-identity";
import { createInviteLink } from "@/lib/invite-client";
```

(Note: `useState` is already imported on line 5; merge `useCallback` into that React import rather than adding a duplicate `react` import line.)

Add state + handler inside the `GameLobby` component, after the `setField` definition (after line 24):

```tsx
  const [inviteStatus, setInviteStatus] = useState<"idle" | "busy" | "copied" | "error">(
    "idle",
  );

  const inviteByLink = useCallback(async () => {
    setInviteStatus("busy");
    try {
      await ensureIdentity();
      const { url } = await createInviteLink(meta.type, config);
      await navigator.clipboard.writeText(url);
      setInviteStatus("copied");
      setTimeout(() => setInviteStatus("idle"), 2500);
    } catch {
      setInviteStatus("error");
      setTimeout(() => setInviteStatus("idle"), 2500);
    }
  }, [meta.type, config]);
```

Add the button immediately after the "Play with a friend" button (after line 47, before the `{open && userId ...}` block):

```tsx
      <button
        type="button"
        onClick={inviteByLink}
        disabled={inviteStatus === "busy"}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay disabled:pointer-events-none disabled:opacity-50"
      >
        <FaLink size={16} className="shrink-0" aria-hidden="true" />
        {inviteStatus === "busy"
          ? "Creating link…"
          : inviteStatus === "copied"
            ? "Link copied!"
            : inviteStatus === "error"
              ? "Couldn't create link"
              : "Invite a friend (link)"}
      </button>
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/invite-client.ts apps/web/app/games/_shared/game-lobby.tsx
git commit -m "feat(web): add 'Invite a friend (link)' button to the game lobby"
```

---

## Task 10: Web - the snappy `/invite/[token]` accept page

The page is a client component. On the first frame it paints `getGameSkeleton(gameType)` (from `@gamelobby/games-client`) + an inviter banner, driven by the fast public peek; underneath it fires the POST accept (which mints a guest session via `Set-Cookie` if needed). On success it crossfades the skeleton out (motion `AnimatePresence` + `m.div`, already wrapped by `LazyMotion`/`domAnimation` in `providers.tsx`) and navigates to `/play/<gameId>`; a non-blocking "Add as friend" popup fires the existing friend-request socket flow.

**Files:**
- Create: `apps/web/app/invite/[token]/page.tsx`

- [ ] **Step 1: Implement the page**

Create `apps/web/app/invite/[token]/page.tsx`:

```tsx
"use client";

import { getGameSkeleton } from "@gamelobby/games-client";
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import { AnimatePresence, m } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaUserPlus } from "react-icons/fa6";
import { clientFetch, clientFetchJson } from "@/lib/api-client";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

type Peek = {
  gameType: string | null;
  inviter: { username: string; avatar: unknown } | null;
  expired: boolean;
};

type Accept = {
  gameId: string | null;
  selfInvite: boolean;
  inviter: { username: string; avatar: unknown } | null;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { socket } = useSocket();

  const [peek, setPeek] = useState<Peek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [inviterUsername, setInviterUsername] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<"idle" | "sent" | "busy">(
    "idle",
  );
  const acceptStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void clientFetchJson<Peek>(`/api/invite/${token}`)
      .then((p) => {
        if (!cancelled) setPeek(p);
      })
      .catch(() => {
        if (!cancelled) setPeek({ gameType: null, inviter: null, expired: true });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (acceptStarted.current) return;
    if (!peek || peek.expired) return;
    acceptStarted.current = true;

    void clientFetch(`/api/invite/${token}/accept`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
        return (await res.json()) as Accept;
      })
      .then((accept) => {
        setInviterUsername(accept.inviter?.username ?? null);
        if (accept.selfInvite || !accept.gameId) {
          router.replace("/games");
          return;
        }
        setReveal(true);
        router.replace(`/play/${accept.gameId}`);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not join the game");
      });
  }, [peek, token, router]);

  const addFriend = useCallback(async () => {
    if (!inviterUsername || !socket) return;
    setFriendStatus("busy");
    try {
      await emitAck(socket, CHAT_EVENTS.friendRequest, {
        username: inviterUsername,
      });
      setFriendStatus("sent");
    } catch {
      setFriendStatus("idle");
    }
  }, [inviterUsername, socket]);

  if (peek?.expired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-semibold text-foreground text-lg">
          This invite link has expired
        </p>
        <button
          type="button"
          onClick={() => router.replace("/games")}
          className="rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm"
        >
          Browse games
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-semibold text-danger text-lg">{error}</p>
        <button
          type="button"
          onClick={() => router.replace("/games")}
          className="rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm"
        >
          Browse games
        </button>
      </div>
    );
  }

  const Skeleton = getGameSkeleton(peek?.gameType ?? "");
  const inviterName = peek?.inviter?.username ?? inviterUsername;

  return (
    <div className="relative min-h-screen">
      <AnimatePresence>
        {!reveal ? (
          <m.div
            key="invite-skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6"
          >
            <p className="text-center text-muted-foreground text-sm">
              {inviterName
                ? `Joining ${inviterName}'s game…`
                : "Joining the game…"}
            </p>
            <Skeleton />
          </m.div>
        ) : null}
      </AnimatePresence>

      {inviterName ? (
        <div className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
          <p className="text-card-foreground text-sm">
            {inviterName} invited you
          </p>
          <button
            type="button"
            disabled={friendStatus !== "idle"}
            onClick={addFriend}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs outline-none transition hover:opacity-90 disabled:opacity-50"
          >
            <FaUserPlus size={14} aria-hidden="true" />
            {friendStatus === "sent" ? "Request sent" : "Add as friend"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: PASS. (`getGameSkeleton` accepts any `string` and falls back to `DefaultGameSkeleton`; `emitAck`/`useSocket`/`CHAT_EVENTS.friendRequest` are the existing friend-request flow.)

- [ ] **Step 3: Run the full web test suite (no regressions; the route adds no web test file)**

Run: `cd apps/web && bun test tests`
Expected: PASS (existing suite unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/invite/[token]/page.tsx
git commit -m "feat(web): /invite/[token] page with skeleton-first accept + add-friend popup"
```

---

## Task 11: Docs sync

A change is not done until the docs reflect it (CLAUDE.md / AGENTS.md). Update the architecture pages touched by this phase.

**Files:**
- Modify: `docs/architecture/database.md` - add the `game_invite` table (columns, the secure token vs. game code distinction, 24h expiry, cascade on inviter delete) and the `invites` repository.
- Modify: `docs/architecture/shared.md` - note the `game_invite` `NotificationType` + `notificationTypeSchema` move into `chat/schemas.ts`, and the `GameInviteRow` / `createGameInviteInputSchema` additions.
- Modify: `docs/architecture/realtime.md` - note the invite accept path (public `POST /api/invite/:token/accept` mints an anon session + `Set-Cookie`, then reuses `getOrCreateDm` + `createGameInConversation` + `notify("game_invite")`); `match_found`/queue lanes are Phase 2.
- Modify: `docs/architecture/web.md` - the `/invite/[token]` skeleton-first page, the lobby "Invite a friend (link)" button, and the add-friend popup reusing the friend-request socket flow.

- [ ] **Step 1: Update `docs/architecture/database.md`**

Open `docs/architecture/database.md`, find the section listing tables, and add a `game_invite` entry describing: `id` (uuid pk), `token` (text unique, 43-char base64url from `randomBytes(32)` - distinct from the 6-char `game.code`), `inviterUserId` (FK `user.id` cascade), `gameType`, `config` (jsonb nullable), `seatingMode` (nullable), `expiresAt` (default now + 24h), `createdAt`; index on `inviterUserId`. Note the `invites` repository (`create` / `getByToken`) is the only code that touches the table and validates input with `createGameInviteInputSchema`.

- [ ] **Step 2: Update `docs/architecture/shared.md`**

Open `docs/architecture/shared.md` and add: `game_invite` to the `NotificationType` union; `notificationTypeSchema` now lives in `types/chat/schemas.ts` and is re-used by `db/io.ts`; the new `GameInviteRow` row type and `createGameInviteInputSchema` under `types/db`.

- [ ] **Step 3: Update `docs/architecture/realtime.md`**

Open `docs/architecture/realtime.md` and add a short "Invite accept path" note describing the public `POST /api/invite/:token/accept` flow (anon mint via `auth.api.signInAnonymous` + `Set-Cookie`, self-invite no-op, expired/unknown rejected uniformly, reuse of `getOrCreateDm` + `createGameInConversation`, `game_invite` notification to the inviter; `game_invite` is a persisted notification, not a transient socket event).

- [ ] **Step 4: Update `docs/architecture/web.md`**

Open `docs/architecture/web.md` and add: the `/invite/[token]` client page (skeleton-first via `getGameSkeleton`, peek then accept, motion crossfade, navigate to `/play/<gameId>`), the lobby "Invite a friend (link)" button (`createInviteLink` → clipboard), and the non-blocking add-friend popup wired to the existing `friend:request` socket event. Confirm `invite` is in `RESERVED_USERNAMES`.

- [ ] **Step 5: Verify no comments / formatting drift in docs and code**

Run: `bun run check`
Expected: PASS (Biome leaves Markdown alone but verifies the touched code files).

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/database.md docs/architecture/shared.md docs/architecture/realtime.md docs/architecture/web.md
git commit -m "docs: document invite links (table, routes, accept path, web page)"
```

---

## Final verification

- [ ] **Run the whole gate**

Run: `bun run type-check`
Expected: PASS (drift-guard satisfied for `game_invite`; all route/service/web code type-checks).
Run: `bun run check`
Expected: PASS (Biome format/lint/imports; no comments introduced).
Run: `bun run test`
Expected: PASS across workspaces. New unit tests: `notification-type`, `reserved-usernames` (shared); `invite-token` (database); `invite-service`, `invite-route` (server). Existing suites unaffected (no new game type).

- [ ] **Run the integration suite (DB required)**

Run: `bun run db:start`
Run: `cd apps/server && bun run test:integration`
Expected: the `invite accept flow` suite passes (peek, accept-creates-DM+game+notification, self-invite no-op, expired rejection); the rest of the integration suite is unaffected.

- [ ] **Manual smoke (optional, needs `bun run db:start` + `bun run dev`)**

1. Sign in (or continue as a guest) and open a game lobby; click "Invite a friend (link)" - the button reports "Link copied!".
2. Paste the URL in a fresh logged-out browser. The page paints the game skeleton + "Joining <inviter>'s game…" immediately, then lands on `/play/<gameId>` as a freshly-minted guest (a `user` row with `is_anonymous = true`).
3. The inviter receives a `game_invite` notification; the "<inviter> invited you · Add as friend" popup sends a friend request on click.
4. Open your own link while signed in as the inviter - you are redirected to `/games` with no self-game created.
5. Manually expire a token in `db:studio` (set `expires_at` in the past) and re-open - the page shows "This invite link has expired".

---

## Self-review notes (coverage against spec §5.4)

- `game_invite` table (token != game code, inviter FK cascade, gameType, config, seatingMode, 24h expiry, createdAt) + `GameInviteRow` + drift-guard + `db:generate`/`db:push` - Task 1. ✅
- `invites` repository (`create` / `getByToken`) as a namespace; secure token via `crypto.randomBytes` base64url (NOT `generateGameCode`) - Tasks 4-5. ✅
- `game_invite` in `NotificationType` (dto.ts), Zod enum in `chat/schemas.ts`, `notificationTypeSchema` re-used in `db/io.ts` - Task 2. ✅
- `invite` added to `RESERVED_USERNAMES` (new `/invite` route) - Task 3. ✅
- `POST /api/invite` (auth) → `{ token, url }`; `GET /api/invite/:token` (public peek, only `{ gameType, inviter: {username, avatar}, expired }`, no email); `POST /api/invite/:token/accept` (public, anon mint + `Set-Cookie`, self no-op, `getOrCreateDm` + `createGameInConversation({ userId: inviter, ..., challengedUserId: accepter })`, `notify(inviter, "game_invite", { actorId: accepter, payload: { gameId } })`, returns `{ gameId, inviter }`) - Tasks 6-7. ✅
- Web `/invite/[token]` page: skeleton-first frame from peek + inviter banner, accept underneath, motion crossfade → `/play/<gameId>`, non-blocking add-friend popup on the existing `friend:request` socket flow - Task 10. ✅
- "Invite a friend (link)" lobby button → `POST /api/invite` + copy URL - Task 9. ✅
- Tests: create/peek/accept happy paths incl. anon-mint-when-logged-out, expired rejection, own-link no-op, `NotificationType` accepts `game_invite`, `RESERVED_USERNAMES` has `invite`; integration: accept creates DM + game + `game_invite` notification - Tasks 2, 3, 6, 7, 8. ✅
- SECURITY/PRIVACY: token high-entropy/unguessable (length/charset asserted, Task 4); single inviter binding (FK + `inviterUserId` on row, Task 1); peek/accept never leak inviter email or third-party data (asserted in Tasks 6-8); expired/unknown rejected with one uniform shape - no enumeration oracle (Tasks 6-7); per-inviter in-memory rate limit caps mass game creation (Task 6, cross-node Redis limiter noted as follow-up); own-link never creates a self-game (Tasks 6-8). ✅
- Docs synced: `database.md`, `shared.md`, `realtime.md`, `web.md` - Task 11. ✅
- Out of this phase: guest identity foundation (Phase 0, depended upon), merge (Phase 1), matchmaking (Phase 2).
