# Adding a game

A turn-based or simultaneous-round game supplies schemas, a pure engine, metadata, and a board. The platform supplies authentication, room creation, host lobbies with teams and bots, matchmaking, state synchronization, move persistence, clocks, hidden-information redaction, chat layouts, profiles, results, rematches, and audio preferences.

Use tic-tac-toe as the working example. Change game-specific files and the three small registrations below. Do not edit app routes or server handlers, and never add a game-specific socket event, API endpoint, or table.

## Files to add

| Concern | Location | Contract |
| --- | --- | --- |
| State, move, config | `packages/shared/src/types/games/<slug>/schemas.ts` | Strict Zod schemas and inferred types |
| Rules | `packages/games-core/src/games/<slug>/engine.ts` | `GameEngine<State, Move>` |
| Presentation metadata | `packages/games-core/src/games/<slug>/meta.ts` | `GameMeta` |
| Definition | `packages/games-core/src/games/<slug>/index.ts` | Engine, metadata, schemas, optional config fields |
| Board | `packages/games-client/src/games/<slug>/client.tsx` | `GameClientProps` |
| Optional skeleton | Same client folder | A component with no props |
| Rules document | `docs/games/<slug>.md` | Rules, roles, state, moves, config |
| Engine tests | `packages/games-core/tests/<slug>.test.ts` | Rules and terminal outcomes |

## Register it

1. Add a slug constant to `packages/shared/src/constants/games.ts` and append it to `GAME_TYPES`. Re-export the schemas in `packages/shared/src/types/games/index.ts`.
2. Append the definition to `GAMES` in `packages/games-core/src/games/index.ts`. Export public game symbols in the package's `src/index.ts` if needed.
3. Add one entry to `REGISTRY` in `packages/games-client/src/registry.ts`, with `Board` and optionally `Skeleton`. There is no separate skeleton map. The generic skeleton is the fallback.

Registration is explicit so both the server and Next.js can import only the code they need. The conformance suite checks slug/engine parity, and the client suite checks that every engine has a board.

## Schemas and engine

Import `z` from `zod` inside shared. Elsewhere import types and schemas from `@kyzen/shared/types`. Use strict objects, bounded integers, and exact enums; infer the corresponding TypeScript types.

The engine owns game rules. `roleForSeat(index)` names each seat's role (distinct for every seat up to `maxPlayers`, which may be `Infinity`). `createInitialState(seats, { config, seed })` builds the state from `{ role, team, bot }` seats, the validated config, and a server-chosen seed; store the seed in state and derive all randomness from it so the move log replays exactly. `reduce(state, { role }, move)` returns either `{ ok: false, error }` or `{ ok: true, state, outcome }`. Reject wrong roles, wrong turns, illegal or duplicate moves, and moves after a terminal state. Structural input validation belongs in the move schema.

A completed outcome is `{ status: "completed", winnerRoles, draw }`. Without a draw, the listed roles won and every other seat lost (list every role of a winning team). With a draw, the listed roles share the draw and every other seat lost; an empty list means everyone drew. The platform stores winners by user id, updates human stats exactly once, and never gives bots stats, profiles, chat, or friendships.

**Turn-based** engines (`mode: "turn-based"`) may add `currentRole` and `autoMove(state, role, strikes)` to enable the turn clock. `currentRole` returns the current role or null when the game ends.

**Simultaneous** engines (`mode: "simultaneous"`) let every pending role submit each round. Implement `pendingRoles(state)` (roles that still owe an input), `roundOf(state)` (a monotonic round number; the clock re-arms when it changes), `roundTimeMs(state)` (the full allowance for the round that just opened, including replay playback of the previous resolution), and `autoMove(state, role, strikes)` (the input for a human who misses the deadline; `strikes` counts that role's earlier consecutive timeouts, so the engine decides what a long-absent player forfeits). `reduce` must reject a second input from the same role and inputs for another round. Simultaneous games never abort on timeouts. If clients replay each resolution, also implement `resultDelayMs(state)`: the time the client needs to present the final state before results (the replay of the final resolution plus any results banner, 0 when there is none). For an unfinished state return the same measure for the latest resolution; the platform waits that long before bots lock a round in which no human is pending, so spectators see every round.

**Hidden information.** If players must not see something (sealed orders, hands), implement `publicState(state)` and `publicMove(state, move)`. The server applies them to every snapshot, move delta, and HTTP response; `publicMove` receives the current state, so it can hide a move until its round resolves and reveal it afterwards. The broadcast is shared by every viewer, so public state must not contain anything any viewer may not see.

**Lobbies, teams, and bots.** Set `lobby: { teams, bots }` to make private rooms wait for the host. Use `lobbyConfigSchema` from `@kyzen/shared/types` as the config (or part of it): `{ mode: "ffa" | "teams", teams: Record<userId, TeamId>, bots: { id: "bot:<n>", difficulty, team }[] }`, with at most `LOBBY_MAX_BOTS` (64) bots; humans are not capped. The generic lobby UI edits it through `room:configure` (team keys must be seated players or configured bots), guests can leave with `room:leave`, the host can remove a guest with `room:kick`, and the host starts with `room:start`; the platform seats humans then bots (named `"Bot <n> (<Difficulty>)"`), assigns teams, checks `minPlayers` (counting bots) and, in teams mode, at least two teams, and inserts bot seats. Implement `botMove(state, role, difficulty)`; while a human is pending, every pending bot submits at once in one transaction and one broadcast. Keep `botMove`, `reduce`, and `pendingRoles` free of per-seat linear searches inside loops over seats, because a lobby can hold 64 bots plus any number of humans.

Public matchmaking supports turn-based and simultaneous engines with `reduce`. Configs are validated by `configSchema` and matched by canonical JSONB equality. `playerCount(config)` sets the group size (default 2), and `GameDefinition.queues` lists find-page variants, each with its own config. When a queue config has `mode: "teams"`, public seats alternate teams `A` and `B`; otherwise each seat is its own team. Public queues never add bots. Keep state and moves role-based: never embed account IDs, usernames, avatars, or profile data in engine state. Public wire snapshots replace account IDs with match-scoped role aliases, including the viewer ID supplied to the board. The shared shell supplies temporary chat and disables profile popups. See [public matchmaking](architecture/matchmaking.md).

The type contract also describes realtime engines, but no server loop runs `step` yet. A realtime game needs platform work before it can be registered as playable.

## Board contract

```tsx
"use client";

import type { GameClientProps } from "@kyzen/games-client";

export function GameBoard({ game, connected, makeMove }: GameClientProps) {
  return (
    <button type="button" disabled={!connected || game.status !== "active"} onClick={() => makeMove({ position: 0 })}>
      Play
    </button>
  );
}
```

Adapt the move and rendering to your game. `game.gameState` is opaque at the generic boundary and is the *public* state when the engine redacts; validate or narrow it with your game's public shape. `game.config` holds the validated config and `game.winners` every winner. `moves` is ordered history (redacted the same way). Set `layout: "wide"` on the definition when the board needs the full play area. `makeMove` sends an intent to the authoritative server. Use `userId` and the game's roles to show available actions. Use `onViewProfile` for a player's profile popup.

The shell calls `useGameSession` once per play view. It joins the room, receives snapshots and move deltas, resynchronizes after reconnect, filters other rooms, and leaves on unmount. Boards never call `io`, add socket listeners, join rooms, or disconnect the shared connection. The shell displays transport errors and supplies the same current game to waiting and result overlays.

Keep game-specific animations and replay presentation in the board. Reuse the audio hook, player primitives, cards, and skeleton building blocks already in `games-client`.

## Metadata and assets

Metadata supplies name, description, category, optional cover, tutorial, how-to-play steps, and `backgroundMusic`. Put public assets under `apps/web/public/games/` or `apps/web/public/sounds/`. Background music comes from metadata, so no app-level audio registration is needed.

## Verify

```bash
bun run type-check
bun run --cwd packages/games-core test
bun run --cwd packages/games-client test
bun run check
bun run strip-comments -- --check
```

Add focused tests for legal turns, each terminal outcome (including team wins and draws), invalid, duplicate, and stale-round moves, redaction, bot moves, and schema strictness. Existing conformance, registry, and game-document tests automatically cover the newly registered game. Then run local development, use two authenticated browser sessions, create a room, join, finish a game, and reconnect one player. Also test the shared Play now flow, temporary match chat, mutual friendship, and docked, floating, minimized, and mobile chat. Conversation-backed games retain permanent chat.

No game-specific database migration is needed. The existing JSONB state/config/move columns store the game's validated shapes. Tutorials are optional and follow [video-tutorials.md](video-tutorials.md).
