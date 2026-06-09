# Matchmaking, Guest Play & Invite Links - Design Spec

Date: 2026-06-09
Branch: `worktree-matchmaking-guests-invites` (off `origin/main` @ `7712e85`)
Status: Draft for review

## 1. Summary

Today a game can only exist inside a conversation between two known, logged-in friends. This spec adds three capabilities while keeping the existing game/chat machinery intact:

1. **Guest play** - anyone can play without signing in. A guest is a *real but anonymous user account* (Better Auth `anonymous` plugin), so every existing code path treats them identically to a logged-in user. No `isGuest` branching scattered through the app.
2. **Anon to real-account merge** - when a guest later signs in with Google, a consent nudge offers to migrate their games, chats, friends, and stats onto the real account.
3. **Matchmaking** - clicking "Find a match" puts a player in a per-game queue; the server pairs two waiting players and spins up the *same* conversation + game a friend-challenge produces.
4. **Invite links** - a player shares a link; opening it (as a guest if needed) drops the opener straight into a playable game with the inviter, with an "Add as friend" prompt layered on top.

The guiding constraint, set by the product owner: **make it work exactly the same as for logged-in people, and keep it as simple as possible.** We reuse `getOrCreateDm` + `createGameInConversation` rather than building a parallel "standalone game" path. The only genuinely new server logic is the merge migration, the matchmaking queue, and invite tokens.

## 2. Locked decisions (from brainstorming)

- **Matchmaking strategy:** FIFO by `gameType` (no MMR/skill rating in v1). Pure FIFO is what satisfies "efficient at scale"; match *quality* (MMR) is explicitly deferred and can be layered on without a rewrite.
- **Guest scope:** full citizen. A guest can do anything a logged-in user can - matchmake, play invites, chat, be friended, accumulate stats - because they are a real `user` row.
- **Merge model:** consent-gated nudge. `disableDeleteAnonymousUser: true`; `onLinkAccount` records the link; the actual migration runs only after the user confirms.
- **Guest creation timing:** lazy. Mint the anon account on the first *action* (Play / Find match / open invite), never on a passive page load - avoids junk rows from crawlers.
- **Guest naming:** fully automatic. Reuse the existing username + avatar provisioning; no name-entry form. Editable later via the normal profile page.
- **Invite link behavior:** opens straight into a playable game with the inviter; "Add as friend" is a prompt on top, not the link's sole purpose.
- **Perceived latency:** mask account creation behind the real game board *skeleton* (`getGameSkeleton(gameType)`), so the first frame is game chrome, not a spinner; crossfade to the live board once seated.

## 3. Out of scope (v1)

- Skill-based matchmaking / MMR / ELO / leaderboards.
- Ephemeral or game-scoped chat distinct from conversations (matched players reuse the normal DM + chat).
- Guest-to-guest account merge across devices (we can only merge the anon session active in the same browser at sign-in time).
- Spectator-specific flows beyond what already exists.
- Tournaments / series changes.

## 4. Background - current architecture (verified against code)

- **Game creation is conversation-anchored.** `createGameInConversation(input: { userId, conversationId, gameType, seatingMode?, challengedUserId?, config? })` in `apps/server/src/chat/games-in-chat-service.ts` validates conversation membership, blocks duplicate live games, seats the creator, and announces a `game_card`. It is a plain service function (callable from HTTP, not only the socket).
- **`game.conversationId` is already nullable** (`packages/database/src/schema.ts:111`, `onDelete: "set null"`). `creatorUserId` is nullable text with no FK; `challengedUserId` FKs `user.id`.
- **Identity is one `userId: string`.** Socket auth (`apps/server/src/realtime/index.ts` `io.use()`) hard-rejects any connection without a Better Auth session. The anonymous plugin gives guests a real session, so this gate is unchanged.
- **`game_player.userId` / `move.playerId` are `NOT NULL` text with no FK.** Social tables (`friendship`, `conversation_member`, `message`, `notification`, `user_profile`) FK to `user.id` with cascade - all work for anon users because anon users are real `user` rows.
- **Scale infra exists:** Redis is wired (`realtime/redis.ts` `attachRedisAdapter`), `RedisPresenceStore.onlineAmong()`, per-user rooms + `emitToUser` (`realtime/rooms.ts`), and a persistent notification pipeline (`realtime/notify.ts` + `notification_new`).
- **Skeletons exist:** `getGameSkeleton(gameType)` / `SKELETON_REGISTRY` / `DefaultGameSkeleton` exported from `@gamelobby/games-client`.
- **`NotificationType`** = `friend_request | friend_accepted | game_started | game_challenge` (`packages/shared/src/types/chat/dto.ts`).
- **Better Auth** resolves to **1.6.11**; `better-auth/plugins/anonymous` and `better-auth/client/plugins`' `anonymousClient` are present. Schema is managed by hand in Drizzle (`schema.ts`) with a `drift-guard`; we do NOT run `npx auth generate`.

## 5. Architecture

### 5.1 Guest identity (anonymous plugin)

**Server** (`apps/server/src/auth.ts`): add the plugin.

```ts
anonymous({
  disableDeleteAnonymousUser: true,
  generateName: () => generateGuestDisplayName(),
  onLinkAccount: async ({ anonymousUser, newUser, ctx }) => {
    await accountMerge.recordPending(anonymousUser.user.id, newUser.user.id);
  },
})
```

- `signIn.anonymous()` creates a real `user` row (`isAnonymous: true`), a throwaway email (`temp@<id>.com`), and a session cookie.
- The existing `databaseHooks.user.create.after` → `ensureUsernameForUser(userId, displayName)` fires for anon users too, provisioning a username + DiceBear avatar automatically. **Integration check:** confirm `ensureUsernameForUser` tolerates an anon user with no Google image (it already generates a random avatar via `@gamelobby/avatar`, so this should hold; verify during implementation).

**Web client** (`apps/web/lib/auth-client.ts`): add `anonymousClient()`.

**Lazy mint helper** (`apps/web/lib/auth/ensure-identity.ts`): `ensureIdentity()` - if `getServerSession()`/client session is absent, call `authClient.signIn.anonymous()` and wait for the session. Called by every entry point that today does `router.push("/auth")`:
- `apps/web/app/games/_shared/game-lobby.tsx` - "Play" / "Find a match".
- The invite accept flow (§5.4).
- `apps/web/app/play/[gameId]/page.tsx` - instead of SSR-redirecting to `/auth` when there is no session, render a "Play as guest / Sign in" choice (or mint on the client). Direct navigation to a play URL by a logged-out user should not bounce them to auth.

**"Signed in" semantics:** `getServerSession()` returns a session for anon users, so `SocketProvider enabled={signedIn}` (`apps/web/lib/socket/socket-context.tsx`) already connects for guests. UI that distinguishes "real vs anonymous" reads `session.user.isAnonymous` and shows a persistent, unobtrusive nudge: *"Playing as <name> · Sign in to save your games."*

**Schema change:** add to the `user` table in `packages/database/src/schema.ts`:

```ts
isAnonymous: boolean("is_anonymous").notNull().default(false),
```

Add `isAnonymous: boolean` to `UserRow` in `packages/shared/src/types/db/index.ts` (keeps `drift-guard` green). Apply with `db:push` (dev DB is push-managed).

### 5.2 Anon to real-account merge

**Trigger (server-verified).** With `disableDeleteAnonymousUser: true`, `onLinkAccount` fires during the Google OAuth callback when the current session was anonymous, and the anon row is *not* auto-deleted. In the hook we only **record the link** - never trust a client-supplied anon id (otherwise anyone could claim another guest's history).

**New table** `account_merge` (`packages/database/src/schema.ts`):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `anonUserId` | text | the anonymous `user.id` |
| `targetUserId` | text | the real `user.id` that signed in |
| `status` | text enum | `pending | confirmed | discarded` |
| `createdAt` | timestamp | |
| `resolvedAt` | timestamp | nullable |

Index on `(targetUserId, status)`.

**Flow:**
1. `onLinkAccount` → `accountMerge.recordPending(anonUserId, targetUserId)`.
2. After sign-in, the web app calls `GET /api/account/merge/pending` (auth as target). If a pending row exists, it fetches a **summary** of the anon account (game count, conversation count, friend count, stats) and shows the nudge: *"We found a guest session - 12 games, 3 chats, 2 friends. Merge into you@gmail.com?"* `[Merge] [Discard]`.
3. `[Merge]` → `POST /api/account/merge/:id/confirm` (auth as target; asserts `session.userId === row.targetUserId`) → runs the migration transaction, deletes the anon user, marks `confirmed`.
4. `[Discard]` → `POST /api/account/merge/:id/discard` → deletes the anon user + data directly via the DB layer (Better Auth's `/delete-anonymous-user` is disabled by our flag), marks `discarded`.

**Migration transaction** - `mergeAccounts(anonId, targetId)` in a new `packages/database/src/repositories/account-merge.ts` (all DB actions live in `@gamelobby/database`). Reassign everything keyed on `anonId` → `targetId`, resolving unique-constraint collisions and **collapsing self-references** (the invite flow can make a user friends-with / in-a-DM-with / having-played their own anon self):

| Data | Policy |
|---|---|
| `user_profile` | Keep target's username/avatar/appearance; **sum `stats`** per gameType; delete anon profile |
| `game.creatorUserId`, `game.challengedUserId`, `game.winner` | Re-point text fields anon→target |
| `game_player` (uniq `gameId,userId`) | Re-point; if target already seated in that game (same game had both ids - a self-play), keep one seat and mark/skip the dangling row |
| `move.playerId` | Bulk re-point (no constraint) |
| `friendship` (uniq `pairKey`) | If the other side == target → **delete** (self-friendship); if a `(target,other)` edge already exists → keep the better status (accepted > pending), delete anon's; else re-point and **recompute `pairKey`** |
| `conversation_member` (uniq `convId,userId`) | If it's a DM between anon and target → **delete the membership** (self-DM); if target already a member → drop anon's (merge unread); else re-point |
| `message.senderId` | Bulk re-point (orphaned self-DM messages follow their conversation's fate) |
| `notification` (`userId`, `actorId`) | Re-point both; drop notifications whose actor==recipient after re-point |

The merge is one-time per user and runs inline in a single DB transaction.

### 5.3 Matchmaking (FIFO queue)

**Queue store** - `apps/server/src/realtime/matchmaking-store.ts`, backed by Redis (`getRedis()`), one sorted set per game type: key `mm:queue:<gameType>`, member `userId`, score `enqueuedAt` (server `Date.now()`). An **atomic Lua `pairAndPop`** pops the two oldest members in a single round-trip so two server nodes can't double-match (the redis-adapter already makes the cluster cross-node). An in-memory fallback store mirrors `presence-store-instance.ts` for local/dev (no Redis).

**Socket events** (registered in `apps/server/src/realtime/index.ts`, handlers in `apps/server/src/realtime/matchmaking.ts`):
- `game:queue_join { gameType, config? }` → enqueue (idempotent; a user can be in at most one queue per gameType), then attempt `pairAndPop`.
- `game:queue_leave { gameType }` → remove from queue.
- On disconnect (`presence` disconnect path) → remove the socket's user from all queues.
- Server emits `match_found { gameId }` to **both** players via `emitToUser`.

**Pairing** (on each successful `pairAndPop` of `[a, b]`):
1. Liveness guard: confirm both are still online via `presenceStore.onlineAmong([a, b])`. If one dropped, requeue the survivor and abort.
2. `getOrCreateDm(a, b)` → `conversationId`.
3. `createGameInConversation({ userId: a, conversationId, gameType, seatingMode: "challenge", challengedUserId: b, config })`.
4. `emitToUser(a, "match_found", { gameId })` and same for `b`.
5. Both clients navigate to `/play/<gameId>`; their boards `join_room` → seated → status flips to `active`. This is exactly the existing friend-challenge path, initiated by the server instead of a user.

**Web** (`apps/web/app/games/_shared/game-lobby.tsx` + a `matchmakingAtom` in `apps/web/lib/`): a "Find a match" button → `ensureIdentity()` → emit `queue_join` → show a "Searching…" state with a cancel button (`queue_leave`). A `match_found` listener navigates to the play route. Anon users queue exactly like logged-in users.

### 5.4 Invite links

**Token** - DB-backed for queryable expiry/revocation. New table `game_invite` (`packages/database/src/schema.ts`):

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `token` | text unique | secure random (NOT the 6-char game code) |
| `inviterUserId` | text | FK `user.id`, cascade |
| `gameType` | text | |
| `config` | jsonb | nullable |
| `seatingMode` | text enum | nullable |
| `expiresAt` | timestamp | default now + 24h |
| `createdAt` | timestamp | |

v1 links are **reusable until expiry** - each acceptance spins up a fresh game between the inviter and the accepter. (Single-use is a trivial later tweak: add `redeemedAt` and reject if set.)

**Inviter side** - a "Invite a friend (link)" action in the lobby → `POST /api/invite` (auth) → `{ token, url }` to copy/share.

**Accept side - the snappy flow.** New top-level web route `apps/web/app/invite/[token]/page.tsx` (client component):
1. **First frame:** render `getGameSkeleton(gameType)` + a banner ("Joining <inviter>'s game…") using data from a fast public peek: `GET /api/invite/:token` (no auth) → `{ gameType, inviter: { username, avatar }, expired }`. gameType is enough to paint the right board skeleton; no account needed yet.
2. **Underneath:** `POST /api/invite/:token/accept` (public route, no `requireAuth`):
   - Resolve token; reject if expired.
   - If no session → mint anon via the Better Auth server API; the `Set-Cookie` rides back on this response (route handler, so cookie-setting is allowed).
   - If the accepter is the inviter (opened own link) → no-op game creation; return a benign redirect to the lobby.
   - `getOrCreateDm(inviter, accepter)` → `createGameInConversation({ userId: inviter, conversationId, gameType, seatingMode: "challenge", challengedUserId: accepter, config })`.
   - `notify(inviterUserId, "game_invite", { actorId: accepterId, payload: { gameId } })` so the inviter learns someone joined.
   - Return `{ gameId, inviter: { username, avatar } }`.
3. **Reveal:** the page now has a session cookie + `gameId`; it mounts the live board (or navigates to `/play/<gameId>`), socket connects, `join_room` seats the accepter → `game_state`. Crossfade skeleton → board with framer-motion.
4. **On top:** a non-blocking popup *"<inviter> invited you · [Add as friend]"*. The button fires the **existing** friend-request flow (`friends` socket event / `friends-service.sendFriendRequest`). Social stays explicit - accept does not auto-friend.

Add `game_invite` to `NotificationType` (`packages/shared/src/types/chat/dto.ts`) + its Zod schema (`packages/shared/src/types/chat/schemas.ts`) + `notificationTypeSchema` (`packages/shared/src/types/db/io.ts`).

`match_found` is a transient socket event, not a persisted notification.

## 6. Reserved usernames / route collisions

`invite` becomes a new top-level segment under `apps/web/app/`. Per CLAUDE.md, add `invite` to `RESERVED_USERNAMES` in `packages/shared/src/constants/username.ts` so no user can claim a name that shadows the route. The set currently holds `api, auth, account, chat, friends, games, play, profile, settings, ui` - `invite` is the only addition needed (`/api/account/...` lives under the already-reserved `api`/`account`).

## 7. Data model changes (summary)

- `user`: add `isAnonymous boolean not null default false` (+ `UserRow` in shared).
- New table `account_merge`.
- New table `game_invite`.
- No change required to `game` (conversationId already nullable), `game_player`, `move`, `friendship`, `conversation*`, `message`, `notification`.
- Apply via `db:push` (dev). Generate a migration for prod parity (`db:generate`).

## 8. Scale & failure considerations

- **Matchmaking is O(1) per join** via the Redis sorted set + atomic Lua `pairAndPop`; cross-node-safe through the existing redis-adapter. Do **not** build it on per-user audience scans (the presence `audienceFor()` fan-out the audit flagged).
- **Liveness on pair:** verify both players are still connected before creating the game; requeue the survivor otherwise.
- **Anon-account accumulation** is the main new scale cost. Mitigations: lazy mint (no rows for passive visitors); a periodic GC job deleting `isAnonymous` users idle > N days (propose 30) with their data. **Caveat:** `game_player.userId` / `move.playerId` have no FK, so GC must explicitly clean those rows (or we add FKs with `ON DELETE CASCADE` - schema is flexible per the owner). Decide during the matchmaking/guest phase; ship with explicit cleanup queries if FKs are deferred.
- **Merge** runs inline in a transaction; one-time per user, acceptable. If a user has an unusually large history, it can be moved to a background job later.
- `finalize()`/`bumpStats()` is unchanged - anon users are real users and accrue stats normally (which then merge).

## 9. Testing strategy

- **Guest identity:** anon sign-in provisions a profile; socket connects for an anon session; entry points mint instead of redirecting.
- **Merge:** `mergeAccounts` unit tests covering every conflict row in §5.2, especially the self-reference collapse (self-friendship, self-DM, self-play seat) and stats summation; the confirm endpoint's ownership assertion; discard deletes anon data.
- **Matchmaking:** `pairAndPop` atomicity (mock Redis), pairing creates the DM + game and emits `match_found` to both, disconnect dequeues, liveness requeue.
- **Invites:** create token; peek returns gameType + inviter; accept mints anon when logged-out, creates the game, notifies inviter; expired token rejected; opening own link is a no-op.
- Existing structural/conformance suites are unaffected (no new game type).
- Follow repo conventions: `bun test` per workspace, `mock.module` for server deps, keep pure helpers exported (per `docs/architecture/testing.md`).

## 10. Docs & agents to update (same change)

- `docs/architecture/realtime.md` - matchmaking lane (`queue_join`/`queue_leave`/`match_found`), invite accept path.
- `docs/architecture/database.md` - `isAnonymous`, `account_merge`, `game_invite`; GC note.
- `docs/architecture/shared.md` - new types/schemas + `game_invite` notification type.
- `docs/architecture/web.md` - guest entry points, invite page + skeleton trick, merge nudge, matchmaking UI.
- A new feature doc (e.g. `docs/architecture/guests-and-matchmaking.md`) tying it together.
- `CLAUDE.md` / `AGENTS.md` - only if a convention changes (the reserved-username addition follows an existing documented pattern; no new convention expected).
- `game-builder` agent is unaffected (no new game).

## 11. Implementation phases (decomposition)

Each phase is independently reviewable; all of Layer 1 depends on Phase 0.

- **Phase 0 - Guest identity (foundation).** Anonymous plugin + `isAnonymous` schema + `ensureIdentity()` + entry-point mint + "Sign in to save" nudge. Shippable alone: guests can play everything that exists today.
- **Phase 1 - Merge.** `account_merge` table + `onLinkAccount` recording + pending/confirm/discard endpoints + `mergeAccounts` migration + nudge UI. Depends on Phase 0.
- **Phase 2 - Matchmaking.** Redis queue + `pairAndPop` + pairing service + socket events + "Find a match" UI. Depends on Phase 0; independent of Phase 1.
- **Phase 3 - Invites.** `game_invite` table + create/peek/accept endpoints + `/invite/[token]` page with skeleton trick + "Add as friend" popup + `game_invite` notification type + reserved-username entry. Depends on Phase 0; independent of Phases 1-2.

## 12. Open questions / future

- **MMR/skill matching** - deferred; the FIFO queue and schema leave room to add a rating field and bucketed queues later.
- **GC tuning** - exact inactivity window and whether to add FKs to `game_player`/`move` for cascade deletes (vs explicit cleanup). To be decided in Phase 0/2.
- **Invite single-use vs reusable** - shipping reusable-with-expiry; single-use is a small later option.
- **`ensureUsernameForUser` with anon users** - expected to work (random avatar, generated username); confirm in Phase 0.
