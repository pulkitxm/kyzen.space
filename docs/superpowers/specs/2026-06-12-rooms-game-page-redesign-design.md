# Rooms + Game-Page Redesign - Design Spec

Date: 2026-06-12
Status: Approved direction; pending spec review

## 1. Goal

Reframe every multiplayer game session as a **"Room"**, redesign the per-game page around three actions (**Play / Create / Join**), add a self-hosted **tutorial video**, mint **anonymous accounts lazily** (only on action), and **delete the invite-token system end-to-end**.

The "very long ID" the user disliked was the 43-char invite token - not the 6-char game code, which is already friendly and shareable. This work removes the token middle-man and gives codes a first-class Create/Join UI.

## 2. Core principle: a Room *is* a Game (UI naming over existing mechanics)

A **Room** is surfaced in the product/UI as a room, but **internally it remains a `game` row** - no table rename, no new `room` table, no `room_type` column. Behavior is identical to today. The three room kinds map onto fields the `game` row already has:

| Room kind (product) | Internal representation |
| --- | --- |
| **Anonymous** (the **Play** button) | Matchmaking game via the existing FIFO queue |
| **Open invite** (**Create** → share code) | `game` with `seatingMode:"open"`, `conversationId:null`, host seated, shareable 6-char `code` |
| **Friend invite** (challenge a specific friend) | `game` with `seatingMode:"challenge"` + `challengedUserId` (the existing in-chat challenge), reachable from the chat surface |

The 6-char game code (`code.ts`, alphabet excludes I/L/O, typo-tolerant `normalizeGameCode`) **is** the room code. The play page (`/play/{code}`) **is** the room.

**Anonymous-user access.** Play, Create, and Join all work for anonymous (guest) users: `ensureIdentity()` mints an anonymous account on click, and the socket handshake + `requireAuth` accept anonymous sessions (they only require a `user.id`). No login wall on any of the three actions. Only **Friend invite** effectively needs a registered identity, since it requires a friends list (anonymous users start with none) - and that lives in the chat surface, not the game page.

## 3. Non-goals

- No DB table rename; no new room table; no `room_type` column. (Confirmed: "show it as a room but internally create a game.")
- Untouched: game rules/engines, the chat product, the `vid-tutorials/` Remotion system, MMR/skill matching, queue persistence across restarts, multiplayer beyond 2 seats.

## 4. The new game page - `/games/[gameType]`

Full-bleed, seamless, centered. Top → bottom: **name → cover image → tutorial → buttons**.

```
                  Tic-tac-toe                     <- meta.name (top)
        Classic 3x3. Three in a row wins.         <- meta.description
        +-----------------------------+
        |       [ cover image ]       |           <- meta.coverImage
        +-----------------------------+
              [>]  Watch tutorial                  <- only if meta.tutorialVideo
   +-----------------------------------------+
   |                [>]  PLAY                 |     <- primary, colored, full width
   +-----------------------------------------+
   +------------------+  +--------------------+
   |      Create      |  |        Join        |     <- 50 / 50, equal width
   +------------------+  +--------------------+
```

- **Play** = anonymous matchmaking (primary, colored, full width).
- **Create** + **Join** = equal-width 50/50 below Play.
- **Watch tutorial** opens a modal with a **Plyr** player streaming a **local mp4** from `public/` (no YouTube). Button hidden when the game has no `tutorialVideo`.
- The game's **config fields** (e.g. tic-tac-toe "first move") move *into* the Create panel; Play and Join use defaults/inherit, keeping the page to exactly name/image/tutorial/3-buttons.
- The old `GameLobby` ("Play with a friend", "Invite a friend (link)", "Find a match") is replaced. Friend challenges remain available from the chat surface (`app/chat/[handle]/game-launcher.tsx`).

## 5. The three flows

### Play (anonymous room)
1. Click → `ensureIdentity()` (mint anon account if no session) → `router.push('/play/find/{gameType}')`.
2. The searching screen emits `game:queue_join { gameType, config }`, shows a full-screen animation, listens for `match_found`.
3. On `match_found { gameId }` → `router.replace('/play/{code}')`. Cancel emits `game:queue_leave` → back to the game page.

```
            [⌕]  (pulsing)
     Finding you an opponent...
        Tic-tac-toe · 0:07
          [   Cancel   ]
```

### Create (open-invite room)
1. Click → `ensureIdentity()` → inline config panel → `emitAck('room:create', { gameType, config })` returns `{ code }`.
2. `router.push('/play/{code}')` as host. The **waiting overlay** shows the room code + share, and dismisses with an "opponent joined" transition when the game goes `active`.

```
   Waiting for your opponent...    (pulsing)
        Room code:  A2K9P7
     [ Copy code ]   [ Copy link ]
   Share the code - they tap Join.
```

### Join (enter a code)
1. Click → `ensureIdentity()` → code input (client-validated with `normalizeGameCode` / `isGameCode`).
2. `emitAck('room:join', { code })` validates server-side: returns `{ code }` or `{ error }` (`not_found` | `full` | `already_started` | `finished`).
3. On `{ code }` → `router.push('/play/{code}')`; the board's existing `join_room` seats the player via `ensureSeated`, status flips `active`. On `{ error }` → inline message, no navigation (a mistyped code never lands on a 404).

## 6. Architecture & components

### 6.1 Shared types (`@gamelobby/shared`)
- `GameMeta` gains `tutorialVideo?: string` (a `/games/...` path, mirroring `coverImage`). `packages/shared/src/types/games/definition.ts`.
- New wire schemas in `packages/shared/src/types/games/wire.ts` (zod stays in shared):
  - `clientCreateRoomSchema = { gameType, config? }`
  - `clientJoinByCodeSchema = { code }`
  - `ServerRoomCreatedPayload = { code }`
  - `ServerJoinByCodeResult = { code } | { error: "not_found" | "full" | "already_started" | "finished" }`
- No new DB columns/tables. Only removal: the `gameInvite` table and its types.

### 6.2 Server (`apps/server`)
- New service `createStandaloneGame({ userId, gameType, config })` (new `rooms-service.ts`, or extend `games-in-chat-service.ts`): creates a `game` with `conversationId:null`, `seatingMode:"open"`, host seated; **skips** the `game_card` announce + notifications (those require a conversation). Reuses `games.createGame`.
- New socket events, registered in `realtime/index.ts` alongside the existing ones, both **rate-limited**:
  - `room:create` → ack `{ code }`.
  - `room:join` (by code) → validates a waiting/open game by code; ack `{ code }` or `{ error }`. Authoritative seating still happens via the existing `join_room` → `ensureSeated`.
- Unchanged: matchmaking (`game:queue_join` / `game:queue_leave` / `match_found`), `join_room`, `make_move`.
- **Invite removal:** delete `chat/invite-service.ts`, `api/routes/invite.ts` (and unmount it from the Hono router), `repositories/invites.ts`, `invite-token.ts`; drop the `gameInvite` table (schema + a drop migration). The anon sign-in inside invite-accept becomes redundant - the client's `ensureIdentity()` covers it.

### 6.3 Web (`apps/web`)
- **Game page** `app/games/[gameType]/page.tsx`: redesigned full-bleed layout rendering name + cover image + tutorial button + a new `RoomActions` client component. (The current page does not render name/image; that moves here.)
- **`RoomActions`** (client): Play / Create / Join wiring described in §5; calls `ensureIdentity()` on every action (removes the old `userId ? … : router.push("/auth")` guard).
- **`TutorialModal`** (client): a Plyr player over the local mp4, lazy-mounted on click. Per project memory, use **framer-motion + AnimatePresence** for the modal mount/unmount.
- **Searching screen** `app/play/find/[gameType]/page.tsx` (+ client): sibling route that does **not** collide with `[gameId]` (which strictly validates 6-char codes). Reuses `matchmakingAtom` and the existing `game:queue_join` / `match_found` events.
- **Waiting overlay** `app/play/[gameId]/waiting-overlay.tsx`: mounted in `play-client.tsx`; renders when `game.status==="waiting" && players.length < 2`; reuses the `game-over-overlay.tsx` pattern (watch `game_state`, dismiss when `status → "active"`). framer-motion for the transition.
- Remove invite UI: `app/invite/[token]/*`, `lib/invite-client.ts`, the "Invite a friend (link)" button.
- Add **Plyr** to `apps/web` deps (verify React 19 / Next 16 fit; wrap vanilla `plyr` if `plyr-react` lags). Copy `vid-tutorials/scripts/tutorial.mp4` → `apps/web/public/games/tic-tac-toe-tutorial.mp4`; set `tutorialVideo: "/games/tic-tac-toe-tutorial.mp4"` on tic-tac-toe meta.

### 6.4 Asset
- The tutorial render is `vid-tutorials/scripts/tutorial.mp4` (~11 MB). Copied into `apps/web/public/games/`. (An 11 MB committed asset is acceptable next to the existing cover PNG; optimization is a later concern.)

### 6.5 Turn timer, auto-move & auto-abort (server-authoritative)

Lives entirely in the game websocket lane (`turn-based.ts` / realtime). The server alone enforces timing; the client only renders a countdown synced to a server-provided `turnDeadline`. (A client-trusted clock would be trivially cheatable.)

**Per-player, independent clocks.** Each seat tracks `consecutiveTimeouts` (strikes), reset to 0 by any real move.
- A seat's **first turn**: 15s.
- Every later turn: **`5 − strikes` seconds** (strikes 0 → 5s, 1 → 4s, 2 → 3s).
- **Real move** → clear that seat's strikes (next turn back to 5s).
- **Timeout** (deadline passes with no move) → increment that seat's strikes, apply the engine auto-move, advance the turn. When strikes reach **3**, that seat is **aborted** instead of getting a 4th reduced turn.
- A continuously-AFK seat therefore runs **15 → 4 → 3 → abort**. A seat that keeps responding stays at **15 → 5 → 5 → 5 …**, completely independent of the opponent.

**Auto-move (mechanism generic, move game-specific).** The `GameEngine` interface gains `autoMove(state, role): Move`, returning a random *legal* move. Tic-tac-toe → a random empty cell with the current player's mark. The timeout handler runs the auto-move through the normal `moveSchema` validate → `engine.reduce` → persist → broadcast path; auto-moves are flagged (`auto: true`) in `move_data`.

**Abort outcome** (terminal status `aborted`):
- Opponent **was responding** (opponent `strikes === 0`) → opponent **wins by forfeit** (`status: "aborted"`, `winnerRole = opponent`).
- Opponent **is also mid-AFK** (opponent `strikes > 0`) → `status: "aborted"`, **no winner**.
- So the room only "aborts with no winner" when neither side is responding.

**Scheduling & state.**
- The realtime layer keeps an in-memory per-game scheduler (one pending deadline per active game). On `active`, on every move, and after each timeout auto-move, it recomputes `turnDeadline = now + limit(currentSeat)` and (re)schedules the fire.
- The broadcast `game_state` carries `turnDeadline` (+ per-seat strikes) so the board can render the countdown ring (below).
- `turnDeadline` + strikes are persisted (`game_player.consecutive_timeouts`, plus a deadline on the game/state-meta) so a reconnecting board recovers the live countdown and a restarted node can reconcile overdue turns.

**Client display - avatar countdown ring (no number).** The timer is never shown as a numeral. Each player's profile picture (in the board's `player-bar.tsx`) is wrapped by a **circular progress ring/outline**. At the start of the active seat's turn the ring is **full (100%)** and **depletes linearly to 0%** as `turnDeadline` approaches, then **animates out**. The ring is driven by the server `turnDeadline`: the client computes `remaining = turnDeadline − now` and animates the ring's stroke from its current fraction down to 0 over `remaining` ms with **linear** easing; a new turn resets it to 100%. The ring is shown around **whichever seat is on the clock** (the current turn). It is a generated radial indicator - an SVG stroke arc (`stroke-dasharray`/`stroke-dashoffset`), which is a decorative indicator, not an icon, so a raw `<svg>` is acceptable here (the react-icons rule covers icons, not generated progress art). Linear (not eased) so the depletion reads as a true clock.

**Status enum.** Add `aborted` to `gameStatusSchema` and the Drizzle `pgEnum` (applied via `db:push`, per the push-managed dev DB); `isGameOver` includes it.

**Known limitation (noted, not solved in v1).** In-memory timers assume one server node owns a game's clock; multi-node durability (redis-backed deadlines + a sweeper, or per-room node affinity) is future hardening - the persisted `turnDeadline` is what lets a restarted node catch overdue turns.

## 7. Error handling

- **Join:** client normalizes/validates the code; server ack returns typed errors (`not_found` / `full` / `already_started` / `finished`) shown inline. Navigation only on success → no 404 on a typo.
- **Searching:** Cancel leaves the queue; leaving the route clears `matchmakingAtom`. Optional "taking longer than usual" copy after N seconds.
- **Seat race:** `room:join`'s ack is advisory; `ensureSeated` is the authoritative gate (no-ops when full). If a seat is taken between ack and `join_room`, the board renders a full/spectator state. Acceptable for v1.
- **Rate limiting:** added to `room:create` and `room:join` (and ideally `game:queue_join`), none of which are rate-limited today.

## 8. Testing

- **Server:** handler tests for `room:create` (creates a standalone open game; null conversation; no announce/notify) and `room:join` (each typed error). Remove invite tests. Matchmaking tests unchanged (Play behavior is unchanged).
- **Shared:** `tutorialVideo` on `GameMeta`; create/join wire-schema tests.
- **Web:** `RoomActions` (ensureIdentity invoked; navigation targets), Join validation + error states, searching screen (queue_join emitted, match_found navigates), waiting overlay (`waiting → active` dismiss), tutorial modal mounts Plyr on click.
- **Structural suites:** unaffected - `tutorialVideo` is optional, like `coverImage`.

## 9. Docs to update (house "keep docs in sync" rule)

- `docs/architecture/realtime.md` - `room:create` / `room:join` events.
- `docs/architecture/web.md` - new game page, searching route, waiting overlay, Plyr tutorial.
- `docs/architecture/database.md` - `gameInvite` dropped.
- `docs/adding-a-game.md` - `tutorialVideo` meta field (+ cover image guidance).
- Remove invite references repo-wide; note the change in the matchmaking spec doc.

## 10. Deliberate decisions

1. **Room = game internally** (UI naming only); no schema rename. *(user-confirmed)*
2. **Play (matchmaking) keeps today's behavior** (lowest risk; already tested). Open-invite rooms are **board-only** (no chat); friend rooms may keep their conversation/chat.
3. **Reuse the 6-char code** as the room code (no new code format).
4. **Instant match start** (no accept/ready handshake). **2-player** for now; the overlay/room model generalizes later.
5. **Tutorial = local mp4 + Plyr** (no YouTube embeds). *(user-confirmed)*
6. **Invite-token system removed end-to-end.** *(user-confirmed)*

## 11. Risks / open items

- 11 MB video committed to the repo.
- Plyr ↔ React 19 / Next 16 compatibility - verify; fall back to wrapping vanilla `plyr` if the React wrapper lags.
- Removing the game page's friend/invite buttons must not orphan code (the knip dead-code CI gate). Friend challenges remain via the chat `game-launcher`; any now-unused lobby/picker code is deleted in the same change.
- No new top-level route segment is added (`/play/find` lives under the already-reserved `play`), so `RESERVED_USERNAMES` needs no change.

## 12. Implementation order (high level)

1. Shared: `tutorialVideo` on `GameMeta`; create/join wire schemas.
2. Server: `createStandaloneGame` + `room:create` / `room:join` handlers + rate limiting.
3. Invite removal (server + web + DB drop migration).
4. Web: redesigned game page + `RoomActions`; tutorial modal + Plyr + asset copy + tic-tac-toe meta.
5. Web: searching screen route; waiting overlay.
6. Lazy anon wiring on all three actions.
7. Tests + docs sync.
