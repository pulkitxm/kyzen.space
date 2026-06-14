# Account Merge (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a guest (anonymous Better Auth user) later signs in with Google, offer a consent-gated nudge that migrates their games, chats, friends, and stats onto the real account. The migration runs server-side, only after the target user confirms, and never trusts a client-supplied anon id.

**Architecture:** A new `account_merge` table records every anon→target link the moment Better Auth's `onLinkAccount` fires during the OAuth callback (`status = "pending"`). The web app, after sign-in, calls `GET /api/account/merge/pending`; if a pending row exists it shows counts (games / chats / friends / stat lines) plus the target email, with Merge / Discard buttons. `POST /api/account/merge/:id/confirm` (authenticated *as the target*, ownership-asserted) runs the `mergeAccounts(anonId, targetId)` transaction - reassigning every row keyed on `anonId`, collapsing self-references (self-friendship, self-DM, self-play seat), summing `profile.stats` per gameType, dropping self-targeted notifications, deleting the anon profile and the anon `user` row - then marks the merge `confirmed`. `POST /api/account/merge/:id/discard` deletes the anon user + its FK-cascaded data (plus the FK-less `game_player`/`move` rows) and marks `discarded`. All DB work lives in a new `@kyzen/database` repository; the merge is idempotent (only a `pending` row is actionable).

**Tech Stack:** Better Auth 1.6.11 (`better-auth/plugins` `anonymous`, `onLinkAccount`), Drizzle/Postgres (single `db.transaction`), Hono routes (`requireAuth`), Next.js 16 App Router + framer-motion (already in `apps/web`), Bun test (`mock.module` for unit; `integration/harness.ts` for DB-backed).

**Scope note:** This phase depends on Phase 0 (Guest Identity). Phase 0 added the `anonymous()` plugin with `disableDeleteAnonymousUser: true` and the `isAnonymous` column on `user`, the `GuestNudge` client component (`apps/web/app/guest-nudge.tsx`), and threaded `isAnonymous` from `app/layout.tsx` → `app/app-shell.tsx`. This plan adds **only** the `onLinkAccount` recorder, the `account_merge` table + repository, the three endpoints, and the merge-consent dialog (mounted next to `GuestNudge` inside the shell). Matchmaking is Phase 2; invites are Phase 3.

**Prerequisite:** Postgres running. Run `bun run db:start` once before Task 1's `db:push`, and again before the integration tests in the Final verification section.

---

## File Structure

- `packages/shared/src/types/db/index.ts` - add `AccountMergeStatus` union + `AccountMergeRow` type (modify).
- `packages/shared/src/types/db/io.ts` - add `accountMergeStatusSchema` + `recordAccountMergeInputSchema` Zod schemas (modify).
- `packages/database/src/schema.ts` - add the `account_merge` table (modify).
- `packages/database/src/drift-guard.ts` - add the `Expect<Equal<…>>` entry for `account_merge` (modify).
- `packages/database/src/repositories/account-merge.ts` - `recordPending` / `getPendingForTarget` / `getById` / `markResolved` / `summarizeAnonAccount` / `deleteAnonUserData` / `mergeAccounts` (create).
- `packages/database/src/index.ts` - expose `export * as accountMerge` (modify).
- `apps/server/src/auth.ts` - wire `onLinkAccount` to `accountMerge.recordPending` (modify).
- `apps/server/src/api/routes/account.ts` - add `GET /merge/pending`, `POST /merge/:id/confirm`, `POST /merge/:id/discard` (modify).
- `apps/web/lib/account-merge.ts` - client fetchers `getPendingMerge` / `confirmMerge` / `discardMerge` (create).
- `apps/web/app/merge-consent.tsx` - the merge-consent dialog (create).
- `apps/web/app/app-shell.tsx` - mount `<MergeConsent isAnonymous={isAnonymous} />` next to `GuestNudge` (modify).
- Tests:
  - `packages/database/tests/account-merge-input.test.ts` (create) - unit, Zod input validation.
  - `apps/server/tests/account-merge-route.test.ts` (create) - unit, endpoint ownership/idempotency with mocked deps.
  - `apps/server/integration/account-merge.test.ts` (create) - DB-backed `mergeAccounts` + `recordPending` coverage.
  - `apps/web/tests/merge-consent.test.tsx` (create) - render gating + privacy (no raw data / temp email).

---

## Task 1: `AccountMergeStatus` + `AccountMergeRow` types and the input schema

The `drift-guard` (`packages/database/src/drift-guard.ts`) asserts `Equal<typeof <table>.$inferSelect, <Row>>` at compile time, so the row type and column types must move together (Task 2 adds the table; this task adds the type so the guard is ready). We mirror `FriendStatus` (a string-union used via `text().$type<…>()`, `packages/shared/src/types/chat/dto.ts:16`) rather than a `pgEnum`, matching the existing `friendship.status` convention.

**Files:**
- Modify: `packages/shared/src/types/db/index.ts:39-47` (add the new type right after `UserRow`)
- Modify: `packages/shared/src/types/db/io.ts:54` (add after `createNotificationInputSchema`)

- [ ] **Step 1: Add `AccountMergeStatus` and `AccountMergeRow` to the shared db types**

In `packages/shared/src/types/db/index.ts`, add immediately after the `UserRow` type block (which ends at line 47):

```ts
export type AccountMergeStatus = "pending" | "confirmed" | "discarded";

export type AccountMergeRow = {
  id: string;
  anonUserId: string;
  targetUserId: string;
  status: AccountMergeStatus;
  createdAt: Date;
  resolvedAt: Date | null;
};
```

- [ ] **Step 2: Add the input schemas to `db/io.ts`**

In `packages/shared/src/types/db/io.ts`, append after `createNotificationInputSchema` (the block ending at line 54):

```ts
export const accountMergeStatusSchema = z.enum([
  "pending",
  "confirmed",
  "discarded",
]);

export const recordAccountMergeInputSchema = z
  .object({
    anonUserId: z.string().min(1),
    targetUserId: z.string().min(1),
  })
  .refine((v) => v.anonUserId !== v.targetUserId, {
    message: "anonUserId and targetUserId must differ",
  });
```

(`db/index.ts` re-exports `./io` via `export * from "./io"` at line 17, so both schemas are reachable from `@kyzen/shared/types`.)

- [ ] **Step 3: Verify type-check still passes (no DB table yet, so the guard entry is added in Task 2)**

Run: `bun run type-check`
Expected: PASS (these are additive type/schema declarations with no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/db/index.ts packages/shared/src/types/db/io.ts
git commit -m "feat(shared): add AccountMergeRow type and account-merge input schemas"
```

---

## Task 2: `account_merge` table + drift-guard entry

**Files:**
- Modify: `packages/database/src/schema.ts` (append a new table after `notification`, line 298; `index`, `unique`, `text`, `timestamp`, `uuid` are already imported at lines 27-35)
- Modify: `packages/database/src/drift-guard.ts:1-30` (import + entry)

- [ ] **Step 1: Add the `account_merge` table**

In `packages/database/src/schema.ts`, first extend the `@kyzen/shared/types` type import block (lines 9-22) to include `AccountMergeStatus`:

```ts
import type {
  AccountMergeStatus,
  AvatarConfig,
  ChatMode,
  ConversationKind,
  FriendStatus,
  GameStatus,
  MemberRole,
  MessageKind,
  MessageMetadata,
  NotificationPayload,
  NotificationType,
  ProfileStats,
  SeatingMode,
} from "@kyzen/shared/types";
```

Then append the table at the end of the file (after the `notification` table, which closes at line 298):

```ts
export const accountMerge = pgTable(
  "account_merge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    anonUserId: text("anon_user_id").notNull(),
    targetUserId: text("target_user_id").notNull(),
    status: text("status")
      .$type<AccountMergeStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    index("account_merge_target_status_idx").on(t.targetUserId, t.status),
  ],
);
```

- [ ] **Step 2: Add the drift-guard entry (this should fail type-check until the table exists, then pass)**

In `packages/database/src/drift-guard.ts`, add `AccountMergeRow` to the shared-types import (lines 1-15) and `accountMerge` to the schema import (lines 16-30):

```ts
import type {
  AccountMergeRow,
  AccountRow,
  ConversationMemberRow,
  ConversationRow,
  FriendshipRow,
  GamePlayerRow,
  GameRow,
  MessageRow,
  MoveRow,
  NotificationRow,
  SessionRow,
  UserProfileRow,
  UserRow,
  VerificationRow,
} from "@kyzen/shared/types";
import type {
  account,
  accountMerge,
  conversation,
  conversationMember,
  friendship,
  game,
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

Then add the check as the final entry in the `SchemaDriftChecks` tuple (after line 52, the `notification` entry):

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
  Expect<Equal<typeof accountMerge.$inferSelect, AccountMergeRow>>,
];
```

- [ ] **Step 3: Run type-check to verify the guard is satisfied**

Run: `bun run type-check`
Expected: PASS (the `$inferSelect` of `account_merge` equals `AccountMergeRow`).

- [ ] **Step 4: Generate the migration and push to the dev DB**

Run: `bun run db:generate`
Expected: a new migration appears under `packages/database/drizzle/` creating the `account_merge` table with the `account_merge_target_status_idx` index.
Run: `bun run db:push`
Expected: `db:push` reports the `account_merge` table created.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/schema.ts packages/database/src/drift-guard.ts packages/database/drizzle
git commit -m "feat(db): add account_merge table for the anon-to-real merge flow"
```

---

## Task 3: `account-merge` repository - record / lookup / resolve / summarize / delete (no merge yet)

This task builds the small, deterministic seams: `recordPending`, `getPendingForTarget`, `getById`, `markResolved`, `summarizeAnonAccount` (privacy-safe counts only), and `deleteAnonUserData` (used by both confirm and discard to scrub the FK-less `game_player`/`move` rows the spec §8 flags, plus the anon `user` row whose cascade clears friendship/conversation_member/message/notification/user_profile). The `mergeAccounts` transaction is Task 4.

**Files:**
- Create: `packages/database/src/repositories/account-merge.ts`
- Modify: `packages/database/src/index.ts:25` (add the namespace export immediately before the `conversations` namespace on line 25)
- Test: `packages/database/tests/account-merge-input.test.ts` (create)

- [ ] **Step 1: Write the failing input-validation unit test**

Create `packages/database/tests/account-merge-input.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  accountMergeStatusSchema,
  recordAccountMergeInputSchema,
} from "@kyzen/shared/types";

describe("account-merge input schemas", () => {
  it("accepts a distinct anon/target pair", () => {
    const parsed = recordAccountMergeInputSchema.parse({
      anonUserId: "anon-1",
      targetUserId: "target-1",
    });
    expect(parsed.anonUserId).toBe("anon-1");
    expect(parsed.targetUserId).toBe("target-1");
  });

  it("rejects an empty anon id", () => {
    expect(() =>
      recordAccountMergeInputSchema.parse({
        anonUserId: "",
        targetUserId: "target-1",
      }),
    ).toThrow();
  });

  it("rejects merging an account into itself", () => {
    expect(() =>
      recordAccountMergeInputSchema.parse({
        anonUserId: "same",
        targetUserId: "same",
      }),
    ).toThrow();
  });

  it("constrains status to the three known values", () => {
    expect(accountMergeStatusSchema.parse("pending")).toBe("pending");
    expect(accountMergeStatusSchema.parse("confirmed")).toBe("confirmed");
    expect(accountMergeStatusSchema.parse("discarded")).toBe("discarded");
    expect(() => accountMergeStatusSchema.parse("bogus")).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it passes against the Task 1 schemas**

Run: `cd packages/database && bun test tests/account-merge-input.test.ts`
Expected: PASS (4 tests). This file only exercises `recordAccountMergeInputSchema` / `accountMergeStatusSchema`, which were already added to `@kyzen/shared/types` in Task 1, so it is green the moment it is written - it is a regression guard on the input schemas, not a red-then-green checkpoint for the repository. (If it FAILs with "not exported", Task 1 was not applied; apply Task 1 first.) The repository code itself is exercised DB-backed in the Task 5 integration suite.

- [ ] **Step 3: Implement the repository (record / lookup / resolve / summarize / delete)**

Create `packages/database/src/repositories/account-merge.ts`:

```ts
import type {
  AccountMergeRow,
  AccountMergeStatus,
} from "@kyzen/shared/types";
import { recordAccountMergeInputSchema } from "@kyzen/shared/types";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  accountMerge,
  conversationMember,
  friendship,
  game,
  gamePlayer,
  move,
  user,
  userProfile,
} from "../schema";

export type AnonAccountSummary = {
  games: number;
  conversations: number;
  friends: number;
  statLines: number;
};

export async function recordPending(
  anonUserId: string,
  targetUserId: string,
): Promise<AccountMergeRow> {
  recordAccountMergeInputSchema.parse({ anonUserId, targetUserId });
  const [row] = await db
    .insert(accountMerge)
    .values({ anonUserId, targetUserId, status: "pending" })
    .returning();
  if (!row) throw new Error("Failed to record account merge");
  return row;
}

export async function getById(id: string): Promise<AccountMergeRow | null> {
  const [row] = await db
    .select()
    .from(accountMerge)
    .where(eq(accountMerge.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPendingForTarget(
  targetUserId: string,
): Promise<AccountMergeRow | null> {
  const [row] = await db
    .select()
    .from(accountMerge)
    .where(
      and(
        eq(accountMerge.targetUserId, targetUserId),
        eq(accountMerge.status, "pending"),
      ),
    )
    .orderBy(sql`${accountMerge.createdAt} desc`)
    .limit(1);
  return row ?? null;
}

export async function markResolved(
  id: string,
  status: Exclude<AccountMergeStatus, "pending">,
): Promise<AccountMergeRow | null> {
  const [row] = await db
    .update(accountMerge)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(accountMerge.id, id), eq(accountMerge.status, "pending")))
    .returning();
  return row ?? null;
}

export async function summarizeAnonAccount(
  anonUserId: string,
): Promise<AnonAccountSummary> {
  const [[gameCount], [convCount], [friendCount], [profile]] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(gamePlayer)
        .where(eq(gamePlayer.userId, anonUserId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationMember)
        .where(eq(conversationMember.userId, anonUserId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(friendship)
        .where(
          or(
            eq(friendship.requesterId, anonUserId),
            eq(friendship.addresseeId, anonUserId),
          ),
        ),
      db
        .select({ stats: userProfile.stats })
        .from(userProfile)
        .where(eq(userProfile.userId, anonUserId))
        .limit(1),
    ]);
  return {
    games: gameCount?.count ?? 0,
    conversations: convCount?.count ?? 0,
    friends: friendCount?.count ?? 0,
    statLines: profile?.stats ? Object.keys(profile.stats).length : 0,
  };
}

export async function deleteAnonUserData(anonUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const seatedGameIds = await tx
      .select({ gameId: gamePlayer.gameId })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, anonUserId));
    await tx.delete(gamePlayer).where(eq(gamePlayer.userId, anonUserId));
    await tx.delete(move).where(eq(move.playerId, anonUserId));
    if (seatedGameIds.length > 0) {
      await tx.delete(game).where(
        inArray(
          game.id,
          seatedGameIds.map((g) => g.gameId),
        ),
      );
    }
    await tx.delete(user).where(eq(user.id, anonUserId));
  });
}
```

- [ ] **Step 4: Expose the namespace from the package index**

In `packages/database/src/index.ts`, add the export (keep the list alphabetised after `conversations`):

```ts
export * as accountMerge from "./repositories/account-merge";
export * as conversations from "./repositories/conversations";
```

- [ ] **Step 5: Run the unit test and type-check**

Run: `cd packages/database && bun test tests/account-merge-input.test.ts`
Expected: PASS (4 tests).
Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/repositories/account-merge.ts packages/database/src/index.ts packages/database/tests/account-merge-input.test.ts
git commit -m "feat(db): add account-merge repository record/lookup/resolve/summary seams"
```

---

## Task 4: `mergeAccounts(anonId, targetId)` - the table-by-table transaction

Implement the full migration in one `db.transaction`, applying the exact policy from spec §5.2. The `friendship` (`pairKey`), `conversation_member` (`convId,userId`), and `game_player` (`gameId,userId`) unique constraints plus self-references force per-row decisions, so we read the relevant anon rows and replay them rather than blind bulk-updating.

Key reused facts (verified against code):
- `friendship.pairKey = [a, b].sort().join(":")` (`repositories/friends.ts:6`); status ordering `accepted > pending` (`declined` lowest).
- `conversation.dmKey = [a, b].sort().join(":")` (`repositories/conversations.ts:10`); a DM has exactly two members.
- `game_player` unique is `(gameId, userId)` (`schema.ts:162`); `move.playerId` has no constraint (`schema.ts:141`).
- `userProfile.stats` is `Record<string, GameStat>` with `GameStat = { played, won, lost, drawn }` (`db/index.ts:30-37`).
- `notification` has `userId` and nullable `actorId` (`schema.ts:279,283`); drop rows where `actorId == userId` after re-point.

**Files:**
- Modify: `packages/database/src/repositories/account-merge.ts` (append `mergeAccounts`)

- [ ] **Step 1: Extend the schema import to add `conversation`, `message`, `notification`**

Task 3 imported only the tables it used. `mergeAccounts` adds three more. Replace the schema import at the top of `packages/database/src/repositories/account-merge.ts` with:

```ts
import {
  accountMerge,
  conversation,
  conversationMember,
  friendship,
  game,
  gamePlayer,
  message,
  move,
  notification,
  user,
  userProfile,
} from "../schema";
```

(`and`, `eq`, `inArray`, `or`, `sql` are already imported from `drizzle-orm` in Task 3 and all are used by `mergeAccounts`.)

- [ ] **Step 2: Append `mergeAccounts` and its helpers to the repository**

Append to `packages/database/src/repositories/account-merge.ts`:

```ts
type FriendStatusRank = Record<string, number>;

const FRIEND_STATUS_RANK: FriendStatusRank = {
  accepted: 3,
  pending: 2,
  declined: 1,
};

function betterFriendStatus(a: string, b: string): string {
  return (FRIEND_STATUS_RANK[a] ?? 0) >= (FRIEND_STATUS_RANK[b] ?? 0) ? a : b;
}

function pairKeyOf(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function mergeStats(
  target: Record<string, { played: number; won: number; lost: number; drawn: number }>,
  anon: Record<string, { played: number; won: number; lost: number; drawn: number }>,
): Record<string, { played: number; won: number; lost: number; drawn: number }> {
  const out = { ...target };
  for (const [gameType, s] of Object.entries(anon)) {
    const cur = out[gameType] ?? { played: 0, won: 0, lost: 0, drawn: 0 };
    out[gameType] = {
      played: cur.played + s.played,
      won: cur.won + s.won,
      lost: cur.lost + s.lost,
      drawn: cur.drawn + s.drawn,
    };
  }
  return out;
}

export async function mergeAccounts(
  anonId: string,
  targetId: string,
): Promise<void> {
  if (anonId === targetId) return;
  await db.transaction(async (tx) => {
    const [anonProfile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, anonId))
      .limit(1);
    const [targetProfile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, targetId))
      .limit(1);
    if (anonProfile && targetProfile) {
      const merged = mergeStats(
        targetProfile.stats ?? {},
        anonProfile.stats ?? {},
      );
      await tx
        .update(userProfile)
        .set({ stats: merged, updatedAt: new Date() })
        .where(eq(userProfile.userId, targetId));
    }

    await tx
      .update(game)
      .set({ creatorUserId: targetId })
      .where(eq(game.creatorUserId, anonId));
    await tx
      .update(game)
      .set({ challengedUserId: targetId })
      .where(eq(game.challengedUserId, anonId));
    await tx
      .update(game)
      .set({ winner: targetId })
      .where(eq(game.winner, anonId));

    const targetSeatGames = await tx
      .select({ gameId: gamePlayer.gameId })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, targetId));
    const targetSeatSet = new Set(targetSeatGames.map((r) => r.gameId));
    const anonSeats = await tx
      .select()
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, anonId));
    for (const seat of anonSeats) {
      if (targetSeatSet.has(seat.gameId)) {
        await tx.delete(gamePlayer).where(eq(gamePlayer.id, seat.id));
      } else {
        await tx
          .update(gamePlayer)
          .set({ userId: targetId })
          .where(eq(gamePlayer.id, seat.id));
        targetSeatSet.add(seat.gameId);
      }
    }
    await tx
      .update(move)
      .set({ playerId: targetId })
      .where(eq(move.playerId, anonId));

    const anonFriendships = await tx
      .select()
      .from(friendship)
      .where(
        or(
          eq(friendship.requesterId, anonId),
          eq(friendship.addresseeId, anonId),
        ),
      );
    for (const f of anonFriendships) {
      const other = f.requesterId === anonId ? f.addresseeId : f.requesterId;
      if (other === targetId) {
        await tx.delete(friendship).where(eq(friendship.id, f.id));
        continue;
      }
      const [existing] = await tx
        .select()
        .from(friendship)
        .where(eq(friendship.pairKey, pairKeyOf(targetId, other)))
        .limit(1);
      if (existing) {
        const keep = betterFriendStatus(existing.status, f.status);
        await tx
          .update(friendship)
          .set({ status: keep, updatedAt: new Date() })
          .where(eq(friendship.id, existing.id));
        await tx.delete(friendship).where(eq(friendship.id, f.id));
      } else {
        const requesterId = f.requesterId === anonId ? targetId : f.requesterId;
        const addresseeId = f.addresseeId === anonId ? targetId : f.addresseeId;
        await tx
          .update(friendship)
          .set({
            requesterId,
            addresseeId,
            pairKey: pairKeyOf(requesterId, addresseeId),
            updatedAt: new Date(),
          })
          .where(eq(friendship.id, f.id));
      }
    }

    const anonMemberships = await tx
      .select()
      .from(conversationMember)
      .where(eq(conversationMember.userId, anonId));
    for (const m of anonMemberships) {
      const [conv] = await tx
        .select()
        .from(conversation)
        .where(eq(conversation.id, m.conversationId))
        .limit(1);
      const isSelfDm =
        conv?.kind === "dm" && conv.dmKey === pairKeyOf(anonId, targetId);
      const [targetMember] = await tx
        .select({ id: conversationMember.id })
        .from(conversationMember)
        .where(
          and(
            eq(conversationMember.conversationId, m.conversationId),
            eq(conversationMember.userId, targetId),
          ),
        )
        .limit(1);
      if (isSelfDm || targetMember) {
        await tx
          .delete(conversationMember)
          .where(eq(conversationMember.id, m.id));
      } else {
        await tx
          .update(conversationMember)
          .set({ userId: targetId })
          .where(eq(conversationMember.id, m.id));
      }
    }

    await tx
      .update(message)
      .set({ senderId: targetId })
      .where(eq(message.senderId, anonId));

    await tx
      .update(notification)
      .set({ userId: targetId })
      .where(eq(notification.userId, anonId));
    await tx
      .update(notification)
      .set({ actorId: targetId })
      .where(eq(notification.actorId, anonId));
    await tx
      .delete(notification)
      .where(sql`${notification.actorId} = ${notification.userId}`);

    await tx.delete(userProfile).where(eq(userProfile.userId, anonId));
    await tx.delete(user).where(eq(user.id, anonId));
  });
}
```

The order matters: profile stats are summed before the anon profile is deleted; `game_player`/`move`/`friendship`/`conversation_member`/`message`/`notification` rows are re-pointed before the anon `user` row is deleted (its cascade would otherwise wipe FK'd rows the policy wants re-pointed). The `game` text columns (`creatorUserId`, `winner`) have no FK; `challengedUserId` FKs `user` with `onDelete: "set null"`, so re-pointing it before the user delete preserves the value.

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/repositories/account-merge.ts
git commit -m "feat(db): implement mergeAccounts migration transaction with self-reference collapse"
```

---

## Task 5: Integration tests for `mergeAccounts` + `recordPending`

DB-backed coverage of every conflict row in spec §5.2. Mirrors the existing harness pattern (`apps/server/integration/notifications-edge.test.ts`): `createHarness`, `describe.skipIf(!DB_UP)`, `afterAll(h.cleanup)`. The harness `makeUser` already inserts a `user` + `user_profile` row, so an anon test user is just a normal harness user; cleanup deletes by user id (cascade) and tracked games/conversations.

**Files:**
- Test: `apps/server/integration/account-merge.test.ts` (create)

- [ ] **Step 1: Write the integration test**

Create `apps/server/integration/account-merge.test.ts`:

```ts
import { afterAll, describe, expect, it } from "bun:test";
import { accountMerge, db, friends, schema } from "@kyzen/database";
import { and, eq, or } from "drizzle-orm";
import { createHarness, DB_UP, type TestUser } from "./harness";

const h = createHarness("am");

afterAll(h.cleanup);

async function makeFriendship(
  requester: TestUser,
  addressee: TestUser,
  status: "pending" | "accepted",
): Promise<void> {
  await db.insert(schema.friendship).values({
    requesterId: requester.id,
    addresseeId: addressee.id,
    pairKey: friends.pairKey(requester.id, addressee.id),
    status,
  });
}

async function makeDmConversation(
  a: TestUser,
  b: TestUser,
): Promise<string> {
  const [conv] = await db
    .insert(schema.conversation)
    .values({ kind: "dm", dmKey: [a.id, b.id].sort().join(":"), createdBy: a.id })
    .returning();
  if (!conv) throw new Error("no conv");
  await db.insert(schema.conversationMember).values([
    { conversationId: conv.id, userId: a.id, role: "member" },
    { conversationId: conv.id, userId: b.id, role: "member" },
  ]);
  return conv.id;
}

describe.skipIf(!DB_UP)("account merge", () => {
  it("recordPending writes a pending row and getPendingForTarget reads it", async () => {
    const anon = await h.makeUser("rp_anon");
    const target = await h.makeUser("rp_target");
    const row = await accountMerge.recordPending(anon.id, target.id);
    expect(row.status).toBe("pending");
    expect(row.resolvedAt).toBeNull();
    const pending = await accountMerge.getPendingForTarget(target.id);
    expect(pending?.id).toBe(row.id);
    expect(pending?.anonUserId).toBe(anon.id);
  });

  it("recordPending rejects merging an account into itself", async () => {
    const u = await h.makeUser("rp_self");
    await expect(accountMerge.recordPending(u.id, u.id)).rejects.toThrow();
  });

  it("markResolved only resolves a pending row and is idempotent", async () => {
    const anon = await h.makeUser("mr_anon");
    const target = await h.makeUser("mr_target");
    const row = await accountMerge.recordPending(anon.id, target.id);
    const first = await accountMerge.markResolved(row.id, "confirmed");
    expect(first?.status).toBe("confirmed");
    expect(first?.resolvedAt).not.toBeNull();
    const second = await accountMerge.markResolved(row.id, "discarded");
    expect(second).toBeNull();
  });

  it("summarizeAnonAccount returns counts only (privacy-safe)", async () => {
    const anon = await h.makeUser("sum_anon");
    const other = await h.makeUser("sum_other");
    await makeFriendship(anon, other, "accepted");
    const convId = await makeDmConversation(anon, other);
    h.trackGame("noop");
    await db
      .update(schema.userProfile)
      .set({ stats: { ttt: { played: 2, won: 1, lost: 1, drawn: 0 } } })
      .where(eq(schema.userProfile.userId, anon.id));
    const summary = await accountMerge.summarizeAnonAccount(anon.id);
    expect(summary.friends).toBe(1);
    expect(summary.conversations).toBe(1);
    expect(summary.statLines).toBe(1);
    expect(Object.keys(summary)).toEqual([
      "games",
      "conversations",
      "friends",
      "statLines",
    ]);
    void convId;
  });

  it("merge sums profile stats per gameType and deletes the anon profile + user", async () => {
    const anon = await h.makeUser("st_anon");
    const target = await h.makeUser("st_target");
    await db
      .update(schema.userProfile)
      .set({ stats: { ttt: { played: 3, won: 2, lost: 1, drawn: 0 } } })
      .where(eq(schema.userProfile.userId, anon.id));
    await db
      .update(schema.userProfile)
      .set({ stats: { ttt: { played: 1, won: 0, lost: 0, drawn: 1 } } })
      .where(eq(schema.userProfile.userId, target.id));

    await accountMerge.mergeAccounts(anon.id, target.id);

    const [tProfile] = await db
      .select()
      .from(schema.userProfile)
      .where(eq(schema.userProfile.userId, target.id));
    expect(tProfile?.stats.ttt).toEqual({
      played: 4,
      won: 2,
      lost: 1,
      drawn: 1,
    });
    const [aProfile] = await db
      .select()
      .from(schema.userProfile)
      .where(eq(schema.userProfile.userId, anon.id));
    expect(aProfile).toBeUndefined();
    const [aUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, anon.id));
    expect(aUser).toBeUndefined();
  });

  it("collapses a self-friendship (anon friends-with target -> deleted)", async () => {
    const anon = await h.makeUser("sf_anon");
    const target = await h.makeUser("sf_target");
    await makeFriendship(anon, target, "accepted");
    await accountMerge.mergeAccounts(anon.id, target.id);
    const [row] = await db
      .select()
      .from(schema.friendship)
      .where(eq(schema.friendship.pairKey, friends.pairKey(anon.id, target.id)));
    expect(row).toBeUndefined();
  });

  it("dedupes friendships keeping accepted over pending and recomputes pairKey", async () => {
    const anon = await h.makeUser("df_anon");
    const target = await h.makeUser("df_target");
    const other = await h.makeUser("df_other");
    await makeFriendship(anon, other, "accepted");
    await makeFriendship(target, other, "pending");
    await accountMerge.mergeAccounts(anon.id, target.id);
    const rows = await db
      .select()
      .from(schema.friendship)
      .where(
        or(
          eq(schema.friendship.requesterId, target.id),
          eq(schema.friendship.addresseeId, target.id),
        ),
      );
    const toOther = rows.filter(
      (r) => r.requesterId === other.id || r.addresseeId === other.id,
    );
    expect(toOther).toHaveLength(1);
    expect(toOther[0]?.status).toBe("accepted");
    expect(toOther[0]?.pairKey).toBe(friends.pairKey(target.id, other.id));
  });

  it("re-points a friendship to a stranger and recomputes pairKey when target has no edge", async () => {
    const anon = await h.makeUser("rep_anon");
    const target = await h.makeUser("rep_target");
    const other = await h.makeUser("rep_other");
    await makeFriendship(anon, other, "accepted");
    await accountMerge.mergeAccounts(anon.id, target.id);
    const [row] = await db
      .select()
      .from(schema.friendship)
      .where(eq(schema.friendship.pairKey, friends.pairKey(target.id, other.id)));
    expect(row?.status).toBe("accepted");
    expect(
      row?.requesterId === target.id || row?.addresseeId === target.id,
    ).toBe(true);
  });

  it("collapses a self-DM (anon+target two-member DM -> anon membership dropped)", async () => {
    const anon = await h.makeUser("sd_anon");
    const target = await h.makeUser("sd_target");
    const convId = await makeDmConversation(anon, target);
    await accountMerge.mergeAccounts(anon.id, target.id);
    const members = await db
      .select()
      .from(schema.conversationMember)
      .where(eq(schema.conversationMember.conversationId, convId));
    expect(members.some((m) => m.userId === anon.id)).toBe(false);
    const targetMembers = members.filter((m) => m.userId === target.id);
    expect(targetMembers).toHaveLength(1);
  });

  it("drops anon membership when target already a member of the same conversation", async () => {
    const anon = await h.makeUser("bm_anon");
    const target = await h.makeUser("bm_target");
    const other = await h.makeUser("bm_other");
    const [conv] = await db
      .insert(schema.conversation)
      .values({ kind: "group", name: "g", createdBy: other.id })
      .returning();
    const convId = conv?.id ?? "";
    await db.insert(schema.conversationMember).values([
      { conversationId: convId, userId: other.id, role: "owner" },
      { conversationId: convId, userId: anon.id, role: "member" },
      { conversationId: convId, userId: target.id, role: "member" },
    ]);
    await accountMerge.mergeAccounts(anon.id, target.id);
    const members = await db
      .select()
      .from(schema.conversationMember)
      .where(eq(schema.conversationMember.conversationId, convId));
    expect(members.filter((m) => m.userId === target.id)).toHaveLength(1);
    expect(members.some((m) => m.userId === anon.id)).toBe(false);
  });

  it("collapses a self-play game seat (both ids seated in one game -> single target seat)", async () => {
    const anon = await h.makeUser("sp_anon");
    const target = await h.makeUser("sp_target");
    const [g] = await db
      .insert(schema.game)
      .values({ gameType: "tic-tac-toe", status: "active" })
      .returning();
    const gameId = g?.id ?? "";
    h.trackGame(gameId);
    await db.insert(schema.gamePlayer).values([
      {
        gameId,
        userId: anon.id,
        username: anon.username,
        role: "X",
        seatOrder: 0,
      },
      {
        gameId,
        userId: target.id,
        username: target.username,
        role: "O",
        seatOrder: 1,
      },
    ]);
    await db.insert(schema.move).values({
      gameId,
      moveNumber: 1,
      playerId: anon.id,
      moveData: { row: 0, col: 0 },
    });
    await accountMerge.mergeAccounts(anon.id, target.id);
    const seats = await db
      .select()
      .from(schema.gamePlayer)
      .where(eq(schema.gamePlayer.gameId, gameId));
    expect(seats.filter((s) => s.userId === target.id)).toHaveLength(1);
    expect(seats.some((s) => s.userId === anon.id)).toBe(false);
    const moves = await db
      .select()
      .from(schema.move)
      .where(eq(schema.move.gameId, gameId));
    expect(moves.every((m) => m.playerId === target.id)).toBe(true);
  });

  it("re-points an anon-only game seat to the target", async () => {
    const anon = await h.makeUser("rp2_anon");
    const target = await h.makeUser("rp2_target");
    const [g] = await db
      .insert(schema.game)
      .values({ gameType: "tic-tac-toe", status: "active" })
      .returning();
    const gameId = g?.id ?? "";
    h.trackGame(gameId);
    await db.insert(schema.gamePlayer).values({
      gameId,
      userId: anon.id,
      username: anon.username,
      role: "X",
      seatOrder: 0,
    });
    await accountMerge.mergeAccounts(anon.id, target.id);
    const seats = await db
      .select()
      .from(schema.gamePlayer)
      .where(eq(schema.gamePlayer.gameId, gameId));
    expect(seats).toHaveLength(1);
    expect(seats[0]?.userId).toBe(target.id);
  });

  it("drops a notification whose actor equals recipient after re-point", async () => {
    const anon = await h.makeUser("nt_anon");
    const target = await h.makeUser("nt_target");
    await db.insert(schema.notification).values({
      userId: target.id,
      type: "friend_request",
      actorId: anon.id,
      payload: { requestId: "x" },
    });
    await accountMerge.mergeAccounts(anon.id, target.id);
    const rows = await db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, target.id),
          eq(schema.notification.actorId, target.id),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it("re-points game creator/challenger/winner text fields", async () => {
    const anon = await h.makeUser("gt_anon");
    const target = await h.makeUser("gt_target");
    const [g] = await db
      .insert(schema.game)
      .values({
        gameType: "tic-tac-toe",
        status: "completed",
        creatorUserId: anon.id,
        challengedUserId: anon.id,
        winner: anon.id,
      })
      .returning();
    const gameId = g?.id ?? "";
    h.trackGame(gameId);
    await accountMerge.mergeAccounts(anon.id, target.id);
    const [row] = await db
      .select()
      .from(schema.game)
      .where(eq(schema.game.id, gameId));
    expect(row?.creatorUserId).toBe(target.id);
    expect(row?.challengedUserId).toBe(target.id);
    expect(row?.winner).toBe(target.id);
  });
});
```

(Notes for the executor: the harness `cleanup` deletes tracked games by id and all `makeUser` ids by cascade, so games created via raw `schema.game` inserts must be passed to `h.trackGame(gameId)`; self-play games are deleted by `mergeAccounts`/cleanup either way. The `challengedUserId` FK is `onDelete: "set null"`, so a non-tracked game referencing a deleted user would not block cleanup, but tracking keeps the table tidy.)

- [ ] **Step 2: Run the integration suite (DB must be up)**

Run: `bun run db:start`
Then: `cd apps/server && bun run test:integration`
Expected: PASS - the `account merge` describe block runs (not skipped) and every case passes.

- [ ] **Step 3: Commit**

```bash
git add apps/server/integration/account-merge.test.ts
git commit -m "test(server): integration coverage for mergeAccounts conflict-row policy"
```

---

## Task 6: `onLinkAccount` records the pending merge

With `disableDeleteAnonymousUser: true` (set in Phase 0), `onLinkAccount` fires during the Google OAuth callback when the current session was anonymous, and the anon row is not auto-deleted. We only **record** the link here, using the server-verified ids from the hook - never a client-supplied anon id.

**Files:**
- Modify: `apps/server/src/auth.ts` (the `anonymous({...})` config block added in Phase 0)

- [ ] **Step 1: Add the import**

`apps/server/src/auth.ts:1` already imports named bindings from `@kyzen/database` (`import { db, schema } from "@kyzen/database";`). Add `accountMerge` to that **same** import statement (do NOT add a second `import ... from "@kyzen/database"` - Biome's `organizeImports` would merge them and `bun run check` would fail on the unorganized state). Change line 1 to:

```ts
import { accountMerge, db, schema } from "@kyzen/database";
```

- [ ] **Step 2: Wire `onLinkAccount` in the anonymous plugin config**

In `apps/server/src/auth.ts`, the Phase 0 plugin block reads:

```ts
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => generateGuestName(),
    }),
  ],
```

Change it to add the recorder:

```ts
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
```

(`log` is the `childLogger({ mod: "auth" })` already declared at `apps/server/src/auth.ts:8`. The `onLinkAccount` signature `{ anonymousUser: { user, session }, newUser: { user, session }, ctx }` is from `better-auth/dist/plugins/anonymous/types.d.mts`.)

- [ ] **Step 3: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/auth.ts
git commit -m "feat(server): record a pending account merge on anonymous onLinkAccount"
```

---

## Task 7: Merge endpoints - pending / confirm / discard (with ownership assertion)

Add three routes to the existing `accountRouter` (`apps/server/src/api/routes/account.ts`). The router currently has **no** `requireAuth` and resolves the session inline per-route (it mixes 401 and ok responses). For the merge endpoints we use the shared `requireAuth` middleware scoped to just those paths, then assert `session.userId === row.targetUserId` (403 otherwise) before touching data. The pending summary returns counts only - never raw messages, identities, or the anon temp email.

**Files:**
- Modify: `apps/server/src/api/routes/account.ts`
- Test: `apps/server/tests/account-merge-route.test.ts` (create)

- [ ] **Step 1: Write the failing route unit test**

Create `apps/server/tests/account-merge-route.test.ts` (mirrors `apps/server/tests/games-in-chat.test.ts` mocking; `tests/setup.ts` preload supplies env):

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test";

type MergeRow = {
  id: string;
  anonUserId: string;
  targetUserId: string;
  status: "pending" | "confirmed" | "discarded";
  createdAt: Date;
  resolvedAt: Date | null;
} | null;

let session: { user: { id: string } } | null = null;
let pendingRow: MergeRow = null;
let byId: MergeRow = null;
const mergeCalls: Array<{ anonId: string; targetId: string }> = [];
const discardCalls: string[] = [];
const resolvedCalls: Array<{ id: string; status: string }> = [];

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: { getSession: async () => session },
  }),
}));

mock.module("@kyzen/database", () => ({
  accountMerge: {
    getPendingForTarget: async () => pendingRow,
    getById: async () => byId,
    summarizeAnonAccount: async () => ({
      games: 12,
      conversations: 3,
      friends: 2,
      statLines: 1,
    }),
    mergeAccounts: async (anonId: string, targetId: string) => {
      mergeCalls.push({ anonId, targetId });
    },
    deleteAnonUserData: async (anonId: string) => {
      discardCalls.push(anonId);
    },
    markResolved: async (id: string, status: string) => {
      resolvedCalls.push({ id, status });
      return { ...(byId as NonNullable<MergeRow>), status };
    },
  },
  conversations: {},
  friends: {},
  games: {},
  messages: {},
  notifications: {},
  profiles: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

const { accountRouter } = await import("../src/api/routes/account");

function row(over: Partial<NonNullable<MergeRow>> = {}): NonNullable<MergeRow> {
  return {
    id: "merge-1",
    anonUserId: "anon-1",
    targetUserId: "target-1",
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    resolvedAt: null,
    ...over,
  };
}

beforeEach(() => {
  session = null;
  pendingRow = null;
  byId = null;
  mergeCalls.length = 0;
  discardCalls.length = 0;
  resolvedCalls.length = 0;
});

describe("GET /api/account/merge/pending", () => {
  it("401 when unauthenticated", async () => {
    const res = await accountRouter.request("/merge/pending");
    expect(res.status).toBe(401);
  });

  it("returns null when there is no pending merge", async () => {
    session = { user: { id: "target-1" } };
    pendingRow = null;
    const res = await accountRouter.request("/merge/pending");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: null });
  });

  it("returns the row plus a counts-only summary and the target email, never the anon temp email or raw data", async () => {
    session = { user: { id: "target-1" } };
    pendingRow = row();
    const res = await accountRouter.request("/merge/pending");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pending: {
        id: string;
        summary: {
          games: number;
          conversations: number;
          friends: number;
          statLines: number;
        };
      };
    };
    expect(body.pending.id).toBe("merge-1");
    expect(body.pending.summary).toEqual({
      games: 12,
      conversations: 3,
      friends: 2,
      statLines: 1,
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("anon-1");
    expect(raw).not.toContain("@");
    expect(raw).not.toContain("message");
  });
});

describe("POST /api/account/merge/:id/confirm", () => {
  it("403 when the caller is not the target user", async () => {
    session = { user: { id: "intruder" } };
    byId = row({ targetUserId: "target-1" });
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(mergeCalls).toHaveLength(0);
  });

  it("404 when the row does not exist", async () => {
    session = { user: { id: "target-1" } };
    byId = null;
    const res = await accountRouter.request("/merge/missing/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("409 when the row is already resolved (idempotent guard)", async () => {
    session = { user: { id: "target-1" } };
    byId = row({ status: "confirmed" });
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(409);
    expect(mergeCalls).toHaveLength(0);
  });

  it("merges then marks confirmed for the owning target", async () => {
    session = { user: { id: "target-1" } };
    byId = row();
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(mergeCalls).toEqual([{ anonId: "anon-1", targetId: "target-1" }]);
    expect(resolvedCalls).toEqual([{ id: "merge-1", status: "confirmed" }]);
  });
});

describe("POST /api/account/merge/:id/discard", () => {
  it("403 when the caller is not the target user", async () => {
    session = { user: { id: "intruder" } };
    byId = row();
    const res = await accountRouter.request("/merge/merge-1/discard", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(discardCalls).toHaveLength(0);
  });

  it("deletes anon data then marks discarded for the owning target", async () => {
    session = { user: { id: "target-1" } };
    byId = row();
    const res = await accountRouter.request("/merge/merge-1/discard", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(discardCalls).toEqual(["anon-1"]);
    expect(resolvedCalls).toEqual([{ id: "merge-1", status: "discarded" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test tests/account-merge-route.test.ts`
Expected: FAIL - the `/merge/*` routes do not exist yet (404s where 200/403/409 are expected).

- [ ] **Step 3: Type the router and add the merge imports**

The existing `accountRouter` is `new Hono()` with no env. The merge handlers need `c.get("userId")` / `c.get("user")` typed, so switch it to the `AuthEnv`-typed router and add the imports. In `apps/server/src/api/routes/account.ts`, replace the import header (lines 1-2) and the router declaration (line 4):

```ts
import { accountMerge } from "@kyzen/database";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import { type AuthEnv, requireAuth } from "../middleware/auth";

export const accountRouter = new Hono<AuthEnv>()
```

(The pre-existing `/sessions`, `/sign-out`, `/revoke-*` handlers keep their inline `getAuth().api.getSession(...)` checks unchanged; the typed env adds optional `Variables` and does not require them.)

- [ ] **Step 4: Append the merge routes to the chain**

The chain currently ends at the `.post("/revoke-session", …)` handler (line 53) with a trailing `;`. Change that `;` to keep the chain open and append the three merge routes. The per-route `requireAuth` middleware guards only these `/merge/*` paths:

```ts
  .get("/merge/pending", requireAuth, async (c) => {
    const userId = c.get("userId");
    const pending = await accountMerge.getPendingForTarget(userId);
    if (!pending) return c.json({ pending: null });
    const summary = await accountMerge.summarizeAnonAccount(pending.anonUserId);
    return c.json({
      pending: {
        id: pending.id,
        status: pending.status,
        createdAt: pending.createdAt,
        targetEmail: c.get("user").email ?? null,
        summary,
      },
    });
  })

  .post("/merge/:id/confirm", requireAuth, async (c) => {
    const userId = c.get("userId");
    const row = await accountMerge.getById(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.targetUserId !== userId)
      return c.json({ error: "Forbidden" }, 403);
    if (row.status !== "pending")
      return c.json({ error: "Already resolved" }, 409);
    await accountMerge.mergeAccounts(row.anonUserId, row.targetUserId);
    const resolved = await accountMerge.markResolved(row.id, "confirmed");
    return c.json({ ok: true, status: resolved?.status ?? "confirmed" });
  })

  .post("/merge/:id/discard", requireAuth, async (c) => {
    const userId = c.get("userId");
    const row = await accountMerge.getById(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.targetUserId !== userId)
      return c.json({ error: "Forbidden" }, 403);
    if (row.status !== "pending")
      return c.json({ error: "Already resolved" }, 409);
    await accountMerge.deleteAnonUserData(row.anonUserId);
    const resolved = await accountMerge.markResolved(row.id, "discarded");
    return c.json({ ok: true, status: resolved?.status ?? "discarded" });
  });
```

- [ ] **Step 5: Run the route test to verify it passes**

Run: `cd apps/server && bun test tests/account-merge-route.test.ts`
Expected: PASS (all cases: 401 / null / counts-only summary / 403 confirm / 404 / 409 / merge+confirm / 403 discard / discard+resolve).

- [ ] **Step 6: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/api/routes/account.ts apps/server/tests/account-merge-route.test.ts
git commit -m "feat(server): add merge pending/confirm/discard endpoints with ownership assertion"
```

---

## Task 8: Web client fetchers + merge-consent dialog

After sign-in the shell mounts a dialog that fetches the pending merge, shows counts + the target email, and offers Merge / Discard. It renders nothing for non-anonymous-flow users (i.e. when there is no pending row). It is gated by `isAnonymous` being **false** in this phase's sense: the merge prompt is for a real (just-signed-in) account that has a pending anon link, so it polls the `pending` endpoint whenever the user is **signed-in and not anonymous**. On success it `router.refresh()`. Uses framer-motion (already a dependency in `apps/web`) for the mount/unmount transition.

**Files:**
- Create: `apps/web/lib/account-merge.ts`
- Create: `apps/web/app/merge-consent.tsx`
- Modify: `apps/web/app/app-shell.tsx`
- Test: `apps/web/tests/merge-consent.test.tsx` (create)

- [ ] **Step 1: Create the client fetchers**

Create `apps/web/lib/account-merge.ts`:

```ts
"use client";

import { clientFetchJson } from "@/lib/api-client";

export type MergeSummary = {
  games: number;
  conversations: number;
  friends: number;
  statLines: number;
};

export type PendingMerge = {
  id: string;
  status: "pending" | "confirmed" | "discarded";
  createdAt: string;
  targetEmail: string | null;
  summary: MergeSummary;
};

export async function getPendingMerge(): Promise<PendingMerge | null> {
  const res = await clientFetchJson<{ pending: PendingMerge | null }>(
    "/api/account/merge/pending",
  );
  return res.pending;
}

export async function confirmMerge(id: string): Promise<void> {
  await clientFetchJson(`/api/account/merge/${id}/confirm`, { method: "POST" });
}

export async function discardMerge(id: string): Promise<void> {
  await clientFetchJson(`/api/account/merge/${id}/discard`, { method: "POST" });
}
```

- [ ] **Step 2: Write the failing dialog render test**

Create `apps/web/tests/merge-consent.test.tsx` (mirrors `apps/web/tests/game-skeletons.test.tsx` `renderToStaticMarkup` approach; mocks the fetcher module so no network):

```tsx
import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/account-merge", () => ({
  getPendingMerge: async () => null,
  confirmMerge: async () => {},
  discardMerge: async () => {},
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { MergeConsentDialog } from "@/app/merge-consent";
import type { PendingMerge } from "@/lib/account-merge";

const pending: PendingMerge = {
  id: "merge-1",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  targetEmail: "you@gmail.com",
  summary: { games: 12, conversations: 3, friends: 2, statLines: 1 },
};

describe("MergeConsentDialog", () => {
  it("renders counts and the target email when a merge is pending", () => {
    const html = renderToStaticMarkup(
      <MergeConsentDialog pending={pending} busy={false} />,
    );
    expect(html).toContain("12");
    expect(html).toContain("you@gmail.com");
    expect(html).toContain("Merge");
    expect(html).toContain("Discard");
  });

  it("renders nothing when there is no pending merge", () => {
    const html = renderToStaticMarkup(
      <MergeConsentDialog pending={null} busy={false} />,
    );
    expect(html).toBe("");
  });

  it("never leaks anon ids or raw chat data into the markup", () => {
    const html = renderToStaticMarkup(
      <MergeConsentDialog pending={pending} busy={false} />,
    );
    expect(html).not.toContain("anon");
    expect(html).not.toContain("message");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && bun test tests/merge-consent.test.tsx`
Expected: FAIL - module `@/app/merge-consent` does not exist.

- [ ] **Step 4: Implement the dialog (split into a pure presentational `MergeConsentDialog` + a `MergeConsent` controller)**

Create `apps/web/app/merge-consent.tsx`:

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FaArrowRightArrowLeft, FaTrash } from "react-icons/fa6";
import {
  confirmMerge,
  discardMerge,
  getPendingMerge,
  type PendingMerge,
} from "@/lib/account-merge";

export function MergeConsentDialog({
  pending,
  busy,
  onMerge,
  onDiscard,
}: {
  pending: PendingMerge | null;
  busy: boolean;
  onMerge?: () => void;
  onDiscard?: () => void;
}) {
  if (!pending) return null;
  const { games, conversations, friends, statLines } = pending.summary;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <p className="font-medium text-card-foreground text-sm">
        We found a guest session
      </p>
      <p className="mt-1 text-muted-foreground text-sm">
        {games} games, {conversations} chats, {friends} friends, {statLines}{" "}
        stat lines. Merge into {pending.targetEmail ?? "your account"}?
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onMerge}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-sm outline-none transition hover:opacity-90 disabled:opacity-50"
        >
          <FaArrowRightArrowLeft size={14} aria-hidden="true" />
          {busy ? "Merging…" : "Merge"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay disabled:opacity-50"
        >
          <FaTrash size={14} aria-hidden="true" />
          Discard
        </button>
      </div>
    </motion.div>
  );
}

export function MergeConsent({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingMerge | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setPending(null);
      return;
    }
    let active = true;
    getPendingMerge()
      .then((p) => {
        if (active) setPending(p);
      })
      .catch(() => {
        if (active) setPending(null);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const onMerge = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await confirmMerge(pending.id);
      setPending(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [pending, router]);

  const onDiscard = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await discardMerge(pending.id);
      setPending(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [pending, router]);

  return (
    <AnimatePresence>
      {pending ? (
        <MergeConsentDialog
          pending={pending}
          busy={busy}
          onMerge={onMerge}
          onDiscard={onDiscard}
        />
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && bun test tests/merge-consent.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Mount `MergeConsent` in the shell next to `GuestNudge`**

In `apps/web/app/app-shell.tsx`, add the import (next to the Phase 0 `GuestNudge` import):

```tsx
import { MergeConsent } from "@/app/merge-consent";
```

Phase 0 renders `<GuestNudge isAnonymous={isAnonymous} />` just inside `<SocketProvider enabled={signedIn}>`. Render the merge consent right after it - it polls for a pending merge only when the user is signed-in **and not** anonymous (a real account that just linked an anon session):

```tsx
        <SocketProvider enabled={signedIn}>
          <GuestNudge isAnonymous={isAnonymous} />
          <MergeConsent enabled={signedIn && !isAnonymous} />
```

(`signedIn` and `isAnonymous` are both already props on `AppShellClient` after Phase 0.)

- [ ] **Step 7: Verify type-check and the full web suite pass**

Run: `bun run type-check`
Expected: PASS.
Run: `cd apps/web && bun test tests`
Expected: PASS (existing suite + the new `merge-consent` file).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/account-merge.ts apps/web/app/merge-consent.tsx apps/web/app/app-shell.tsx apps/web/tests/merge-consent.test.tsx
git commit -m "feat(web): add merge-consent dialog shown after sign-in for a pending anon merge"
```

---

## Task 9: Sync docs

Per CLAUDE.md, the change is not done until docs reflect it. Update the database, realtime/server-api, and shared docs.

**Files:**
- Modify: `docs/architecture/database.md` (document the `account_merge` table + the merge/discard cleanup of FK-less `game_player`/`move` rows)
- Modify: `docs/architecture/server-api.md` (document `GET /api/account/merge/pending`, `POST /api/account/merge/:id/confirm`, `POST /api/account/merge/:id/discard`, including the ownership-403 and the counts-only summary)
- Modify: `docs/architecture/shared.md` (note `AccountMergeRow` / `AccountMergeStatus` + the `accountMerge` repository namespace)

- [ ] **Step 1: Add an `account_merge` section to `docs/architecture/database.md`**

Read the file, find the table-by-table section, and add a subsection describing the `account_merge` table (columns `id`, `anonUserId`, `targetUserId`, `status` (`pending|confirmed|discarded`), `createdAt`, `resolvedAt`; index `(targetUserId, status)`), the `accountMerge` repository (`recordPending`, `getPendingForTarget`, `getById`, `markResolved`, `summarizeAnonAccount`, `deleteAnonUserData`, `mergeAccounts`), and the note that `game_player.userId` / `move.playerId` have no FK so discard/merge clean them explicitly.

- [ ] **Step 2: Add the merge endpoints to `docs/architecture/server-api.md`**

Document the three `/api/account/merge/*` routes: `requireAuth`, the `session.userId === row.targetUserId` 403 ownership assert, the 404/409 idempotency guards, and that the pending summary is counts-only (no raw messages / identities / anon temp email).

- [ ] **Step 3: Note the new shared type in `docs/architecture/shared.md`**

Record `AccountMergeRow` + `AccountMergeStatus` (in `types/db`) and `accountMergeStatusSchema` / `recordAccountMergeInputSchema` (in `types/db/io`), plus the new `@kyzen/database` `accountMerge` namespace.

- [ ] **Step 4: Verify the doc gate passes**

Run: `bun run check`
Expected: PASS (Markdown is not linted by Biome, but this confirms no code regressions and that no em-dashes/comments slipped into edited code; the em-dash CI gate covers prose too - keep `-` not em-dashes in the docs).

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/database.md docs/architecture/server-api.md docs/architecture/shared.md
git commit -m "docs: document account_merge table, repository, and merge endpoints"
```

---

## Final verification

- [ ] **Run the whole gate**

Run: `bun run type-check`
Expected: PASS (drift-guard satisfied, routes/repository typed).
Run: `bun run check`
Expected: PASS (Biome format/lint/imports; no comments; no em-dashes).
Run: `bun run test`
Expected: PASS across workspaces, including the new unit suites: `account-merge-input` (packages/database), `account-merge-route` (apps/server), `merge-consent` (apps/web).

- [ ] **Run the integration suite (DB required)**

Run: `bun run db:start`
Run: `cd apps/server && bun run test:integration`
Expected: PASS - the `account merge` describe block is **not** skipped (DB up) and every conflict-row case passes.

- [ ] **Manual smoke (optional, needs `bun run db:start` + `bun run dev`)**

1. Open logged out, click "Continue as a guest" (Phase 0), play/accumulate something (a friend, a chat, a stat).
2. Sign in with Google (links the anon session). Confirm `onLinkAccount` wrote a `pending` row in `account_merge` (e.g. `bun run db:studio`).
3. On returning to the app you see the merge-consent dialog with counts + your Google email. Click **Merge**; confirm the anon `user`/`user_profile` rows are gone and your stats include the guest's.
4. Repeat with a fresh guest and click **Discard**; confirm the anon data is deleted and the row is `discarded`.
5. Confirm a second click on the same merge id is a no-op (already resolved → 409), and that calling confirm/discard as a different signed-in user 403s.

---

## Self-review notes (coverage against spec §5.2)

- `account_merge` table (id, anonUserId, targetUserId, status enum, createdAt, resolvedAt; index `(targetUserId, status)`) - Tasks 1 + 2.
- `AccountMergeRow` + drift-guard entry - Tasks 1 + 2.
- `accountMerge` repository (`recordPending`, `getPendingForTarget`, `getById`, `markResolved`, `summarizeAnonAccount`, `deleteAnonUserData`) - Task 3; `mergeAccounts` transaction - Task 4.
- Table-by-table merge policy: profile stats summation + delete anon profile (Task 4 / integration "sums profile stats"); game text fields re-point (integration "re-points game creator/challenger/winner"); `game_player` collapse + re-point (integration "collapses a self-play game seat" / "re-points an anon-only game seat"); `move.playerId` bulk re-point (same); friendship self-collapse + dedupe accepted>pending + pairKey recompute (integration "collapses a self-friendship" / "dedupes … keeping accepted over pending" / "re-points … recomputes pairKey"); conversation_member self-DM collapse + drop-when-already-member (integration "collapses a self-DM" / "drops anon membership when target already a member"); message senderId re-point (covered by the membership cases); notification re-point + actor==recipient drop (integration "drops a notification whose actor equals recipient") - Tasks 4 + 5.
- `onLinkAccount` records pending (server-verified ids, no client trust) - Task 6.
- `GET /merge/pending` (counts-only summary + target email, no raw data / temp email) - Task 7 (+ assertions in the route test and the dialog test).
- `POST /merge/:id/confirm` + `discard` with `session.userId === row.targetUserId` 403 ownership assert and idempotent 404/409 guards - Task 7.
- Merge-consent dialog (counts + email, Merge/Discard, refresh on success), mounted next to `GuestNudge` - Task 8.
- SECURITY/PRIVACY asserted in tests: 403 when caller != target (route test); summary leaks no anon id/email/raw chat (route + dialog tests); idempotent / rejects non-pending row (route test 409 + integration `markResolved` no-op); a user can only act on a merge whose `targetUserId` is theirs, and the link is only ever created by the server `onLinkAccount` (never a client-supplied anon id) - Tasks 6 + 7.
- Docs synced (database / server-api / shared) - Task 9.
- Out of this phase: matchmaking (Phase 2), invites (Phase 3).
