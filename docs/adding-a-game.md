# Adding a game

A turn-based game supplies schemas, a pure engine, metadata, and a board. The platform supplies authentication, room creation, matchmaking, state synchronization, move persistence, chat layouts, profiles, results, rematches, and audio preferences.

Use tic-tac-toe as the working example. Change game-specific files and the three small registrations below. Do not edit app routes or server handlers to add an ordinary turn-based game.

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

The engine owns game rules. Its initial state comes from seats. Its `reduce(state, { role }, move)` returns either `{ ok: false, error }` or `{ ok: true, state, outcome }`. Reject wrong roles, wrong turns, illegal moves, and moves after a terminal state. Structural input validation belongs in the move schema.

Optional `currentRole` and `autoMove` hooks enable the platform's turn clock. `currentRole` returns the current role or null when the game ends. `autoMove` returns a legal move for that role.

Current matchmaking pairs two players. A game requiring larger match groups needs an explicit matchmaking extension and verification of its seating and timeout outcomes.

The deployed runner supports turn-based games. The type contract also describes realtime engines, but no server loop currently runs `step`. A realtime game needs platform work before it can be registered as playable.

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

Adapt the move and rendering to your game. `game.gameState` is opaque at the generic boundary; validate or narrow it with your game's schema. `moves` is ordered history. `makeMove` sends an intent to the authoritative server. Use `userId` and the game's roles to show available actions. Use `onViewProfile` for a player's profile popup.

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

Add focused tests for legal turns, each terminal outcome, invalid moves, and schema strictness. Existing conformance, registry, and game-document tests automatically cover the newly registered game. Then run local development, use two authenticated browser sessions, create a room, join, finish a game, and reconnect one player. If the game was started in a conversation, also verify docked, floating, and minimized chat.

No game-specific database migration is needed. The existing JSONB state/config/move columns store the game's validated shapes. Tutorials are optional and follow [video-tutorials.md](video-tutorials.md).
