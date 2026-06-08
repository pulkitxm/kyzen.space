# Rematch + Game-Over Experience

Date: 2026-06-08 · Branch: `feat/rematch-and-game-over`

## Goal

When a game finishes, surface the result and let players play again as a linked
**series**:

1. A **game-over modal** on the play page shows the outcome and (once a series
   exists) the running score. It auto-opens when a live game finishes and again
   on revisit of a finished game.
2. **Rematch** creates a new game linked to its predecessors via a shared
   `seriesId`, re-inviting the same roster with fair turn order.
3. The chat game card shows the **series score** (avatars over wins/draws) once a
   rematch exists.
4. A **View series** modal shows the full score plus a linked list of every game
   in the series.
5. At most **one in-progress game per game-type, per conversation**.

## Locked decisions

- **Linking:** a shared `seriesId` (not a predecessor pointer). Series score is a
  single flat query, no chain-walking.
- **Score format:** wins per player **plus** a draw tally.
- **Turn order on rematch:** **loser goes first** (2-player); draw → swap from the
  previous game's first mover. Isolated behind one seam so N-player can extend it.
- **Player count:** the data model + flow are **N-player-ready**; only the
  2-player turn-order logic is built now (tic-tac-toe is the only game today).
- **Series UI threshold:** the scoreboard and the **View series** button appear
  only when the series has **≥ 2 games** (`totalGames ≥ 2`). A never-rematched
  game shows a plain result.

## 1. Data model

Add one nullable column to the `game` table:

```
seriesId: uuid  →  self-FK game.id, ON DELETE set null
```

Semantics: `seriesId` is **the id of the first game in the series**.

- A brand-new game's series is itself: `seriesId = its own id`.
- A rematch copies its parent's `seriesId`.

So every game in a series (root included) shares one `seriesId`, and a series is
a single flat query: `WHERE series_id = X`.

> Implementation detail (settle in the plan): to set `seriesId = id` for a root
> game we either generate the game id in app code so the value is known at insert
> time, or set `seriesId = id` immediately after insert in the same transaction.
> This does not change the model.

Touches the strict-typing chain:

- `packages/database/src/schema.ts` — the column + self-FK.
- `packages/shared/src/types/db/index.ts` — `GameRow` (drift-guard asserts
  `game.$inferSelect` equals `GameRow`, so both must match).
- `packages/shared/src/types/db/io.ts` — `createGameInputSchema` /
  `CreateGameInput` gain an optional `seriesId`.

Migration generated via `drizzle-kit generate`; applied locally with `db:push`
(the dev DB is push-managed — `db:migrate` is not used locally).

## 2. Shared types (new)

In `@gamelobby/shared/types` (under `games/` for the series types; `chat/` for the
card-meta extension):

```ts
SeriesScoreEntry = { userId: string; username: string; wins: number }
SeriesScore      = { entries: SeriesScoreEntry[]; draws: number; completedGames: number; totalGames: number }
SeriesGameSummary = {
  gameId: string            // user-facing code, used in /play/{gameId}
  gameNumber: number        // 1-based position in the series, ordered by createdAt
  status: GameStatusDto     // waiting | active | completed | abandoned
  winner: string | "draw" | null
  winnerUsername: string | null
  completedAt: string | null
}
SeriesDetail = {
  seriesId: string
  gameType: GameType
  score: SeriesScore
  games: SeriesGameSummary[]
}
```

- `GameCardMeta` gains `seriesScore?: SeriesScore`. The card renders the
  scoreboard only when `seriesScore` is present **and** `totalGames ≥ 2` — i.e. a
  rematch exists (see §5). `completedGames` (= sum of `wins` + `draws`) is the
  score's denominator; `totalGames` counts every game in the series, including the
  in-progress one, which is what gates the series UI.
- `CHAT_EVENTS` gains:
  - `rematch` — client → server, payload `{ gameId }`, acks the new game's code.
  - `rematchCreated` — server → the *old* game room, payload `{ newGameId }`.
- Socket-event types in `chat/socket-events.ts` for both.

## 3. Server — rematch flow

New handler for `game:rematch { gameId }` (ack returns the new game's code, or an
error), implemented alongside the existing in-chat game handlers and reusing the
`games-in-chat-service` internals:

1. Load the finished game; require `status === "completed"` and that the requester
   was one of its players.
2. **One-live / de-dupe check (shared with §7):** if a `waiting | active` game of
   this `gameType` already exists in the conversation, return **that** game's id —
   never create a duplicate. (Covers two players clicking Rematch at once, and a
   stray "new game" attempt while a rematch is live.)
3. Create the new game in the **same conversation**, with `seriesId` = the parent's
   `seriesId`, **config copied** from the parent, and a fresh
   `engine.createInitialState`.
4. **Turn order** via a single seam,
   `computeRematchSeating(finishedGame) → orderedUserIds` (index 0 = first mover,
   mapped to `engine.roles[0]`):
   - 2 players: the **loser** goes first; on a draw, swap from the previous game's
     first mover.
   - N > 2 (future default): rotate the starting seat by one each rematch.
5. **Reserved seating:** each prior player is pre-assigned a seat/role from that
   order. When a player rejoins they take **their** reserved slot, so first-mover
   fairness holds regardless of who opens the game first.
6. Re-broadcast the conversation's game card, notify the opponent(s) with a
   rematch-flavored notification, and emit `rematchCreated { newGameId }` to the
   **old** game's room so an open game-over modal can switch to **Go to rematch**.

## 4. Server — series read

`GET /api/games/:gameId/series` → `SeriesDetail`:

- Resolve the game's `seriesId`, fetch all games in the series ordered by
  `createdAt`, assign `gameNumber`, and compute the score: each `completed` game
  adds to the winner's `wins` (or `draws` when `winner === "draw"`); in-progress
  games are listed but not counted.
- Backed by new `packages/database/src/repositories/games.ts` helpers
  `getSeriesGames(seriesId)` and `computeSeriesScore(games)`.
- The same computation feeds the card via `enrichGameCardMeta` in
  `apps/server/src/chat/assemble.ts`, so the card and the modal agree.

The endpoint lives under `/api/*` (the server's Hono app), so it adds no top-level
web route and no `RESERVED_USERNAMES` entry is needed.

## 5. Chat — game card

Each game (the initial game and every rematch) posts its own `game_card` at the
bottom of the thread (existing infra — the card is the invite and keeps new games
visible). The card's presentation depends on series size:

- **Series of 1** (never rematched): plain single-game result. When completed and
  you're a player, it offers **Rematch**. **No scoreboard, no View series.**
- **Series of ≥ 2** (`totalGames ≥ 2`): renders the scoreboard reflecting the
  **current series standing**, plus **View series** and a context action.

```
┌─────────────────────────────────────┐
│  Tic-Tac-Toe · Game 3 — aman won     │
│                                      │
│      (av)  aman      riya  (av)      │
│        2     –        1              │
│            draws: 0                  │
│                                      │
│   [ View series ]      [ Rematch ]   │
└─────────────────────────────────────┘
```

Context action: **Rematch** (latest game completed, no live game) · **Resume** /
**Go to game** (a live game exists in the series) · spectators / non-players get
no action.

A rematch being **created** already makes the series 2 games (`totalGames`
counts the in-progress rematch), so the original game's card upgrades to the
series presentation the moment a rematch starts.

## 6. Chat — series modal

**View series** opens a web modal (the `LayeredPopupHost` / `openLayerAtom`
pattern) that fetches `GET /api/games/:gameId/series` on open:

```
╭──────────────────────────────────────────╮
│  Tic-Tac-Toe — Series                     │
│                                           │
│       (av) aman        riya (av)          │
│          2      –        1                │
│             draws: 0                      │
│  ───────────────────────────────────     │
│  Games                                    │
│   ①  aman won            View game →      │
│   ②  riya won            View game →      │
│   ③  aman won            View game →      │
│   ④  in progress         Resume   →       │
│  ───────────────────────────────────     │
│   [ Rematch ]                  [ Close ]  │
╰──────────────────────────────────────────╯
```

- Each row links to `/play/{code}` — replay for finished games, resume/spectate
  for the live one.
- **Rematch** here runs the same `game:rematch` flow and respects the one-live
  rule.
- Naming note: the card-level button is **View series** (opens the whole series);
  the per-row links are **View game**. Copy can be tweaked freely.

## 7. One in-progress game per type, per conversation

At most one `waiting | active` game per `(conversation, gameType)`:

- **Server (authoritative):** the create-in-conversation service runs the same
  check as §3.2 — if a live game of that type already exists in the conversation,
  return its id instead of creating a duplicate.
- **Client (UX):** the create / "Play with…" entry for that game type shows
  **Resume game** (linking to the live one) rather than letting the user click and
  bounce off a server error.
- Completed/abandoned games never block — that is exactly when **Rematch** takes
  over.

Default scope is `(conversation, gameType)`. In a group conversation this means
one live tic-tac-toe in the whole group at a time; per-pair scoping inside groups
is deferred (§13).

## 8. Play page — game-over modal

`game-over-modal.tsx` is mounted in `apps/web/app/play/[gameId]/play-client.tsx`
(above `GameChatSplit`, so it stays visible over the board and replay toolbar) and
shown via `openLayerAtom`. It auto-opens when:

- the live game transitions to `completed` / `abandoned`, **and**
- on mount when the game is already finished (`pastInitially` — the revisit case).

It is closable and re-openable via a small "results" button on the finished view.

```
        ╭─────────────────────────────────╮
        │            You won! 🎉           │
        │                                 │
        │     (av) you        riya (av)   │
        │        2     –        1         │
        │            draws: 0             │
        │                                 │
        │  [ Rematch ]   [ View series ]  │
        │            [ Close ]            │
        ╰─────────────────────────────────╯
```

- Banner derived from `game.winner` vs the viewer's `userId` (You won / You lost /
  Draw).
- The scoreboard and **View series** appear only for a series of ≥ 2 games;
  finishing the very first game shows just the banner + **Rematch** + **Close**.
- **View series** opens the §6 modal.
- **Rematch** → `game:rematch`, then navigate to `/play/{newCode}`. If a
  `rematchCreated` event arrives first (the opponent started it), the button
  becomes **Go to rematch**.
- Spectators see the outcome (and scoreboard, if a series) but no action.

## 9. Shared web components

- `series-scoreboard.tsx` — avatars-over-score (wins + draws). Used by the chat
  card, the series modal, and the game-over modal. Lays out N avatars (wraps past
  two).
- `series-game-list.tsx` — ordered rows with per-game result + `/play/{code}`
  link. Used by the series modal.

Avatars use the existing `Character` / `PresenceAvatar` (DiceBear) components.

## 10. N-player readiness

These already generalize to any player count and need no rework for a future
multiplayer game:

- Roster — read from the finished game's `game_player` rows (any N).
- `seriesId` and the score tally — a `Map<userId, …>`.
- The de-dupe / one-live rule and the scoreboard layout.

The only 2-player-specific logic is `computeRematchSeating`. Deferred until a 3+
player game exists (§13): a partial-roster policy (must everyone rejoin, or start
at `≥ minPlayers`?) and any custom per-game turn order.

## 11. Edge cases / defaults

- Both players click Rematch → de-dupe converges on one game (§3.2).
- Draw → first mover swaps from the previous game's first mover.
- Abandoned game → the modal shows the abandoned status; **Rematch** is offered
  for `completed` games only.
- Game with no conversation → the modal still shows the result, but **Rematch** is
  hidden (the feature is conversation-scoped).
- Series scoreboard reflects the **current** series standing (not a per-game
  snapshot).

## 12. Scope of changes

- **shared:** `db` row/input types + `seriesId`; new series types +
  `GameCardMeta.seriesScore`; `CHAT_EVENTS` `rematch` / `rematchCreated` + socket
  types.
- **database:** `schema.ts` column + self-FK; `repositories/games.ts`
  (`getSeriesGames`, `computeSeriesScore`, set `seriesId` on create); generated
  migration applied via `db:push`.
- **server:** rematch handler + service (reusing `games-in-chat-service`),
  `computeRematchSeating`, reserved seating, the shared one-live check,
  `assemble.ts` enrichment, `GET /api/games/:gameId/series`, `rematchCreated`
  emit.
- **web:** `game-over-modal.tsx`, `series-detail-modal.tsx`,
  `series-scoreboard.tsx`, `series-game-list.tsx`, `game-card-message.tsx`,
  `play-client.tsx`, and the create-entry "Resume" affordance.
- **docs/tests:** sync `docs/architecture/realtime.md`,
  `docs/architecture/database.md` + `database-schema.md`, `docs/architecture/web.md`,
  and the games-in-chat doc; server tests (de-dupe, first-mover, score, series
  endpoint) and shared schema tests.

## 13. Out of scope / deferred

- N-player turn-order policies and the partial-roster rule.
- Per-pair series scoping inside group conversations.
- Rematch for conversation-less games.
- Cross-game-type series (a series is always one game type).
