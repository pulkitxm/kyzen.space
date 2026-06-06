# Tic-tac-toe

**Type slug:** `tic-tac-toe`
**Category:** `board-classics`

> Classic 3×3 board. Get three in a row to win.

## How to play

Two players share a 3×3 grid. Player **X** always moves first, after which
turns alternate. On your turn you place your mark in one empty cell. The first
player to line up three of their marks in a row — horizontally, vertically, or
diagonally — wins. If all nine cells fill up with no such line, the game is a
draw.

## Players and roles

- **Player count:** exactly 2 (`minPlayers` 2, `maxPlayers` 2).
- **Roles:** `X` and `O`.
- **Mode:** turn-based. `X` takes the first turn; play then alternates `X` → `O`
  → `X` → … until the game ends.

## Outcomes

- **Win:** a player owns one of the eight winning lines (three rows, three
  columns, two diagonals). That player's role is the winner; `draw` is false.
- **Draw:** the board is full and no winning line exists. There is no winner;
  `draw` is true.
- **Illegal move (rejected, no state change):**
  - the game has already ended,
  - the actor is neither `X` nor `O`,
  - it is not the actor's turn,
  - the move fails schema validation (missing/extra keys, non-integer or
    out-of-range coordinates), or
  - the target cell is already occupied.

## State shape

```ts
{
  board: (("X" | "O") | null)[];
  currentTurn: "X" | "O";
}
```

- `board` is exactly **9** cells, indexed `0..8`. A cell holds `"X"`, `"O"`, or
  `null` (empty). The cell for a `(row, col)` move is `row * 3 + col`.
- `currentTurn` is the role whose turn it is to play next.

The initial state is an all-`null` board with `currentTurn` set to `"X"`.

## Move shape

```ts
{
  row: number;
  col: number;
}
```

- `row` and `col` are integers in `0..2` (inclusive).
- The schema is **strict**: unknown keys are rejected.

## Config

None. The config schema is an empty **strict** object (`{}`), so any extra
fields are rejected.

## Board UI

`TicTacToeGameClient` (`packages/games-client/src/games/tic-tac-toe/client.tsx`)
receives a `GameClientProps` (`packages/games-client/src/types.ts`) — including
`gameId`, `userId`, the **shared** `socket`, `connected`, `initialGame`, and
`initialMoves`. It does **not** open its own socket connection; it rides the same
Socket.IO connection the chat lane uses, passed down as a prop.

- **Live play** (status `waiting`/`active`): the board emits `join_room` on the
  shared socket, then listens for `game_state`, `move_made`, and `game_error`.
  Tapping an empty cell emits `make_move` with `{ gameId, moveData: { row, col } }`
  (only when it is your turn and the socket is connected). It emits `leave_room`
  on cleanup. A `StatusDot` reflects `connected`.
- **Replay** (status `completed`/`abandoned`): live socket wiring is skipped and a
  `ReplayToolbar` lets you scrub the game. `buildStateAtStep` replays
  `initialMoves` (sorted by `moveNumber`) up to the chosen step to reconstruct the
  board. Arrow keys step prev/next and Space toggles autoplay (`REPLAY_MS` = 850ms
  per step).
- **Icons** come from `react-icons/fa6` (`FaBackwardStep`, `FaChevronLeft`,
  `FaPlay`/`FaPause`, `FaChevronRight`, `FaForwardStep`) — no hand-written SVG.

A loading placeholder, `TicTacToeSkeleton`
(`packages/games-client/src/games/tic-tac-toe/skeleton.tsx`), is registered in
`SKELETON_REGISTRY` and renders as the board's `<Suspense>` fallback.

## Source

- Engine and meta: `packages/games-core/src/games/tic-tac-toe/`
- Schemas + types (`stateSchema`/`moveSchema`/`configSchema`): `packages/shared/src/types/games/tic-tac-toe/schemas.ts`
- Type slug constant `TIC_TAC_TOE`: `packages/shared/src/constants/games.ts`
- Board UI + skeleton: `packages/games-client/src/games/tic-tac-toe/`
- Client + skeleton registration: `packages/games-client/src/registry.ts`
