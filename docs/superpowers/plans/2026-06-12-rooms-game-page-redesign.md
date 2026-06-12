# Rooms + Game-Page Redesign - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe every game session as a "Room" (Play / Create / Join), redesign the per-game page (name → image → tutorial video via Plyr → buttons), add a server-authoritative per-player turn timer with auto-moves and auto-abort plus an avatar countdown ring, mint anonymous accounts lazily, and delete the invite-token system end-to-end.

**Architecture:** A "room" is purely a product/UI name over the existing `game` row (no table rename). Three room kinds map to existing fields: anonymous = matchmaking, open-invite = `seatingMode:"open"` + `conversationId:null`, friend-invite = the chat challenge. New socket events `room:create` / `room:join` sit beside the existing matchmaking + `join_room` / `make_move` lanes. The turn timer lives in the realtime layer as an in-memory per-game scheduler driving `engine.autoMove`.

**Tech Stack:** Bun, TypeScript, Turborepo, Drizzle/Postgres, Socket.IO, Next.js 16 / React 19 / Jotai / Tailwind v4, Better Auth (anonymous plugin), Plyr, Zod (shared only), `bun test`.

**Spec:** `docs/superpowers/specs/2026-06-12-rooms-game-page-redesign-design.md`

**Conventions (hard gates - CI fails otherwise):** No code comments (`bun run strip-comments -- --check`). No em dashes (U+2014). No dead code (knip). Icons from `react-icons/fa6` (a radial progress ring is generated art → raw `<svg>` OK). `zod` only in `@gamelobby/shared`. `apps/web` never imports `@gamelobby/database`. Run `bun run type-check` + `bun run check` + `bun test` before every commit batch.

---

## File Structure

**Shared (`packages/shared/src/types/games/`)**
- `definition.ts` (modify) - add `tutorialVideo?` to `GameMeta`.
- `engine.ts` (modify) - add `autoMove?` to `GameEngine`.
- `wire.ts` (modify) - `aborted` status; `turnDeadline` + per-player `timeoutStrikes` on `GameJson`/`gamePlayerSchema`; `auto` flag on `moveJsonSchema`; `clientCreateRoomSchema`, `clientJoinByCodeSchema`, `ServerRoomCreatedPayload`, `ServerJoinByCodeResult`; extend `isGameOver`.

**games-core (`packages/games-core/src/games/tic-tac-toe/`)**
- `engine.ts` (modify) - implement `autoMove`.
- `meta.ts` (modify) - `tutorialVideo: "/games/tic-tac-toe-tutorial.mp4"`.
- `packages/games-core/tests/conformance.test.ts` (modify) - assert `autoMove` exists + returns a legal move; assert `tutorialVideo` path shape when set.

**Server (`apps/server/src/`)**
- `realtime/rooms-service.ts` (create) - `createStandaloneGame`, `validateJoinByCode` (pure-ish service).
- `realtime/room-events.ts` (create) - `attachRoomHandlers` (`room:create`, `room:join`).
- `realtime/turn-timer.ts` (create) - pure timer math (`turnLimitMs`, `nextStrike`, `abortOutcome`) + the in-memory scheduler.
- `realtime/turn-based.ts` (modify) - call scheduler on join/move/timeout; reset strikes on move.
- `realtime/index.ts` (modify) - register room handlers; cancel timers on disconnect/leave.
- `chat/games-in-chat-service.ts` (modify) - extract shared create so standalone reuses it.
- DELETE: `chat/invite-service.ts`, `api/routes/invite.ts`, `packages/database/src/repositories/invites.ts`, `packages/database/src/invite-token.ts`; unmount invite route in `api/index.ts`; drop `gameInvite` from `packages/database/src/schema.ts` + migration.

**Web (`apps/web/`)**
- `app/games/[gameType]/page.tsx` (modify) - full-bleed layout: name + image + tutorial + `RoomActions`.
- `app/games/_shared/game-lobby.tsx` → replace with `app/games/_shared/room-actions.tsx` (create) - Play / Create / Join.
- `app/games/_shared/tutorial-modal.tsx` (create) - Plyr.
- `app/play/find/[gameType]/page.tsx` + `find-client.tsx` (create) - searching screen.
- `app/play/[gameId]/waiting-overlay.tsx` (create) + `play-client.tsx` (modify) - waiting overlay.
- `packages/games-client/src/games/tic-tac-toe/player-bar.tsx` (modify) + `packages/games-client/src/components/countdown-ring.tsx` (create) - avatar ring.
- DELETE: `app/invite/[token]/*`, `lib/invite-client.ts`, `app/games/components/conversation-picker.tsx` (if orphaned).
- `package.json` (modify) - add `plyr`.
- `public/games/tic-tac-toe-tutorial.mp4` (create, copied asset).

**Docs:** `docs/architecture/realtime.md`, `web.md`, `database.md`, `docs/adding-a-game.md`.

---

## Phase 1 - Shared types (foundation)

### Task 1.1: `tutorialVideo` on GameMeta

**Files:** Modify `packages/shared/src/types/games/definition.ts`; Test `packages/shared/tests/game-meta.test.ts`

- [ ] **Step 1: Failing test** - assert a `GameMeta` object accepts an optional `tutorialVideo` string (type-level + runtime passthrough). Since `GameMeta` is an interface, test via a small `isTutorialPath` helper we add too. Simpler: add the field, and rely on Task 1.6 conformance test. Mark this task as a type-only change; verify with `type-check`.
- [ ] **Step 2:** Add `tutorialVideo?: string;` after `coverImage?` in `GameMeta`.
- [ ] **Step 3:** `bun run type-check` passes.
- [ ] **Step 4: Commit** `feat(shared): add optional tutorialVideo to GameMeta`.

### Task 1.2: `aborted` status + `isGameOver`

**Files:** Modify `packages/shared/src/types/games/wire.ts`; Test `packages/shared/tests/wire-status.test.ts`

- [ ] **Step 1: Failing test:**
```ts
import { describe, expect, test } from "bun:test";
import { gameStatusSchema, isGameOver, isGameLive } from "../src/types/games/wire";

describe("aborted status", () => {
  test("schema accepts aborted", () => {
    expect(gameStatusSchema.safeParse("aborted").success).toBe(true);
  });
  test("isGameOver true for aborted", () => {
    expect(isGameOver("aborted")).toBe(true);
  });
  test("isGameLive false for aborted", () => {
    expect(isGameLive("aborted")).toBe(false);
  });
});
```
- [ ] **Step 2:** Run: `cd packages/shared && bun test tests/wire-status.test.ts` → FAIL.
- [ ] **Step 3:** Add `"aborted"` to `gameStatusSchema` enum; change `isGameOver` to `status === "completed" || status === "abandoned" || status === "aborted"`.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `feat(shared): add aborted game status`.

### Task 1.3: timer fields on the wire (`turnDeadline`, per-player `timeoutStrikes`, move `auto`)

**Files:** Modify `wire.ts`; Test `packages/shared/tests/wire-timer.test.ts`

- [ ] **Step 1: Failing test** - `gameJsonSchema` accepts `turnDeadline: number|null`; `gamePlayerSchema` accepts `timeoutStrikes: number`; `moveJsonSchema` accepts `auto: boolean`.
```ts
import { gameJsonSchema, gamePlayerSchema, moveJsonSchema } from "../src/types/games/wire";
// build minimal valid objects incl. turnDeadline / timeoutStrikes / auto, expect success
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add to `gamePlayerSchema`: `timeoutStrikes: z.number().int().nonnegative().optional()`. Add to `gameJsonSchema`: `turnDeadline: z.number().nullable().optional()`. Add to `moveJsonSchema`: `auto: z.boolean().optional()`.
- [ ] **Step 4:** Re-run → PASS. Commit `feat(shared): add turn-timer fields to game/player/move wire`.

### Task 1.4: room socket schemas

**Files:** Modify `wire.ts`; Test `packages/shared/tests/wire-rooms.test.ts`

- [ ] **Step 1: Failing test:**
```ts
import { clientCreateRoomSchema, clientJoinByCodeSchema } from "../src/types/games/wire";
test("create room schema", () => {
  expect(clientCreateRoomSchema.safeParse({ gameType: "tic-tac-toe" }).success).toBe(true);
  expect(clientCreateRoomSchema.safeParse({ gameType: "tic-tac-toe", config: { firstMove: "X" } }).success).toBe(true);
  expect(clientCreateRoomSchema.safeParse({}).success).toBe(false);
});
test("join by code schema normalizes + validates", () => {
  expect(clientJoinByCodeSchema.safeParse({ code: "A2K9P7" }).success).toBe(true);
  expect(clientJoinByCodeSchema.safeParse({ code: "bad" }).success).toBe(false);
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add:
```ts
export const clientCreateRoomSchema = z
  .object({ gameType: gameTypeSchema, config: z.unknown().optional() })
  .strict();
export type ClientCreateRoom = z.infer<typeof clientCreateRoomSchema>;

export const clientJoinByCodeSchema = z.object({ code: gameCodeSchema }).strict();
export type ClientJoinByCode = z.infer<typeof clientJoinByCodeSchema>;

export type ServerRoomCreatedPayload = { ok: true; code: string };
export const joinByCodeErrorSchema = z.enum([
  "not_found",
  "full",
  "already_started",
  "finished",
]);
export type JoinByCodeError = z.infer<typeof joinByCodeErrorSchema>;
export type ServerJoinByCodeResult =
  | { ok: true; code: string }
  | { ok: false; error: JoinByCodeError };
```
(`gameCodeSchema` is already imported.)
- [ ] **Step 4:** Re-run → PASS. Commit `feat(shared): add room create/join wire schemas`.

### Task 1.5: `autoMove` on the GameEngine interface

**Files:** Modify `packages/shared/src/types/games/engine.ts`

- [ ] **Step 1:** Add to `GameEngine`: `autoMove?(state: State, role: string): Input;`
- [ ] **Step 2:** `bun run type-check` (games-core will still compile since tic-tac-toe gets it in Phase 2; the field is optional). Commit `feat(shared): add optional autoMove to GameEngine`.

---

## Phase 2 - games-core: auto-move

### Task 2.1: tic-tac-toe `autoMove`

**Files:** Modify `packages/games-core/src/games/tic-tac-toe/engine.ts`; Test `packages/games-core/tests/tic-tac-toe.test.ts` (append)

- [ ] **Step 1: Failing test:**
```ts
import { ticTacToeEngine, emptyBoard } from "../src/games/tic-tac-toe/engine";
test("autoMove returns a legal move on an empty cell", () => {
  const state = { board: emptyBoard(), currentTurn: "X" as const };
  const mv = ticTacToeEngine.autoMove!(state, "X");
  const idx = mv.row * 3 + mv.col;
  expect(state.board[idx]).toBeNull();
  // and reduce accepts it
  const res = ticTacToeEngine.reduce!(state, { role: "X" }, mv);
  expect(res.ok).toBe(true);
});
test("autoMove picks among only empty cells", () => {
  const board = emptyBoard();
  board[0] = "X"; board[1] = "O"; board[2] = "X";
  const state = { board, currentTurn: "O" as const };
  for (let i = 0; i < 20; i++) {
    const mv = ticTacToeEngine.autoMove!(state, "O");
    expect(board[mv.row * 3 + mv.col]).toBeNull();
  }
});
```
- [ ] **Step 2:** Run: `cd packages/games-core && bun test tests/tic-tac-toe.test.ts` → FAIL.
- [ ] **Step 3:** Add to `ticTacToeEngine`:
```ts
  autoMove(state, _role): TicTacToeMove {
    const empties: number[] = [];
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] === null) empties.push(i);
    }
    const idx = empties[Math.floor(Math.random() * empties.length)] ?? 0;
    return { row: Math.floor(idx / 3), col: idx % 3 };
  },
```
- [ ] **Step 4:** Re-run → PASS. Commit `feat(games-core): tic-tac-toe autoMove (random empty cell)`.

### Task 2.2: conformance

**Files:** Modify `packages/games-core/tests/conformance.test.ts`

- [ ] **Step 1:** Add a test that for each `def` in `GAMES`, `def.engine.autoMove` is a function and, for a fresh active two-seat state, returns a move that `def.moveSchema` parses and `reduce` accepts. Also assert `def.meta.tutorialVideo`, when set, starts with `/games/`.
- [ ] **Step 2:** Run conformance → PASS. Commit `test(games-core): conformance covers autoMove + tutorialVideo`.

---

## Phase 3 - Server: standalone rooms (Create / Join)

### Task 3.1: `createStandaloneGame` + `validateJoinByCode`

**Files:** Create `apps/server/src/realtime/rooms-service.ts`; Modify `apps/server/src/chat/games-in-chat-service.ts` (export a reusable core if needed); Test `apps/server/tests/rooms-service.test.ts`

- [ ] **Step 1:** Read `games-in-chat-service.ts` `createGameInConversation` to learn the exact `games.createGame` shape. Extract a `createSeatedGame({ userId, gameType, conversationId, seatingMode, challengedUserId, config })` if convenient, or call `games.createGame` directly in the new service. The standalone create: `conversationId: null`, `seatingMode: "open"`, host seated, status `waiting`, no `announceGame`/notifications.
- [ ] **Step 2: Failing test** (mock `@gamelobby/database` + `@gamelobby/games-core` via `mock.module`, per `tests/setup.ts` conventions): `createStandaloneGame` returns `{ ok:true, code }` for a known engine; returns `{ ok:false }` for an unknown gameType (`hasEngine` false); calls `games.createGame` with `conversationId: null` and one seated player; never calls `messages.sendMessage`.
- [ ] **Step 3:** Implement `createStandaloneGame(input: { userId: string; gameType: GameType; config?: unknown }): Promise<ServiceResult<{ code: string }>>` using `hasEngine`, `configSchema.safeParse`, `engine.createInitialState`, `games.createGame`. And `validateJoinByCode(code): Promise<ServerJoinByCodeResult>`: `getGameByCode`; null → `not_found`; `status==="completed"||"abandoned"||"aborted"` → `finished`; `status==="active"` (and full) → `already_started`; players ≥ maxPlayers → `full`; else `{ ok:true, code }`.
- [ ] **Step 4:** Run → PASS. Commit `feat(server): standalone room create + join-by-code service`.

### Task 3.2: `room:create` / `room:join` handlers

**Files:** Create `apps/server/src/realtime/room-events.ts`; Modify `apps/server/src/realtime/index.ts`; Test `apps/server/tests/room-events.test.ts`

- [ ] **Step 1: Failing test** - `attachRoomHandlers` registers `room:create` (ack `{ ok:true, code }`) and `room:join` (ack `{ ok:true, code }` or `{ ok:false, error }`). Mock the service. Simulate a fake socket capturing `.on` handlers + ack callbacks.
- [ ] **Step 2:** Implement using `register`/`ackErr` from `socket-util.ts` and a simple per-socket rate limiter (e.g. token bucket: max 10 `room:create`/60s). `room:create` parses with `clientCreateRoomSchema`, calls `createStandaloneGame(socket.data.userId, …)`, acks `{ ok:true, code }` or `ackErr`. `room:join` parses with `clientJoinByCodeSchema`, calls `validateJoinByCode`, acks the result directly.
- [ ] **Step 3:** In `index.ts` add `attachRoomHandlers(io, socket)` in the connection block.
- [ ] **Step 4:** Run → PASS. Type-check + check. Commit `feat(server): room:create and room:join socket events with rate limiting`.

---

## Phase 4 - Server: turn timer, auto-move, auto-abort

### Task 4.1: pure timer math

**Files:** Create `apps/server/src/realtime/turn-timer.ts`; Test `apps/server/tests/turn-timer.test.ts`

- [ ] **Step 1: Failing test** covering the spec model exactly:
```ts
import { turnLimitMs, decideTimeout } from "../src/realtime/turn-timer";

test("first turn 15s, then 5s when no strikes", () => {
  expect(turnLimitMs({ isFirstTurn: true, strikes: 0 })).toBe(15000);
  expect(turnLimitMs({ isFirstTurn: false, strikes: 0 })).toBe(5000);
  expect(turnLimitMs({ isFirstTurn: false, strikes: 1 })).toBe(4000);
  expect(turnLimitMs({ isFirstTurn: false, strikes: 2 })).toBe(3000);
});
test("AFK escalates 15 -> 4 -> 3 -> abort", () => {
  // strike after first-turn timeout = 1 -> next 4s; strike 2 -> 3s; strike 3 -> abort
  expect(decideTimeout({ strikes: 0 })).toEqual({ kind: "auto-move", nextStrikes: 1 });
  expect(decideTimeout({ strikes: 1 })).toEqual({ kind: "auto-move", nextStrikes: 2 });
  expect(decideTimeout({ strikes: 2 })).toEqual({ kind: "abort" });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement:
```ts
export const FIRST_TURN_MS = 15000;
export const BASE_MS = 5000;
export const ABORT_AT_STRIKES = 3;

export function turnLimitMs(p: { isFirstTurn: boolean; strikes: number }): number {
  if (p.isFirstTurn) return FIRST_TURN_MS;
  return Math.max(BASE_MS - p.strikes * 1000, 1000);
}
export function decideTimeout(p: { strikes: number }):
  | { kind: "auto-move"; nextStrikes: number }
  | { kind: "abort" } {
  const next = p.strikes + 1;
  return next >= ABORT_AT_STRIKES ? { kind: "abort" } : { kind: "auto-move", nextStrikes: next };
}
export function abortOutcome(p: { opponentStrikes: number }):
  | { winner: "opponent" } | { winner: null } {
  return p.opponentStrikes === 0 ? { winner: "opponent" } : { winner: null };
}
```
- [ ] **Step 4:** Add an `abortOutcome` test (opponent strikes 0 → forfeit win; >0 → no winner). Re-run → PASS. Commit `feat(server): pure turn-timer math`.

### Task 4.2: scheduler + wiring into turn-based

**Files:** Modify `apps/server/src/realtime/turn-timer.ts` (scheduler), `apps/server/src/realtime/turn-based.ts`, `apps/server/src/realtime/index.ts`; Test `apps/server/tests/turn-timer-scheduler.test.ts`

- [ ] **Step 1:** Design: an in-memory `Map<gameId, { timer: Timeout; deadline: number }>` and per-game strike state stored on `game_player` (add a `consecutiveTimeouts` column) OR an in-memory `Map<gameId, Map<userId, strikes>>`. To keep the DB change minimal and avoid drift-guard churn, store strikes **in-memory** keyed by gameId+role; persist only `turnDeadline` by including it in the serialized `game` payload (computed, not stored). Expose: `scheduleTurn(io, gameRow)`, `clearTurn(gameId)`, `onMove(io, gameRow, moverRole)` (reset that role's strikes, reschedule), `onTimeout(io, gameId)`.
- [ ] **Step 2: Failing test** using injected fake clock/timer (pass `setTimeout`/`clearTimeout`/`now` as deps so it's testable without real time): scheduling computes deadline = now + limit; firing calls a provided `applyAutoMove` then reschedules; at strike 3 calls a provided `applyAbort`.
- [ ] **Step 3:** Implement the scheduler with injected timer deps (default to global). `onTimeout` loads the game, computes `decideTimeout`; if `auto-move` → call `engine.autoMove`, run it through the same reduce/persist/broadcast path as `handleMakeMove` (extract a shared `applyMove(io, gameRow, role, moveData, { auto:true })` from turn-based), increment strikes, reschedule; if `abort` → set status `aborted` + winner via `abortOutcome` (look up opponent strikes), broadcast `game_state` + `game_over`.
- [ ] **Step 4:** Wire: in `handleJoinRoom`, when `changed` and game becomes `active`, `scheduleTurn`. In `applyMove`/`handleMakeMove`, reset mover strikes + reschedule (unless game over → `clearTurn`). On `disconnect`/`leave_room`/game over → `clearTurn` where appropriate. Include `turnDeadline` + each player's `timeoutStrikes` in `serializeGame` output (extend serialize to read from the scheduler, or attach in the broadcast payload).
- [ ] **Step 5:** Run scheduler tests → PASS. Full `cd apps/server && bun test`. Commit `feat(server): authoritative turn-timer scheduler with auto-move and auto-abort`.

> Note: serialize currently has no timer fields. Simplest: compute `turnDeadline`/`timeoutStrikes` in the realtime broadcast (not in `serializeGame`), by merging into the payload before `emitToGame`. Keep `serializeGame` pure; add a `withTimer(payload, timerState)` helper in turn-timer.

---

## Phase 5 - Invite removal (end-to-end)

### Task 5.1: server + DB

**Files:** Delete `apps/server/src/chat/invite-service.ts`, `apps/server/src/api/routes/invite.ts`, `packages/database/src/repositories/invites.ts`, `packages/database/src/invite-token.ts`; Modify `apps/server/src/api/index.ts` (unmount), `packages/database/src/schema.ts` (drop `gameInvite` + its enums/types), `packages/database/src/index.ts` (drop `invites` namespace export), `packages/shared/src/types/db/*` (drop invite IO types if any).

- [ ] **Step 1:** Grep `invite` across `apps/server`, `packages/database`, `packages/shared` to enumerate every reference. Delete the files; remove the route mount; remove the `gameInvite` table + any `invites` repo export.
- [ ] **Step 2:** Generate a drop migration (`bun run db:generate`) or hand-write a `DROP TABLE game_invite`; apply with `bun run db:push` (dev DB is push-managed). Verify drift-guard passes.
- [ ] **Step 3:** Delete `apps/server/integration/invite-flow.test.ts` and any invite unit tests.
- [ ] **Step 4:** `bun run type-check` + `cd apps/server && bun test`. Commit `chore(server): remove invite-token system (service, routes, table)`.

### Task 5.2: web

**Files:** Delete `apps/web/app/invite/[token]/*`, `apps/web/lib/invite-client.ts`; Modify any importers; `RESERVED_USERNAMES` may keep `invite` (harmless).

- [ ] **Step 1:** Delete the invite route folder + client. Remove the import + `inviteByLink` usage (handled in Phase 6 when `game-lobby.tsx` is replaced).
- [ ] **Step 2:** Delete `apps/web/tests/*invite*` if present. `bun run type-check`. Commit `chore(web): remove invite link UI + client`.

---

## Phase 6 - Web: game page redesign + tutorial

### Task 6.1: Plyr dep + asset + meta

**Files:** Modify `apps/web/package.json`; create `apps/web/public/games/tic-tac-toe-tutorial.mp4`; modify `packages/games-core/src/games/tic-tac-toe/meta.ts`.

- [ ] **Step 1:** `cd apps/web && bun add plyr` (vanilla; we wrap it ourselves for React 19/Next 16 safety). Verify it resolves.
- [ ] **Step 2:** Copy asset: `cp "/Volumes/Sandisk SSD/codingAndFun/samaan/game-lib/vid-tutorials/scripts/tutorial.mp4" apps/web/public/games/tic-tac-toe-tutorial.mp4`.
- [ ] **Step 3:** Set `tutorialVideo: "/games/tic-tac-toe-tutorial.mp4"` in `ticTacToeMeta`.
- [ ] **Step 4:** `bun run type-check`. Commit `feat(web): add Plyr + tic-tac-toe tutorial video asset`.

### Task 6.2: TutorialModal (Plyr)

**Files:** Create `apps/web/app/games/_shared/tutorial-modal.tsx`; Test `apps/web/tests/tutorial-modal.test.tsx` (light render/smoke or skip DOM-heavy).

- [ ] **Step 1:** Implement a `"use client"` modal: framer-motion `AnimatePresence` overlay; on mount, dynamically `import("plyr")` + `import("plyr/dist/plyr.css")`, attach to a `<video>` with `src={videoUrl}`, controls. Lazy: only mounted when open. Close button uses `react-icons/fa6` `FaXmark`. Destroy the Plyr instance on unmount.
- [ ] **Step 2:** Smoke test that it renders a `<video>` with the given src when open and nothing when closed (mock `plyr`). Commit `feat(web): tutorial modal with Plyr player`.

### Task 6.3 + 6.4: page layout + RoomActions

**Files:** Modify `apps/web/app/games/[gameType]/page.tsx`; Create `apps/web/app/games/_shared/room-actions.tsx`; Delete `app/games/_shared/game-lobby.tsx`; conditionally delete `conversation-picker.tsx` (if now orphaned - check `chat/[handle]/game-launcher.tsx` still owns the in-chat picker; if it imported the same component, keep it).

- [ ] **Step 1:** Read the current `page.tsx` to see how it fetches `def`, `session`, and renders the header. Rebuild the layout: centered, full-height column - `meta.name`, `meta.description`, a `next/image` cover (`meta.coverImage`), a "Watch tutorial" button (only if `meta.tutorialVideo`) that opens `TutorialModal`, then `<RoomActions meta configFields />`.
- [ ] **Step 2:** `RoomActions` (`"use client"`): keeps `config` state + `ConfigFieldRow` (moved from game-lobby). Buttons:
  - **Play** (primary, full width): `await ensureIdentity(); router.push(\`/play/find/${meta.type}\`)`.
  - **Create** + **Join** in a `grid grid-cols-2 gap-3` (50/50). Create opens an inline config panel → `emitAck("room:create", { gameType, config })` → `router.push(\`/play/${res.code}\`)`. Join opens a code input → client `normalizeGameCode`/`isGameCode` → `emitAck("room:join", { code })`; on `{ ok:true }` push `/play/{code}`, on `{ ok:false }` show the mapped error string.
  - Remove the old `match_found` listener + searching block (moves to the find screen).
- [ ] **Step 3:** Tests `apps/web/tests/room-actions.test.tsx`: Play calls `ensureIdentity` then navigates to `/play/find/{type}`; Join with an invalid code shows an error and does not navigate; Create navigates to `/play/{code}` on `ok`. Mock `ensureIdentity`, `useRouter`, and the socket `emitAck`.
- [ ] **Step 4:** `bun run type-check` + `bun run check` + `cd apps/web && bun test`. Commit `feat(web): room-centric game page (Play / Create / Join) + tutorial`.

---

## Phase 7 - Web: searching screen + waiting overlay

### Task 7.1: `/play/find/[gameType]`

**Files:** Create `apps/web/app/play/find/[gameType]/page.tsx` (server: validate gameType via `hasEngine`/`listGameMeta`, else `notFound()`) + `find-client.tsx`; Test `apps/web/tests/find-client.test.tsx`.

- [ ] **Step 1:** `find-client.tsx` (`"use client"`): on mount `socket.emit("game:queue_join", { gameType })` + set `matchmakingAtom`; `useSocketEvent("match_found", p => router.replace(\`/play/${p.gameId}\`))`; render a full-screen linear/pulsing animation (framer-motion) + game name + elapsed timer + **Cancel** (`game:queue_leave` → `router.push(\`/games/${gameType}\`)`); clear `matchmakingAtom` on unmount.
- [ ] **Step 2:** Test: emits `queue_join` on mount; navigates to `/play/{code}` on `match_found`; Cancel emits `queue_leave`. Commit `feat(web): matchmaking searching screen at /play/find/[gameType]`.

### Task 7.2: waiting overlay

**Files:** Create `apps/web/app/play/[gameId]/waiting-overlay.tsx`; Modify `apps/web/app/play/[gameId]/play-client.tsx`; Test `apps/web/tests/waiting-overlay.test.tsx`.

- [ ] **Step 1:** Read `play-client.tsx` + `game-over-overlay.tsx` for the exact overlay pattern + how `initialGame`/socket are available.
- [ ] **Step 2:** `waiting-overlay.tsx`: render when `game.status === "waiting" && players.length < 2`; show big room code (`gameId`), Copy code + Copy link buttons, framer-motion pulsing "Waiting for your opponent…"; `useSocketEvent("game_state", p => { if (p.game.status === "active") dismiss() })` with an "Opponent joined" transition. Mount in `play-client.tsx` as a sibling to the board (z-50).
- [ ] **Step 3:** Test: renders code when waiting+1 player; dismisses on `game_state` active. Commit `feat(web): waiting-for-opponent overlay with room code + share`.

---

## Phase 8 - Web: avatar countdown ring

### Task 8.1: CountdownRing component

**Files:** Create `packages/games-client/src/components/countdown-ring.tsx`; Test `packages/games-client/tests/countdown-ring.test.tsx`.

- [ ] **Step 1:** Props `{ deadline: number | null; active: boolean; size?: number; children }`. Wrap `children` (avatar) with an SVG `<circle>` ring using `stroke-dasharray`/`stroke-dashoffset`. When `active && deadline`, compute `remaining = deadline - Date.now()` and animate offset full→empty over `remaining` ms with **linear** easing (CSS transition `stroke-dashoffset Xms linear`, or a rAF loop). Reset to full when `deadline` changes. Ring hidden when `!active`. SVG is generated art → allowed.
- [ ] **Step 2:** Test: when `active` with a future deadline, the circle renders with a non-zero dash; when `!active`, ring not rendered. Commit `feat(games-client): linear avatar countdown ring`.

### Task 8.2: integrate into player-bar

**Files:** Modify `packages/games-client/src/games/tic-tac-toe/player-bar.tsx`.

- [ ] **Step 1:** Read `player-bar.tsx` + the tic-tac-toe `client.tsx` to find where `game.turnDeadline` + current turn + each player's role are available. Wrap each seat's avatar in `CountdownRing` with `active = (status === "active" && player.role === game.currentTurn-equivalent)` and `deadline = game.turnDeadline`.
- [ ] **Step 2:** Type-check + games-client tests. Commit `feat(games-client): show countdown ring around the active player avatar`.

---

## Phase 9 - Lazy anon final wiring

### Task 9.1

- [ ] **Step 1:** Confirm `RoomActions` + find-client all call `ensureIdentity()` before emitting and there's no `router.push("/auth")` guard left. Grep for `"/auth"` redirects tied to play/create/join. Commit if any cleanup.

---

## Phase 10 - Docs sync

### Task 10.1

**Files:** Modify `docs/architecture/realtime.md` (room:create/join + turn-timer), `docs/architecture/web.md` (new game page, find route, waiting overlay, Plyr), `docs/architecture/database.md` (gameInvite dropped), `docs/adding-a-game.md` (tutorialVideo + autoMove).

- [ ] **Step 1:** Use the `docs-maintainer` agent (or edit directly) to re-sync these pages against the new code. Remove invite references. Commit `docs: sync architecture + adding-a-game for rooms, timer, tutorial`.

---

## Phase 11 - Verify, PR, CI

### Task 11.1: full local gate

- [ ] `bun run type-check` - clean.
- [ ] `bun run check` - clean (biome).
- [ ] `bun run strip-comments -- --check` - no offenders.
- [ ] `bun run test` - all pass.
- [ ] `bunx knip` (or the repo's knip script) - no dead code.
- [ ] Grep for em dashes (U+2014) in changed files - none.

### Task 11.2: PR

- [ ] Push the worktree branch; open a PR with a thorough body (summary, the spec link, screenshots/notes, test plan).
- [ ] Watch CI; fix any failures.
- [ ] Address every review-bot comment (React Doctor advisory inline comments re-post per push; CodeRabbit). Resolve threads after the final push.
- [ ] Loop until checks are green and comments resolved.

---

## Self-review notes
- Every spec section maps to a phase (rooms §2 → P3; game page §4 → P6; flows §5 → P6/P7; timer §6.5 → P1/P2/P4/P8; invite removal §6 → P5; anon §2 → P9; tests §8 → per-task; docs §9 → P10).
- Type consistency: `turnDeadline` (number|null), `timeoutStrikes` (number), `ServerJoinByCodeResult` (discriminated union), `autoMove(state, role): Input`, `createStandaloneGame → { ok, code }` are used consistently across server + web tasks.
- Open risk carried into execution: serialize timer fields via a broadcast-merge helper (not `serializeGame`) to keep serialize pure; Plyr wrapped manually (dynamic import) to avoid React-19 wrapper issues; conversation-picker deletion gated on the chat game-launcher still owning its own picker.
