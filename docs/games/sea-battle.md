# Sea Battle

**Type slug:** `sea-battle`
**Category:** `board-classics`

> Hide your fleet on a 10x10 grid, then sink the enemy before they sink you.

Sea Battle is the Western "Battleship" game: two captains secretly arrange a
fleet on a private 10x10 grid, then take turns firing at the opponent's grid
until one fleet is destroyed. It is a game of **hidden information** - your ship
positions are never sent to your opponent until those cells are hit.

## How to play

Each player has a private 10x10 grid (rows and columns 0..9). The game runs in
two phases:

1. **Placement.** Both players arrange the same fleet at the same time. You can
   tap **Randomize** for a legal layout, or place ships manually (pick an
   orientation, then click a cell to drop a ship; click a placed ship to remove
   it). Press **Ready** when your fleet is legal. Placement is secret and
   simultaneous - either captain may finish first, and the battle begins only
   once **both** are ready.
2. **Battle.** Captains alternate strictly. On your turn you fire at one cell of
   the enemy grid; the result is a **hit** (a ship occupies that cell) or a
   **miss**. The turn passes after every shot, hit or miss. A ship is **sunk**
   when all of its cells have been hit. You win when every cell of every enemy
   ship has been hit.

A short player-facing summary of these rules lives in `meta.howToPlay`
(`packages/games-core/src/games/sea-battle/meta.ts`) and renders in the game
page's "How to play" card.

### The fleet

Five ships, 17 cells in total:

| Ship | Length |
| --- | --- |
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

Ships are straight (horizontal or vertical) and contiguous. Ships **may** touch
or abut - there is no "halo"/no-adjacency rule. Overlap is always illegal, and
every cell must be on the board. The fleet and board size are fixed
(`SEA_BATTLE_BOARD_SIZE`, `SEA_BATTLE_FLEET` in
`packages/shared/src/constants/games.ts`); there is no lobby configuration.

## Players and roles

- **Player count:** exactly 2 (`minPlayers` 2, `maxPlayers` 2).
- **Roles:** `A` (seat 0) and `B` (seat 1).
- **Mode:** turn-based. Placement is simultaneous (not gated on whose turn it
  is); battle is strict alternation, starting with `A`.

## Outcomes

- **Win:** a player has hit every cell of every enemy ship. That player's role is
  the winner; `draw` is false.
- **Draw:** never. Sea Battle has no draws.
- **Illegal move (rejected, no state change):**
  - the move fails schema validation (unknown `kind`, missing/extra keys,
    non-integer or out-of-range coordinates),
  - the actor is neither `A` nor `B`,
  - the game has already ended,
  - a `place` arrives outside the placement phase, from a player who is already
    ready, or with an illegal fleet (wrong composition, a non-straight or
    non-contiguous ship, an out-of-bounds cell, or overlapping ships),
  - a `fire` arrives outside the battle phase, out of turn, at an off-board cell,
    or at a cell this player has already fired at.

A rejected move never consumes the turn.

## Hidden information

The authoritative `game_state` holds **both** fleets (the truth). Before
broadcasting, the server projects the state per recipient through the engine's
`viewFor(state, role)` hook and strips opponent move payloads, so a player never
receives the opponent's un-hit ship positions. `viewFor` returns a state of the
same schema in which the opponent's **non-sunk** ships are removed; sunk ships
are revealed (so they can be drawn), and both players' shots stay visible.
Spectators see both fleets fogged. Because a redacted view legitimately contains
fewer (or zero) opponent ships, the state schema does **not** require a complete
five-ship fleet - fleet completeness is enforced only inside `reduce` when a
`place` move is processed.

## State shape

```ts
{
  phase: "placement" | "battle";
  fleets: {
    A: { cells: { row: number; col: number }[] }[];
    B: { cells: { row: number; col: number }[] }[];
  };
  shots: {
    A: { row: number; col: number; hit: boolean }[];
    B: { row: number; col: number; hit: boolean }[];
  };
  ready: { A: boolean; B: boolean };
  currentTurn: "A" | "B";
}
```

- `phase` is `"placement"` until both players are ready, then `"battle"`.
- `fleets[role]` holds that player's own ships. A ship's `cells` are 1..5
  in-bounds coordinates (`row`/`col` integers in `0..9`). The array is **not**
  constrained to exactly five ships at the schema level (see "Hidden
  information"); `reduce` validates the standard composition on placement.
- `shots[role]` are the shots fired **at** that role - so `shots.A` are B's
  shots on A. A's own board shows incoming fire from `shots.A`; A's tracking
  board reads `shots.B`. A ship is sunk when every one of its cells appears as a
  `hit` shot; sunk is derived, not stored.
- `ready[role]` is whether that player has locked in a fleet.
- `currentTurn` is meaningful only during `battle`.

The initial state is an empty placement state: empty fleets and shots, both
players not ready, `currentTurn` `"A"`.

## Move shape

```ts
| { kind: "place"; ships: { cells: { row: number; col: number }[] }[] }
| { kind: "fire"; row: number; col: number }
```

- The move is a **strict discriminated union** on `kind`; unknown kinds and
  extra keys are rejected.
- A `place` move submits the whole fleet in one move.
- A `fire` move targets a single cell, `row`/`col` integers in `0..9`.

## Config

None. The config schema is an empty **strict** object (`{}`), so any extra
fields are rejected. `configFields` is `[]`.

## Board UI

`SeaBattleGameClient`
(`packages/games-client/src/games/sea-battle/client.tsx`) receives the standard
`GameClientProps` (`packages/games-client/src/types.ts`) - `gameId` (the public
room code), `userId`, the **shared** `socket`, `connected`, `initialGame`, and
`initialMoves` - and maps `userId` to a role via `game.players`. It does **not**
open its own socket; it rides the same Socket.IO connection the chat lane uses.
The board renders entirely from the redacted `game_state` it receives over
`game_state` events (it does **not** replay `initialMoves`, because the per-
recipient move history is intentionally incomplete).

- **Placement view** (`phase === "placement"`, you have not placed): a 10x10
  grid where you arrange your fleet. A **Randomize** button calls
  `generateRandomFleet()` from `@kyzen/games-core`; manual placement uses a
  horizontal/vertical rotate toggle and click-to-place (click a placed ship to
  remove it). The **Ready** button stays disabled until `validateFleet()`
  (also from `@kyzen/games-core`, shared with the engine) accepts the fleet, then
  emits `make_move { kind: "place", ships }`. Once you are ready it shows a
  "waiting for opponent" message until the phase flips.
- **Battle view** (`phase === "battle"`): two 10x10 grids - your fleet board
  (your ships plus incoming `shots[you]` as hit/miss) and a tracking/firing board
  (your shots on the opponent, hit/miss, with sunk enemy ships revealed from the
  `fleets[opp]` sunk-ship projection). On your turn, click an un-fired tracking
  cell to emit `make_move { kind: "fire", row, col }`. Whose-turn text and a turn
  countdown mirror tic-tac-toe.
- **Game over**: the server reveals the full state, so both fleets render and the
  winner is shown.
- **Art and icons**: ships, water, and hit/miss markers are drawn as inline
  decorative `<svg>` in the component (the repo's allowed exception for game art,
  not icons). Control glyphs (Randomize, rotate, Ready) use `react-icons/fa6`.
- **Sound**: the board uses the shared `useGameAudio()` hook - a touch sound on
  firing or taking incoming fire (live only), a hover sound on a playable
  tracking cell, and the win sound once on the live `active -> completed`
  transition (guarded by a once-only ref; there are no draws). Background music
  is a separate platform channel.

A loading placeholder, `SeaBattleSkeleton`
(`packages/games-client/src/games/sea-battle/skeleton.tsx`), is registered in
`SKELETON_REGISTRY` and renders as the board's `<Suspense>` fallback while the
lazy board chunk loads.

## Source

- Engine, meta, definition, and shared logic helpers:
  `packages/games-core/src/games/sea-battle/`
- Schemas + types (`stateSchema`/`moveSchema`/`configSchema`):
  `packages/shared/src/types/games/sea-battle/schemas.ts`
- Type slug constant `SEA_BATTLE` and board/fleet constants:
  `packages/shared/src/constants/games.ts`
- Board UI + skeleton: `packages/games-client/src/games/sea-battle/`
- Client + skeleton registration: `packages/games-client/src/registry.ts`
