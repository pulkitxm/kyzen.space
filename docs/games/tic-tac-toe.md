# Tic-tac-toe

**Type slug:** `tic-tac-toe`
**Category:** `board-classics`

> Classic 3×3 board. Line up three in a row to win.

## How to play

Two players share a 3×3 grid. Player **X** always moves first, after which
turns alternate. On your turn you place your mark in one empty cell. The first
player to line up three of their marks in a row (horizontally, vertically, or
diagonally) wins. If all nine cells fill up with no such line, the game is a
draw.

A four-step player-facing summary of these rules lives in `meta.howToPlay`
(`packages/games-core/src/games/tic-tac-toe/meta.ts`) and renders in the game
page's "How to play" card.

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
receives a `GameClientProps` (`packages/games-client/src/types.ts`) - including
`gameId` (the public **room code** from the `/play/<code>` URL, echoed back on
`join_room`/`make_move`/`leave_room`; the internal game UUID never reaches the
client), `userId`, the **shared** `socket`, `connected`, `initialGame`, and
`initialMoves`. It does **not** open its own socket connection; it rides the same
Socket.IO connection the chat lane uses, passed down as a prop.

- **Live play** (status `waiting`/`active`): the board emits `join_room` on the
  shared socket, then listens for `game_state` and `game_error`.
  Tapping an empty cell emits `make_move` with `{ gameId, moveData: { row, col } }`
  (only when it is your turn and the socket is connected). It emits `leave_room`
  on cleanup. A `StatusDot` reflects `connected`.
- **Replay** (status `completed`/`abandoned`): live socket wiring is skipped and a
  `ReplayToolbar` lets you scrub the game. `buildStateAtStep` replays
  `initialMoves` (sorted by `moveNumber`) up to the chosen step to reconstruct the
  board. Arrow keys step prev/next and Space toggles autoplay (`REPLAY_MS` = 850ms
  per step).
- **Marks** render as themed, hand-authored SVG (`TttMark`, `marks.tsx`) rather
  than plain text - a chunky outlined ✕ and ◯ recoloured from theme tokens (✕ =
  `--primary`, ◯ = `--muted-foreground`, each outlined with a darker shade of its
  own colour, so it reads in light and dark). An empty cell shows a faint ghost of
  *your* mark on hover while it is your turn. A shared sheen gradient
  (`TttMarkDefs`) is rendered once per board.
- **Winning line** - when the game ends with a winner, a strike-through line
  (`WinStrike`, an absolute SVG overlay on the grid) is drawn through the three
  winning cells in the winner's colour. The draw is an `m.line` spring
  (`pathLength` 0 → 1, from `motion/react`) that plays **once**, and only on a
  *transition* into the won state - a live win, or a replay reaching the deciding
  move. A game opened already-finished renders the line **statically**
  (`initial={false}`, no animation), so revisiting a result doesn't re-animate.
  The state machine lives in `client.tsx` (a render-phase comparison of the
  current vs. previous winning-line key).
- **No snap on load** - the board is server-rendered: the registry imports the
  board component eagerly (not via `React.lazy`), so opening a finished game shows
  its final position (marks + the static winning line) in the first paint, with no
  board-skeleton flash.
- **Player bar** (`player-bar.tsx`) sits above the grid: each player's **avatar**
  + username + their mark, with the active player's chip highlighted (whose turn
  it is). Avatars render through a games-client `Character`
  (`packages/games-client/src/ui/character.tsx`, DiceBear avataaars) from the
  `avatar` now carried on each player - the player payload was extended end-to-end
  (`getPlayers` left-joins `user_profile`; `avatar?: AvatarConfig | null` added to
  the shared `GamePlayer` type, `gamePlayerSchema`, and `GameClientProps`).
- **Replay controls** use `react-icons/fa6` (`FaBackwardStep`, `FaChevronLeft`,
  `FaPlay`/`FaPause`, `FaChevronRight`, `FaForwardStep`); the ✕/◯ glyphs are the
  one hand-authored decorative SVG, the same raw-SVG exception the playing-cards
  use.
- **Sound** - the board uses the shared `useGameAudio()` hook
  (`@gamelobby/games-client`, see [audio.md](../architecture/audio.md)). All sounds
  are audio files (no synthesis). A **hover** sound (`onMouseEnter`) and a
  **touch** sound (`onClick`) fire only on a **playable** cell (empty, your turn,
  in a live game) guarded by the same `playable` flag that drives the cell's
  `disabled` state, so a finished game (and replay) has no playable cells and
  hovering/clicking its boxes is **silent**. The **opponent's** move plays the
  touch sound too - it arrives over the socket (not a local click), so the board
  fires the sound when the live board gains a mark that isn't the move you just
  made (de-duped via the post-move `currentTurn` flip; spectators hear every
  move). Replay *playback* is audible, though:
  each move replayed forward - autoplay or stepping next (`→`) - plays the
  **touch** sound (going back or jumping to first/last is silent). The
  **win**/**draw** sound plays **exactly once, live only**: a `useEffect` keyed on
  `game.status`/`game.winner`
  fires on a `waiting|active → completed` transition seen within the session
  (guarded by a once-only ref), so a finished game opened fresh (no transition) and
  replay scrubbing (which changes `replayStep`, not `game.status`) both stay
  silent. All of these honour the game-sound volume/mute channel. **Background
  music** is a separate channel: a looping, **crossfaded** jazz track
  (`apps/web/public/sounds/tic-tac-toe-bg.ogg`, registered in `gameMusicSource`)
  streamed through the audio engine; it starts after the first interaction
  (browser autoplay policy) and is controlled by the gear's *Background music*
  slider/mute.

A loading placeholder, `TicTacToeSkeleton`
(`packages/games-client/src/games/tic-tac-toe/skeleton.tsx`), is registered in
`SKELETON_REGISTRY` and renders as the board's `<Suspense>` fallback.

## Game-over & rematch

The result/rematch experience is **platform-provided**, not part of the board:
the play page mounts a `GameOverOverlay`
(`apps/web/app/play/[gameId]/game-over-overlay.tsx`) over the board that
auto-opens when the game completes (and on revisit of a finished game), shows the
outcome banner, and (once a rematch series exists) the series scoreboard and a
**View series** modal. **Rematch** re-invites the same two players into a new
game in the same conversation, linked by a shared `seriesId`, with the **loser
moving first** (`X`) and a draw swapping the previous game's first mover. Each
game (the first and every rematch) posts its own chat game card; once the series
has ≥ 2 games the card shows the wins/draws scoreboard. At most one
`waiting | active` tic-tac-toe game exists per conversation at a time. The flow
and data model are in [realtime.md](../architecture/realtime.md),
[server-api.md](../architecture/server-api.md), and
[web.md](../architecture/web.md).

## Source

- Engine and meta: `packages/games-core/src/games/tic-tac-toe/`
- Schemas + types (`stateSchema`/`moveSchema`/`configSchema`): `packages/shared/src/types/games/tic-tac-toe/schemas.ts`
- Type slug constant `TIC_TAC_TOE`: `packages/shared/src/constants/games.ts`
- Board UI + skeleton: `packages/games-client/src/games/tic-tac-toe/`
- Client + skeleton registration: `packages/games-client/src/registry.ts`
