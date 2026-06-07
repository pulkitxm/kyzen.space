# Old Maid

**Type slug:** `old-maid`
**Category:** `party`

> Draw mystery cards, shed pairs, and avoid the final Joker.

## How to play

Old Maid is implemented here as a two-player friend game. The deck starts from a
standard 52-card deck, adds one Joker, and removes the Queen of Spades. That
leaves 52 cards total: 25 rank pairs, one unpaired Queen, and the Joker. The
Joker is the Old Maid and never forms a pair.

The server shuffles the deck with a stored seed, deals every card face-down, and
automatically removes all starting pairs from both hands before the first turn.
On your turn, you pick one face-down card from the other player's fan. If the
drawn card matches a rank already in your hand, that pair is discarded
immediately. If either hand becomes empty, that player is safe. When only one
player still has cards, that player is the Old Maid and loses.

The original table game supports larger groups, but the current platform starts a
game as soon as the minimum player count joins. This version therefore ships with
exactly two seats so the existing friend challenge flow can start and finish
cleanly.

## Players and roles

- **Player count:** exactly 2 (`minPlayers` 2, `maxPlayers` 2).
- **Roles:** `P1` and `P2`.
- **Mode:** turn-based. `P1` draws first; play alternates between active players
  until one player is left holding cards.

## Outcomes

- **Win:** your hand is empty when the game ends. In the two-player version there
  is exactly one winner.
- **Loss:** you are the final player with cards after the other player empties
  out. `loserRole` is set to your role.
- **Draw:** impossible.
- **Illegal move (rejected, no state change):**
  - the game has already ended,
  - the actor is neither `P1` nor `P2`,
  - it is not the actor's turn,
  - the move fails schema validation (missing/extra keys, non-integer or
    out-of-range card index), or
  - the selected card index does not exist in the opponent's fan.

## State shape

```ts
{
  activeRoles: ("P1" | "P2")[];
  currentTurn: "P1" | "P2";
  deckSeed: string;
  discardedPairs: {
    byRole: "P1" | "P2";
    cards: [OldMaidCard, OldMaidCard];
    phase: "initial" | "draw";
    rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  }[];
  hands: {
    P1: OldMaidCard[];
    P2: OldMaidCard[];
  };
  lastDraw: {
    actorRole: "P1" | "P2";
    fromRole: "P1" | "P2";
    matchedRank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | null;
  } | null;
  loserRole: "P1" | "P2" | null;
  winnerRoles: ("P1" | "P2")[];
}
```

`OldMaidCard` is:

```ts
{
  id: string;
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "JOKER";
  suit: "S" | "H" | "D" | "C" | "JOKER";
}
```

- `activeRoles` contains players whose hands are not empty.
- `currentTurn` is the role that must draw next.
- `deckSeed` stores the seed used for the Fisher-Yates shuffle.
- `discardedPairs` contains all mandatory pair discards from setup and draw
  turns.
- `hands` stores each role's current cards.
- `lastDraw` records the latest draw and any rank that was immediately paired.
- `loserRole` is set only once the Old Maid is determined.
- `winnerRoles` contains roles whose hands are empty.

## Move shape

```ts
{
  cardIndex: number;
}
```

- `cardIndex` is an integer in `0..51` (inclusive).
- It indexes the opponent's current face-down fan.
- The schema is **strict**: unknown keys are rejected.

## Config

None. The config schema is an empty **strict** object (`{}`), so any extra
fields are rejected.

## Board UI

`OldMaidGameClient` (`packages/games-client/src/games/playingcards/old-maid/client.tsx`)
receives a `GameClientProps` (`packages/games-client/src/types.ts`) — including
`gameId`, `userId`, the **shared** `socket`, `connected`, `initialGame`, and
`initialMoves`. It does **not** open its own socket connection.

- **Live play** (status `waiting`/`active`): the board emits `join_room` on the
  shared socket, then listens for `game_state`, `move_made`, and `game_error`.
  Picking a card back emits `make_move` with `{ gameId, moveData: { cardIndex } }`
  only when it is your turn and the socket is connected. It emits `leave_room` on
  cleanup.
- **Cards:** your own hand is shown face-up; the other hand is rendered as card
  backs. The game state currently stores full hands in the shared game JSON, so
  the UI preserves table etiquette but the generic platform does not yet provide
  per-player redacted private state.
- **Icons** come from `react-icons/fa6` (`FaRegCircleQuestion`, `FaShuffle`,
  `FaUserCheck`) — no hand-written SVG.

A loading placeholder, `OldMaidSkeleton`
(`packages/games-client/src/games/playingcards/old-maid/skeleton.tsx`), is registered in
`SKELETON_REGISTRY` and renders as the board's `<Suspense>` fallback.

## Source

- Engine and meta: `packages/games-core/src/games/playingCards/old-maid/`
- Schemas + types (`stateSchema`/`moveSchema`/`configSchema`): `packages/shared/src/types/games/playingCards/old-maid/schemas.ts`
- Type slug constant `OLD_MAID`: `packages/shared/src/constants/games.ts`
- Board UI + skeleton: `packages/games-client/src/games/playingcards/old-maid/`
- Client + skeleton registration: `packages/games-client/src/registry.ts`
