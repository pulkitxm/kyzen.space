# Monopoly

**Type slug:** `monopoly`
**Category:** `board-classics`

> Buy properties, build houses, and bankrupt your opponents in this classic board game.

## How to play

Players roll two dice to move clockwise around a circular board of 32 tiles. 
- Land on unowned properties, railroads, or utilities to buy them.
- Land on owned properties to pay rent to the owner. Rent increases if the owner owns the entire color group, or has built houses or hotels.
- Draw Chance or Community Chest cards that apply positive or negative rewards.
- Land on Go to Jail, roll doubles three times, or draw a Go to Jail card to go to Jail. Exit by rolling doubles, paying $50, or using a Get Out of Jail Free card.
- Bankrupt all other players to win.

## Players and roles

- **Player count:** 2 to 8 players (`minPlayers` 2, `maxPlayers` 8).
- **Roles:** `p1` through `p8` (sequential seating).
- **Mode:** turn-based. Play rotates sequentially through the seated active players.

## Outcomes

- **Win:** only one active player remains who is not bankrupt. That player's role is the winner; `draw` is false.
- **Illegal move (rejected, no state change):**
  - the game has already ended,
  - the actor is not a player in the game,
  - it is not the actor's turn,
  - the move fails schema validation (missing/extra keys, invalid action structures), or
  - the player does not have enough balance to perform the action.

## State shape

See `packages/shared/src/types/games/monopoly/schemas.ts` for full Zod structure:
- `board`: list of 32 tiles.
- `players`: list of player statuses (balance, position, ownedProperties, inJail, isBankrupt).
- `currentPlayerIndex`: index of player whose turn it is.
- `turnPhase`: WAITING_FOR_ROLL, LANDED, WAITING_FOR_END_TURN, GAME_OVER.
- `dice`: tuple of last rolled values.
- `chanceDeck` & `communityDeck`: card stacks.
- `log`: history of actions.
- `winnerId`: role ID of the winner.

## Move shape

Monopoly moves are a discriminated union of type-safe actions:
- `ROLL_DICE` (carries payload with rolled dice `die1` and `die2`),
- `BUY_PROPERTY`,
- `DECLINE_PURCHASE`,
- `BUILD_HOUSE` (carries target `tileId`),
- `SELL_HOUSE` (carries target `tileId`),
- `MORTGAGE_PROPERTY` (carries target `tileId`),
- `UNMORTGAGE_PROPERTY` (carries target `tileId`),
- `PAY_JAIL_FINE`,
- `USE_OUT_OF_JAIL_CARD`,
- `DRAW_CARD`,
- `DECLARE_BANKRUPTCY`,
- `END_TURN`.

## Board UI

The Monopoly UI resides in `packages/games-client/src/games/monopoly/` and is lazy-loaded by the game lobby.
- **Live play:** Syncs visual state through a local `displayedState`. When a roll is made, walks the player token step-by-step with sound effects. Auto-draws cards and auto-ends turns if the active player is idle.
- **Replay:** Scrub through match history move-by-move (temporarily commented out/disabled).
- **Layout:** Declares `layoutWidth: "max-w-6xl"` in `meta.ts` to provide a wider board container on the play screen.

## Source

- Engine: `packages/games-core/src/games/monopoly/`
- Schemas + types: `packages/shared/src/types/games/monopoly/schemas.ts`
- Type slug constant `MONOPOLY`: `packages/shared/src/constants/games.ts`
- Board UI + skeleton: `packages/games-client/src/games/monopoly/`
- Client + skeleton registration: `packages/games-client/src/registry.ts`
