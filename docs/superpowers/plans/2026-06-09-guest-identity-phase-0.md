# Guest Identity (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone use the app without signing in, by giving guests a real *anonymous* Better Auth account that every existing code path treats identically to a logged-in user.

**Architecture:** Add Better Auth's `anonymous` plugin (server + client). A guest is a real `user` row with `isAnonymous = true`, provisioned with the same username + avatar pipeline as everyone else (but skipping the external genderize.io call). Logged-out visitors get a "Continue as a guest" entry on the auth page; anonymous users get a persistent "Sign in to save your games" nudge. No `isGuest` branching elsewhere — `getServerSession()` already returns a session for anon users, so the socket, chat, games, friends, and notifications all work unchanged.

**Tech Stack:** Better Auth 1.6.11 (`better-auth/plugins` `anonymous`, `better-auth/client/plugins` `anonymousClient`), Drizzle/Postgres, Next.js 16 App Router, Bun test (`mock.module`).

**Scope note:** This phase delivers the guest *capability* and the auth-page/nudge entry points. Wiring guest-mint into the game lobby's "Play" button and the `/play/[gameId]` page is deferred to the feature phases that give a guest somewhere to go (matchmaking = Phase 2, invites = Phase 3), where the snappy server-side mint lives. `onLinkAccount`/merge is Phase 1. This plan sets `disableDeleteAnonymousUser: true` now so Phase 1 can add the consent merge without changing the plugin config; until Phase 1, an anon user who signs in with Google is simply left as a separate orphaned anon row (no data loss, no merge).

**Prerequisite:** Postgres running. Run `bun run db:start` once before Task 1's `db:push`.

---

## File Structure

- `packages/database/src/schema.ts` — add `isAnonymous` column to the `user` table (modify).
- `packages/shared/src/types/db/index.ts` — add `isAnonymous` to `UserRow` (modify; keeps `drift-guard` green).
- `apps/server/src/username.ts` — add a `skipGenderDetection` option to `ensureUsernameForUser` (modify).
- `apps/server/src/guest-name.ts` — `generateGuestName()` (create).
- `apps/server/src/auth.ts` — register the `anonymous` plugin; pass `skipGenderDetection` for anon users in the create hook (modify).
- `apps/web/lib/auth-client.ts` — add `anonymousClient()` (modify).
- `apps/web/lib/auth/ensure-identity.ts` — `ensureIdentity()` client helper (create).
- `apps/web/app/auth/guest-button.tsx` — "Continue as a guest" button (create).
- `apps/web/app/auth/page.tsx` — render the guest button (modify).
- `apps/web/lib/get-server-session.ts` — add `isAnonymous` to the session user type (modify).
- `apps/web/app/layout.tsx` — pass `isAnonymous` to the shell (modify).
- `apps/web/app/app-shell.tsx` — accept `isAnonymous`, render the nudge (modify).
- `apps/web/app/guest-nudge.tsx` — "Sign in to save" nudge (create).
- Tests: `apps/server/tests/ensure-username.test.ts`, `apps/server/tests/guest-name.test.ts`, `apps/web/tests/ensure-identity.test.ts`, `apps/web/tests/guest-nudge.test.tsx` (create).

---

## Task 1: Add `isAnonymous` to the `user` schema and `UserRow`

The `drift-guard` (`packages/database/src/drift-guard.ts`) asserts `Equal<typeof user.$inferSelect, UserRow>` at compile time, so the column and the row type must move together. We use that guard as the test.

**Files:**
- Modify: `packages/shared/src/types/db/index.ts:39-47`
- Modify: `packages/database/src/schema.ts:42-56`

- [ ] **Step 1: Add the field to `UserRow` only (this should break type-check)**

In `packages/shared/src/types/db/index.ts`, change the `UserRow` type:

```ts
export type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  isAnonymous: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

- [ ] **Step 2: Run type-check to verify the drift-guard fails**

Run: `bun run type-check`
Expected: FAIL in `packages/database` — `drift-guard.ts` reports `typeof user.$inferSelect` is not assignable to `UserRow` (missing `isAnonymous`).

- [ ] **Step 3: Add the column to the `user` table**

In `packages/database/src/schema.ts`, add `isAnonymous` to the `user` table (the `boolean` import already exists at line 26):

```ts
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});
```

- [ ] **Step 4: Run type-check to verify it passes**

Run: `bun run type-check`
Expected: PASS (drift-guard satisfied).

- [ ] **Step 5: Generate the migration and push to the dev DB**

Run: `bun run db:generate` (creates a migration adding the `is_anonymous` column under `packages/database/src/drizzle/`)
Run: `bun run db:push`
Expected: both succeed; `db:push` reports the `user.is_anonymous` column added.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/db/index.ts packages/database/src/schema.ts packages/database/src/drizzle
git commit -m "feat(db): add isAnonymous flag to user for guest accounts"
```

---

## Task 2: `ensureUsernameForUser` can skip gender detection

`predictAvatarStyle` calls the external genderize.io API. For guests (auto-named "Guest-xxxx") that call is wasteful and meaningless, so guest provisioning must skip it. `AvatarStyle` is exported from `@gamelobby/avatar`.

**Files:**
- Modify: `apps/server/src/username.ts:43-52`
- Test: `apps/server/tests/ensure-username.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/ensure-username.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";

const createdProfiles: Array<{ userId: string; username: string }> = [];
let genderDetectionCalls = 0;

mock.module("@gamelobby/database", () => ({
  profiles: {
    getProfileByUserId: async () => null,
    getTakenUsernames: async () => new Set<string>(),
    createProfile: async (input: { userId: string; username: string }) => {
      createdProfiles.push({ userId: input.userId, username: input.username });
      return { username: input.username };
    },
  },
}));

mock.module("../src/services/gender-detection", () => ({
  predictAvatarStyle: async () => {
    genderDetectionCalls += 1;
    return "any";
  },
}));

import { ensureUsernameForUser } from "../src/username";

describe("ensureUsernameForUser", () => {
  it("skips gender detection when asked (guest provisioning)", async () => {
    genderDetectionCalls = 0;
    createdProfiles.length = 0;

    const username = await ensureUsernameForUser("guest-1", "Guest-abc123", {
      skipGenderDetection: true,
    });

    expect(genderDetectionCalls).toBe(0);
    expect(createdProfiles).toHaveLength(1);
    expect(createdProfiles[0]?.userId).toBe("guest-1");
    expect(typeof username).toBe("string");
  });

  it("uses gender detection by default", async () => {
    genderDetectionCalls = 0;
    createdProfiles.length = 0;

    await ensureUsernameForUser("user-1", "Alice Smith");

    expect(genderDetectionCalls).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test tests/ensure-username.test.ts`
Expected: FAIL — `ensureUsernameForUser` does not accept a third argument / still calls `predictAvatarStyle` when `skipGenderDetection` is set.

- [ ] **Step 3: Implement the option**

In `apps/server/src/username.ts`, add the import and modify the signature + the style line:

```ts
import type { AvatarStyle } from "@gamelobby/avatar";
```

```ts
export async function ensureUsernameForUser(
  userId: string,
  displayName: string | null | undefined,
  opts?: { skipGenderDetection?: boolean },
): Promise<string> {
  const existing = await profiles.getProfileByUserId(userId);
  if (existing) return existing.username;

  const style: AvatarStyle = opts?.skipGenderDetection
    ? "any"
    : await predictAvatarStyle(displayName);
  const avatar = randomAvatarConfig(userId, style);
```

(Leave the rest of the function unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/server && bun test tests/ensure-username.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/username.ts apps/server/tests/ensure-username.test.ts
git commit -m "feat(server): skip gender detection when provisioning guest profiles"
```

---

## Task 3: Guest name helper + register the anonymous plugin

**Files:**
- Create: `apps/server/src/guest-name.ts`
- Test: `apps/server/tests/guest-name.test.ts` (create)
- Modify: `apps/server/src/auth.ts`

- [ ] **Step 1: Write the failing test for `generateGuestName`**

Create `apps/server/tests/guest-name.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { generateGuestName } from "../src/guest-name";

describe("generateGuestName", () => {
  it("produces a 'Guest-xxxx' name", () => {
    const name = generateGuestName();
    expect(name).toMatch(/^Guest-[a-z0-9]{4,8}$/);
  });

  it("varies between calls", () => {
    const a = generateGuestName();
    const b = generateGuestName();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/server && bun test tests/guest-name.test.ts`
Expected: FAIL — module `../src/guest-name` does not exist.

- [ ] **Step 3: Implement `generateGuestName`**

Create `apps/server/src/guest-name.ts`:

```ts
import { randomUsernameSuffix } from "./username-rules";

export function generateGuestName(): string {
  return `Guest-${randomUsernameSuffix()}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/server && bun test tests/guest-name.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the anonymous plugin and pass the skip flag in the create hook**

In `apps/server/src/auth.ts`, add imports:

```ts
import { anonymous } from "better-auth/plugins";
import { generateGuestName } from "./guest-name";
```

Add a `plugins` array to the `betterAuth({...})` config (place it right after the `database:` line):

```ts
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => generateGuestName(),
    }),
  ],
```

Change the create hook body so anon users skip gender detection:

```ts
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
```

- [ ] **Step 6: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/guest-name.ts apps/server/tests/guest-name.test.ts apps/server/src/auth.ts
git commit -m "feat(server): register Better Auth anonymous plugin for guest accounts"
```

---

## Task 4: Web client — `anonymousClient` plugin + `ensureIdentity()`

**Files:**
- Modify: `apps/web/lib/auth-client.ts`
- Create: `apps/web/lib/auth/ensure-identity.ts`
- Test: `apps/web/tests/ensure-identity.test.ts` (create)

- [ ] **Step 1: Add the client plugin**

In `apps/web/lib/auth-client.ts`:

```ts
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  plugins: [anonymousClient()],
});
```

- [ ] **Step 2: Write the failing test for `ensureIdentity`**

Create `apps/web/tests/ensure-identity.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";

let session: { session: unknown } | null = null;
let anonCalls = 0;

mock.module("@/lib/auth-client", () => ({
  authClient: {
    getSession: async () => ({ data: session }),
    signIn: {
      anonymous: async () => {
        anonCalls += 1;
        session = { session: { id: "anon-session" } };
        return { data: session };
      },
    },
  },
}));

import { ensureIdentity } from "@/lib/auth/ensure-identity";

describe("ensureIdentity", () => {
  it("mints an anonymous session when there is none", async () => {
    session = null;
    anonCalls = 0;
    await ensureIdentity();
    expect(anonCalls).toBe(1);
  });

  it("does nothing when a session already exists", async () => {
    session = { session: { id: "existing" } };
    anonCalls = 0;
    await ensureIdentity();
    expect(anonCalls).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && bun test tests/ensure-identity.test.ts`
Expected: FAIL — module `@/lib/auth/ensure-identity` does not exist.

- [ ] **Step 4: Implement `ensureIdentity`**

Create `apps/web/lib/auth/ensure-identity.ts`:

```ts
import { authClient } from "@/lib/auth-client";

export async function ensureIdentity(): Promise<void> {
  const { data } = await authClient.getSession();
  if (!data?.session) {
    await authClient.signIn.anonymous();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && bun test tests/ensure-identity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/auth-client.ts apps/web/lib/auth/ensure-identity.ts apps/web/tests/ensure-identity.test.ts
git commit -m "feat(web): add anonymousClient plugin and ensureIdentity helper"
```

---

## Task 5: "Continue as a guest" button on the auth page

The auth page already redirects any session (including anonymous) to `/profile`, so this button only renders for truly logged-out visitors.

**Files:**
- Create: `apps/web/app/auth/guest-button.tsx`
- Modify: `apps/web/app/auth/page.tsx`

- [ ] **Step 1: Create the button component**

Create `apps/web/app/auth/guest-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FaUser } from "react-icons/fa6";
import { ensureIdentity } from "@/lib/auth/ensure-identity";

export function GuestButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueAsGuest = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await ensureIdentity();
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start a guest session");
      setBusy(false);
    }
  }, [router]);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={continueAsGuest}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
      >
        <FaUser size={16} className="shrink-0" aria-hidden="true" />
        {busy ? "Starting…" : "Continue as a guest"}
      </button>
      {error ? (
        <p className="mt-4 text-center text-danger text-xs">{error}</p>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Render it on the auth page**

In `apps/web/app/auth/page.tsx`, add the import:

```tsx
import { GuestButton } from "@/app/auth/guest-button";
```

Render `<GuestButton />` immediately after `<GoogleSignInButton googleOAuthReady={googleOAuthReady} />` (line 40):

```tsx
          <GoogleSignInButton googleOAuthReady={googleOAuthReady} />

          <GuestButton />
```

- [ ] **Step 3: Verify type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/auth/guest-button.tsx apps/web/app/auth/page.tsx
git commit -m "feat(web): add 'Continue as a guest' option to the auth page"
```

---

## Task 6: Surface `isAnonymous` in the session and show a "Sign in to save" nudge

**Files:**
- Modify: `apps/web/lib/get-server-session.ts:4-9`
- Modify: `apps/web/app/layout.tsx` (pass the flag)
- Modify: `apps/web/app/app-shell.tsx` (accept the prop + render nudge)
- Create: `apps/web/app/guest-nudge.tsx`
- Test: `apps/web/tests/guest-nudge.test.tsx` (create)

- [ ] **Step 1: Add `isAnonymous` to the session user type**

In `apps/web/lib/get-server-session.ts`:

```ts
type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  isAnonymous?: boolean | null;
};
```

- [ ] **Step 2: Write the failing test for the nudge**

Create `apps/web/tests/guest-nudge.test.tsx` (mirrors the rendering approach in `apps/web/tests/game-skeletons.test.tsx`):

```tsx
import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/auth-client", () => ({
  authClient: { signIn: { social: async () => ({}) } },
}));

import { GuestNudge } from "@/app/guest-nudge";

describe("GuestNudge", () => {
  it("renders a sign-in prompt for anonymous users", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={true} />);
    expect(html).toContain("Sign in to save");
  });

  it("renders nothing for non-anonymous users", () => {
    const html = renderToStaticMarkup(<GuestNudge isAnonymous={false} />);
    expect(html).toBe("");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && bun test tests/guest-nudge.test.tsx`
Expected: FAIL — module `@/app/guest-nudge` does not exist.

- [ ] **Step 4: Implement the nudge**

Create `apps/web/app/guest-nudge.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { FaGoogle } from "react-icons/fa6";
import { authClient } from "@/lib/auth-client";

export function GuestNudge({ isAnonymous }: { isAnonymous: boolean }) {
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/profile`,
      });
    } catch {
      setBusy(false);
    }
  }, []);

  if (!isAnonymous) return null;

  return (
    <div className="fixed right-4 bottom-4 z-40 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
      <p className="text-card-foreground text-sm">
        Sign in to save your games
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={signIn}
        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs outline-none transition hover:opacity-90 disabled:opacity-50"
      >
        <FaGoogle size={14} aria-hidden="true" />
        {busy ? "Redirecting…" : "Sign in"}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && bun test tests/guest-nudge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Thread the flag from the layout into the shell**

In `apps/web/app/layout.tsx`, add a derived value right after `const signedIn = Boolean(session?.user);` (line 63):

```tsx
  const isAnonymous = Boolean(session?.user?.isAnonymous);
```

Pass it to `<AppShellClient ...>` (alongside the existing `signedIn={signedIn}` prop near line 166):

```tsx
          isAnonymous={isAnonymous}
```

- [ ] **Step 7: Accept the prop and render the nudge in the shell**

In `apps/web/app/app-shell.tsx`, add the import:

```tsx
import { GuestNudge } from "@/app/guest-nudge";
```

Add `isAnonymous` to the component's props type (after `signedIn: boolean;` at line 41):

```tsx
  isAnonymous: boolean;
```

Add it to the destructured params (after `signedIn,` at line 26):

```tsx
  isAnonymous,
```

Render `<GuestNudge isAnonymous={isAnonymous} />` just inside the `<SocketProvider>` (right after the opening tag at line 61, before the `{signedIn && userId ? ...}` block):

```tsx
        <SocketProvider enabled={signedIn}>
          <GuestNudge isAnonymous={isAnonymous} />
```

- [ ] **Step 8: Verify type-check and the full web suite pass**

Run: `bun run type-check`
Expected: PASS.
Run: `cd apps/web && bun test tests`
Expected: PASS (existing suite + the 2 new test files).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/get-server-session.ts apps/web/app/layout.tsx apps/web/app/app-shell.tsx apps/web/app/guest-nudge.tsx apps/web/tests/guest-nudge.test.tsx
git commit -m "feat(web): show 'sign in to save' nudge to anonymous users"
```

---

## Final verification

- [ ] **Run the whole gate**

Run: `bun run type-check`
Expected: PASS.
Run: `bun run check`
Expected: PASS (Biome format/lint/imports).
Run: `bun run test`
Expected: PASS across workspaces (new tests: `ensure-username`, `guest-name`, `ensure-identity`, `guest-nudge`).

- [ ] **Manual smoke (optional, needs `bun run db:start` + `bun run dev`)**

1. Open the app logged out → go to `/auth` → click "Continue as a guest".
2. Confirm you land on `/` as a real user (a username + avatar appear) and the "Sign in to save your games" nudge is visible.
3. Confirm a `user` row exists with `is_anonymous = true` and a matching `user_profile` row (e.g. via `bun run db:studio`).
4. Refresh → you remain the same guest (session cookie persists).

---

## Self-review notes (coverage against spec §5.1)

- Anon = real account via `anonymous()` plugin — Task 3. ✅
- `isAnonymous` schema + `UserRow` — Task 1. ✅
- Auto username/avatar via existing hook, skipping the external genderize call — Tasks 2–3. ✅
- `ensureIdentity()` lazy-mint helper (reused by Phases 2–3) — Task 4. ✅
- Guest entry point — Task 5 (auth page). Lobby/play entry deferred to Phases 2/3 per scope note. ✅
- "Sign in to save" nudge keyed on `isAnonymous` — Task 6. ✅
- `disableDeleteAnonymousUser: true` set now so Phase 1 adds `onLinkAccount` without reconfiguring — Task 3. ✅
- Out of this phase: merge (`onLinkAccount`, `account_merge`), matchmaking, invites.
