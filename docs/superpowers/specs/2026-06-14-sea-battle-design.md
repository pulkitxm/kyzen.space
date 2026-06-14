# Sea Battle (Battleship) - Design Spec

Status: approved design, ready for implementation planning.
Date: 2026-06-14.
Target: add "Sea Battle" as a new game on the Kyzen platform, spanning `@kyzen/shared`, `@kyzen/games-core`, and `@kyzen/games-client`, plus one optional generic platform hook for hidden information.

## 1. Goal

A two-player, turn-based game of imperfect information. Each player secretly arranges a fleet on a private 10x10 grid, then players alternately fire at coordinates on the opponent's grid until one fleet is destroyed. The defining constraint is **hidden information**: a player's own ship positions must never be derivable by the opponent until those cells are hit.

This is NOT a from-scratch networking project. The platform already provides the authoritative server, the turn state machine, the move pipeline, persistence, reconnection, seating, and the turn timer. We implement only the game's rules (engine), its board (client UI), and the one capability the platform lacks: per-recipient state redaction.

## 2. Locked decisions

| Decision | Choice |
| --- | --- |
| Hidden information | Add an optional `viewFor(state, role)` projection to the `GameEngine`; redact per recipient at the broadcast boundary. |
| Variant / fleet | Western "Battleship", 10x10. Fleet: Carrier(5), Battleship(4), Cruiser(3), Submarine(3), Destroyer(2) = 5 ships, 17 cells. |
| Adjacency | Ships **may** touch / abut. No "halo" rule. Overlap is always illegal. |
| Turn rule | Strict alternation: the turn passes after every shot, hit or miss. |
| Placement | Simultaneous, secret, timed. Both players arrange their fleet at once; battle starts when both are ready or the window expires (server auto-places the unready). A "Randomize" button generates a legal fleet; manual arrangement is also allowed. |
| Placement timer | Reuse the existing turn timer. `currentRole` returns the next not-ready role during placement; `reduce` accepts a `place` from either player anytime. Default window is the existing 15s first-turn limit. A longer (e.g. 30s) window is a future optional `turnLimitMs` hook, out of scope for v1. |
| Win | All 17 of the opponent's ship cells hit. No draws. |
| Board size / fleet as config | Fixed for v1 (no lobby config form exists on the branch). `configFields` stays empty; values are hardcoded in `createInitialState` and constants. |

## 3. What the platform already provides (do NOT rebuild)

Confirmed by reading the code. These are inherited for free and must not be reimplemented:

- **Turn FSM, whose-turn, game-over, winner.** The engine's `currentRole(state)` and the `Outcome` returned by `reduce()` are the source of truth; `apps/server/src/realtime/turn-based.ts` orchestrates turn advancement (`currentRoleOf`, `scheduleNext`, `finalize`, winner -> userId, stat bumps).
- **Move pipeline.** `make_move` runs `moveSchema.safeParse -> stateSchema.safeParse -> engine.reduce -> persist move -> update game_state -> emit`. Same `join_room` / `make_move` / `leave_room` / `game_state` events for every game.
- **Authoritative persistence.** `game_state` JSONB is the truth, written after each `reduce` (`turn-based.ts`). The `move` table is an audit trail; state is not rebuilt by replay.
- **Reconnection.** On `join_room`, `emitFullState` sends the current `game_state` plus the `moves[]` history. Reconnect "just works".
- **Turn timer / auto-move / abort.** `apps/server/src/realtime/turn-timer.ts`: 15s first turn, 5s base, minus 1s per timeout strike, min 1s, auto-move below 3 strikes, abort at 3. The engine only supplies `autoMove(state, role)`.
- **Seating, roles, lifecycle.** `ensureSeated` assigns `engine.roles[players.length]`, flips `waiting -> active` at `minPlayers`, calls `createInitialState` with all seats. The `game` / `move` / `game_player` tables, the web game page, lobby, play view, in-chat game card, and matchmaking are all generic.

## 4. The one gap: hidden information

### 4.1 Confirmed problem

The server broadcasts one full, identical `game_state` to every socket in the room:

- `apps/server/src/realtime/rooms.ts` emits unconditionally: `io.to(gameRoom(gameId)).emit(event, payload)`, no recipient branching.
- `apps/server/src/api/serialize.ts` copies `gameState` through verbatim.
- The `GameEngine` interface (`packages/shared/src/types/games/engine.ts`) has no projection method; `reduce`'s context is `MoveContext = { role: string }`.

So if both fleets live in `game_state`, the opponent receives the ship coordinates on the first `game_state` event. Client-side masking is not viable: the secret bytes are already in the opponent's browser. Redaction must happen server-side, before broadcast.

### 4.2 Solution: optional `viewFor` engine hook + per-recipient emit

Add one optional method to `GameEngine`, parallel to `autoMove` / `currentRole`:

```ts
viewFor?(state: State, role: string): State;
```

The engine holds the full truth in `game_state`. `viewFor(state, role)` returns a redacted copy where the opponent's un-revealed ships are removed. The server calls it per recipient just before emit. The redaction logic lives entirely in `games-core` (game logic), keeping the server game-agnostic. When `viewFor` is absent (tic-tac-toe and every fully-observable game), the server falls back to the existing single broadcast: zero behavior change.

The architecture docs already name this exact extension point ("`serialize(state, forRole)` could strip parts before broadcast"), so this is a sanctioned platform change, not a workaround.

### 4.3 Schema implication: one permissive `stateSchema`, fleet-completeness enforced in `reduce`

The redacted view must still validate against the single `stateSchema` so the client can parse it. The view differs from the truth only by containing FEWER ships in the opponent slot. Therefore `stateSchema` must NOT encode "each fleet has exactly the 5 ships of the standard composition" as a state invariant, because a redacted view legitimately has fewer (or zero) opponent ships. Instead:

- `stateSchema` validates structural shape: arrays of in-bounds coordinates, well-formed ships, valid phase, etc.
- Fleet completeness (exact multiset of ship lengths, straightness, no overlap) is enforced by `reduce` when it processes a `place` move, not as a standing state invariant.

This resolves the recon's open question: a single schema, permissive enough that both the full state and any redacted view validate.

## 5. Game model (schemas in `@kyzen/shared`)

Constants (`packages/shared/src/constants/games.ts`): add `export const SEA_BATTLE = "sea-battle";` and append to `GAME_TYPES`. Board size and fleet composition as constants in the sea-battle types module.

```
BOARD_SIZE = 10
FLEET = [
  { name: "carrier",    length: 5 },
  { name: "battleship", length: 4 },
  { name: "cruiser",    length: 3 },
  { name: "submarine",  length: 3 },
  { name: "destroyer",  length: 2 },
]
roles = ["A", "B"]
```

### 5.1 State

```ts
type Coord = { row: number; col: number };      // 0..9 each
type Ship  = { cells: Coord[] };                // contiguous, straight
type Shot  = { row: number; col: number; hit: boolean };

type SeaBattleState = {
  phase: "placement" | "battle";
  fleets: { A: Ship[]; B: Ship[] };             // each player's own ships; SECRET, redacted by viewFor
  shots:  { A: Shot[]; B: Shot[] };             // shots fired AT that role (public results)
  ready:  { A: boolean; B: boolean };
  currentTurn: "A" | "B";                       // meaningful only in "battle"
};
```

Notes:
- `shots.A` are the cells player B fired at A (so A's own board shows incoming hits/misses; A's tracking board reads `shots.B`).
- A ship is sunk when every one of its cells appears as a `hit` shot against its owner. Sunk is derived, not stored.

### 5.2 Move (discriminated union)

```ts
type SeaBattleMove =
  | { kind: "place"; ships: { cells: Coord[] }[] }
  | { kind: "fire";  row: number; col: number };
```

`moveSchema = z.discriminatedUnion("kind", [...])`, strict. A whole fleet is placed in a single `place` move (Randomize fills all; manual arranges all; submit once).

### 5.3 Config

`configSchema = z.object({}).strict()`. `configFields = []`. Fixed board and fleet for v1.

## 6. Engine behavior (`@kyzen/games-core`)

`ticTacToeEngine` is the structural template. `mode = "turn-based"`, `minPlayers = 2`, `maxPlayers = 2`, `roles = ["A", "B"]`.

### 6.1 `createInitialState(seats)`

Returns a fresh object each call (conformance requires this):

```
{ phase: "placement", fleets: { A: [], B: [] }, shots: { A: [], B: [] }, ready: { A: false, B: false }, currentTurn: "A" }
```

### 6.2 `reduce(state, ctx, input)`

Total over its result type, pure, no input mutation. Dispatch on `input.kind`:

**`place`** (legal only when `phase === "placement"` and `!ready[ctx.role]`):
1. Validate the submitted fleet: exactly the FLEET multiset of lengths; each ship's cells are a straight, contiguous, in-bounds line; no overlap among the player's own ships. (Ships may touch, so no cross-ship adjacency check.)
2. Store `fleets[ctx.role] = ships`, set `ready[ctx.role] = true`.
3. If both ready, flip `phase = "battle"` (keep `currentTurn = "A"`).
4. Outcome `{ status: "active" }`.
5. Reject (with a reason) on illegal fleet, double-place, or wrong phase.

**`fire`** (legal only when `phase === "battle"`, `ctx.role === currentTurn`, target in bounds, not already fired by this role):
1. Determine `opp = other(ctx.role)`. Compute `hit = fleets[opp]` covers `(row, col)`.
2. Append `{ row, col, hit }` to `shots[opp]`.
3. Strict alternation: set `currentTurn = opp` (always, hit or miss).
4. Win check: if every cell of every ship in `fleets[opp]` is now a hit in `shots[opp]`, outcome `{ status: "completed", winnerRole: ctx.role, draw: false }`. Else `{ status: "active" }`.
5. Reject firing out of turn, in the wrong phase, out of bounds, or at an already-fired cell (do not consume the turn).

Idempotency / double-submit: a second `place` from a ready player and a repeat `fire` are rejected, matching the platform's existing reject-without-applying behavior.

### 6.3 `currentRole(state)`

- `placement`: return the first not-ready role (`!ready.A ? "A" : "B"`). This anchors the existing turn timer; it does NOT restrict who may place (reduce allows either role to place).
- `battle`: return `currentTurn`.
- terminal: return `null`.

### 6.4 `autoMove(state, role)`

- `placement`: return a `place` move with a randomly generated legal fleet (rejection-sample placements; ships may touch so convergence is trivial).
- `battle`: return a `fire` at a random cell not yet fired by `role` at the opponent (not present in `shots[other(role)]`).

This powers timeout auto-fill and the platform's abort logic with no special-casing in the server.

### 6.5 `viewFor(state, role)`

Returns a state of the same schema, redacted for `role`:
- `fleets[role]`: full (a player sees their own ships).
- `fleets[opp]`: only the opponent ships that are fully sunk (so the player can draw sunk ships). Un-sunk opponent ships are omitted entirely.
- `shots.A`, `shots.B`: both kept (a player is entitled to its incoming shots and its own shot results; both are public information).
- `ready`, `phase`, `currentTurn`: kept (the player may see that the opponent is ready, but not the placement).
- Spectators (a role not in `roles`): both fleets fogged (only sunk ships, or nothing).
- After terminal, the server may emit the full unredacted state so both boards reveal (see 7.3).

The player cannot derive un-hit opponent ship positions: un-sunk opponent ships are absent, and `shots[opp]` only encodes the cells the player already fired.

## 7. Server integration

Three generic platform files change. All other server code is untouched.

### 7.1 `packages/shared/src/types/games/engine.ts`

Add the optional `viewFor?(state: State, role: string): State` to the `GameEngine` interface. Optional, so existing games are unaffected.

### 7.2 `apps/server/src/realtime/rooms.ts`

Add a per-recipient emit helper alongside `emitToGame`. It resolves the sockets in the game room (`io.in(room).fetchSockets()`), and for each socket builds a payload from `socket.data.userId -> player.role -> def.engine.viewFor(state, role)`, then `socket.emit(event, payload)`. Sockets without a seat (spectators) get the fogged view.

### 7.3 `apps/server/src/realtime/turn-based.ts`

At the two emit sites (`applyMove` and `emitFullState`), branch: if `def.engine.viewFor` exists, use the per-recipient helper; otherwise keep the existing single `emitToGame` (no behavior change for tic-tac-toe). Two further points:
- **Redact `moves[]`.** `emitFullState` also sends the move history. The opponent's `place` move payload (ship coordinates) must not reach the other player. Redact the per-recipient `moves[]` so a player never receives the opponent's `place` move data (strip or blank it). Spectators get all `place` payloads stripped.
- **Reveal on game over.** When the game is terminal, the per-recipient view may return the full state so both players see the complete enemy fleet on the result screen.

The Sea Battle client renders from `game_state`, NOT by replaying `moves[]`. This is the one deliberate departure from the tic-tac-toe replay precedent (`buildStateAtStep`), and it is necessary because the move history is intentionally incomplete per recipient.

## 8. Client board (`@kyzen/games-client`)

One `"use client"` component plus a skeleton, registered by `type` in `REGISTRY` and `SKELETON_REGISTRY` (both are `Record<GameType, ...>`, so a missing entry is a compile error). It receives the standard `GameClientProps` (`gameId`, `userId`, `socket`, `connected`, `initialGame`, `initialMoves`, `onViewProfile`), maps `userId -> role` exactly as tic-tac-toe does, and renders from the redacted `game_state` it receives over `game_state` events.

Two phase-driven sub-views:
- **Placement view**: a 10x10 grid with drag-to-place and rotate for each ship, a prominent **Randomize** button (generates a legal fleet locally), and a **Ready** button (emits `make_move { kind: "place", ships }`). During placement the client ignores `currentRole` for turn display and shows "Place your fleet" for both players, with a countdown ring (reusing the existing turn-timer display) fed by `turnDeadline`.
- **Battle view**: the player's own fleet board (ships + incoming hits/misses from `shots`) and a firing/tracking board (the player's shots on the opponent, hit/miss/sunk), emitting `make_move { kind: "fire", row, col }` on the active turn. Sunk opponent ships render from the `fleets[opp]` sunk-ship reveal.

Cover art (and optional tutorial video) live under `apps/web/public/games/` at the path referenced by `meta`.

## 9. Touch-points (file checklist)

Per-game (standard template):
1. `packages/shared/src/constants/games.ts` - add `SEA_BATTLE` slug; append to `GAME_TYPES`.
2. `packages/shared/src/types/games/sea-battle/schemas.ts` - strict `stateSchema`, `moveSchema` (discriminated union), `configSchema`; inferred types; board/fleet constants.
3. `packages/shared/src/types/games/index.ts` - re-export sea-battle schemas and types.
4. `packages/games-core/src/games/sea-battle/engine.ts` - engine: `createInitialState`, `reduce`, `currentRole`, `autoMove`, `viewFor`.
5. `packages/games-core/src/games/sea-battle/meta.ts` - `GameMeta` (name, description, categoryId, coverImage, howToPlay, optional tutorialVideo).
6. `packages/games-core/src/games/sea-battle/index.ts` - `seaBattleDefinition` bundling engine + meta + schemas + empty `configFields`.
7. `packages/games-core/src/games/index.ts` - append `seaBattleDefinition` to `GAMES`.
8. `packages/games-core/src/index.ts` - export new public symbols.
9. `packages/games-client/src/games/sea-battle/client.tsx` - the board (placement + battle views).
10. `packages/games-client/src/games/sea-battle/skeleton.tsx` - loading skeleton.
11. `packages/games-client/src/registry.ts` - register board and skeleton.
12. `apps/web/public/games/` - cover image (and optional tutorial mp4).

Platform (hidden information):
13. `packages/shared/src/types/games/engine.ts` - add optional `viewFor?`.
14. `apps/server/src/realtime/rooms.ts` - per-recipient emit helper.
15. `apps/server/src/realtime/turn-based.ts` - branch on `viewFor` at the two emit sites; redact `moves[]`; reveal on game over.

Docs (a missing game doc fails `game-docs.test.ts`):
16. `docs/games/sea-battle.md` - rules, roles, win/illegal-move rules, state/move shapes mirroring the schemas, `configFields`.
17. `docs/architecture/games-core-engine.md`, `docs/architecture/generic-game-schema.md`, `docs/architecture/realtime.md` - document the `viewFor` projection hook and per-recipient broadcast.
18. `.claude/agents/game-builder.md` - teach the hidden-information pattern.

Tests:
19. `packages/games-core/tests/sea-battle.test.ts` - focused engine tests (see section 10).
20. `packages/shared/tests/` - schema-strictness tests for the discriminated-union move and strict state/config schemas.

Conformance (`packages/games-core/tests/conformance.test.ts`), registry parity (`packages/games-client/tests/registry.test.ts`), and game-docs (`packages/games-core/tests/game-docs.test.ts`) pick up the new game automatically once it is in `GAMES` plus the registries plus docs.

## 10. Testing plan

The conformance suite covers purity, determinism, fresh-state allocation, schema strictness, role coherence, and that `autoMove` returns a move `reduce` accepts. It does NOT exercise hidden information, so the focused suite must:

- **Placement legality**: reject overlap, out-of-bounds, non-straight ships, wrong fleet composition; accept a valid fleet and a Randomize-generated fleet.
- **Phase gating**: reject `fire` during placement; reject `place` during battle; reject double-place; reject `place` from a ready player.
- **Simultaneous placement**: either role may place first; both placing flips `phase` to `battle`.
- **Battle resolution**: hit, miss, repeated-fire rejection (turn not consumed), strict alternation after every shot, out-of-turn rejection.
- **Sink and win**: a ship sinks when its last cell is hit; the game completes with the correct `winnerRole` when the last enemy ship sinks; post-terminal moves rejected.
- **`viewFor` redaction (the critical hidden-info test)**: from B's projected view, A's un-hit ship positions are not derivable (un-sunk A ships absent; only A's incoming shots and sunk ships visible); symmetric for A's view of B; spectator view fogs both; terminal reveals both.
- **`autoMove` legality**: placement auto-move yields a legal fleet; battle auto-move targets only un-fired cells.

Schema tests assert the discriminated-union `moveSchema` rejects junk and unknown `kind`, and that strict schemas reject extra keys.

## 11. DRY and shared-logic notes

- The turn timer is reused untouched; Sea Battle inherits the 15s/5s/-1 behavior purely by implementing `currentRole`. No extraction needed, the mechanism is already game-agnostic.
- The placement window reuses the same turn-timer path (via `currentRole` returning the next not-ready role); no parallel timer is built.
- `viewFor` is a generic, optional platform hook that every future hidden-information game reuses.
- Any genuinely shared grid/coordinate helpers (in-bounds checks, coordinate keys, straight-line validation) go in a shared util within the sea-battle module or a small shared helper, rather than being duplicated. Tic-tac-toe and Sea Battle share little game logic beyond this; the shared surface is the platform machinery, which is already shared.

## 12. Out of scope for v1

- Configurable board size, configurable fleet, salvo mode, fog/scan power-ups, extra-turn-on-hit (strict alternation only).
- A 30s dedicated placement window (default to the existing 15s first-turn reuse; a `turnLimitMs` engine hook can add it later).
- A lobby config form (none exists on the branch; `configFields` stays empty).
- A tutorial video (the `game-tutorial-builder` flow can add one later from `docs/games/sea-battle.md`).

## 13. Risks and mitigations

- **Moves-history leak**: the opponent's `place` payload must be stripped per recipient. Mitigation: redact `moves[]` in `emitFullState`; the client renders from `game_state`, not the move log. Covered by a focused test.
- **Schema rigidity vs redacted views**: avoided by keeping `stateSchema` permissive and enforcing fleet completeness in `reduce` (section 4.3).
- **Spectators**: the per-recipient emit must fog both fleets for seatless sockets; a spectator must never receive an un-sunk ship.
- **Platform-file change scope**: the three generic file edits are gated behind the optional `viewFor` hook, so existing games are provably unaffected (fallback to the current single broadcast when `viewFor` is absent).
