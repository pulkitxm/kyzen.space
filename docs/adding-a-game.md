# Adding a game

Games on this platform are **data-driven**. A game is a single self-describing
`GameDefinition` object — its engine, mode, roles, player bounds, strict Zod
schemas, metadata, and optional setup fields — plus one React client component.
Every generic part of the platform (the realtime driver, the database, the
serializers, the web lobby, the conformance tests) reads a game *only* through
its definition. **Adding a game requires zero changes to platform plumbing**: no
new web route, API endpoint, database table/column, socket event, or driver.

## The two places a game lives

| Concern | Package | What you add |
| --- | --- | --- |
| Logic, schemas, metadata (server-safe, **no React**) | `@gamelobby/games-core` | a `GameDefinition` in `src/games/<type>/`, appended to the single `GAMES` array |
| React board UI (web-only) | `@gamelobby/games-client` | a `"use client"` board component (and an optional loading skeleton), registered by `type` |

The split matters: the **server** imports `games-core` to run engines and
validate moves, so that package must never import React. All UI lives in
`games-client`.

## The single source of truth

`packages/games-core/src/games/index.ts` exports the one array:

```ts
export const GAMES: GameDefinition[] = [ticTacToeDefinition /*, …*/];
```

Everything derives from it via `src/registry.ts`: `getDefinition(type)`,
`getEngine(type)`, `hasEngine(type)`, `listGameTypes()`, `listGameMeta()`,
`getCategoryGroups()`. There is **no** separate catalog, metadata list, or
client map to keep in sync — do not reintroduce one.

## A `GameDefinition` (see `src/definition.ts`)

```ts
interface GameDefinition<S, I, C> {
  meta: GameMeta;            // type, name, description, categoryId, coverImage?
  engine: GameEngine<S, I>;  // mode, roles, min/maxPlayers, createInitialState, reduce|step
  stateSchema: ZodType<S>;   // validates the game_state JSONB
  moveSchema: ZodType<I>;    // validates move_data JSONB + the make_move payload
  configSchema: ZodType<C>;  // validates the config JSONB + the lobby setup form
  configFields?: ConfigField[]; // declarative setup inputs; [] for none
}
```

### Strict Zod is mandatory

The database stores game state, moves, and config as opaque JSONB. The Zod
schemas are the guardrails that make that JSON safe and strongly typed:

- Use `.strict()` (reject unknown keys), exact `z.enum`s, and integer/range
  bounds (`z.number().int().min().max()`).
- **Derive TS types from the schemas** with `z.infer` — never hand-write a type
  that parallels a schema.
- Put **structural** move validation in `moveSchema`; keep only game *rules*
  (turns, legality, terminal state) in the engine's `reduce`/`step`. The driver
  validates `moveSchema` and `stateSchema` before calling the engine.

## Worked example: tic-tac-toe

```
packages/games-core/src/games/tic-tac-toe/
  schemas.ts   # cell/mark + strict state/move/config schemas, z.infer types, TYPE const
  engine.ts    # ticTacToeEngine: createInitialState + reduce (rules only)
  meta.ts      # ticTacToeMeta: GameMeta
  index.ts     # ticTacToeDefinition: GameDefinition
packages/games-core/src/games/index.ts   # GAMES array includes ticTacToeDefinition
packages/games-client/src/games/tic-tac-toe/client.tsx    # board UI
packages/games-client/src/games/tic-tac-toe/skeleton.tsx  # loading skeleton (optional)
packages/games-client/src/registry.ts                     # "tic-tac-toe": lazy(client) + skeleton
```

## Steps to add a game

1. **games-core** — create `src/games/<type>/{schemas,engine,meta,index}.ts`,
   append the definition to `GAMES` (`src/games/index.ts`), and export the public
   symbols from `src/index.ts`. Add a category to `src/categories.ts` only if you
   need a new one.
2. **games-client** — add `src/games/<type>/client.tsx` (`"use client"`, typed
   `GameClientProps`; emit `make_move`, render from `game_state`/`move_made`) and
   register it in `src/registry.ts` by `type`. Optionally add
   `src/games/<type>/skeleton.tsx` — a prop-less component that mirrors your
   board's layout (built from the shared `SkeletonBox`, no `"use client"` needed)
   — and register it in `SKELETON_REGISTRY` by `type`. It renders as the board's
   `<Suspense>` fallback while the lazy board chunk loads. If you skip it,
   `getGameSkeleton(type)` falls back to the generic `DefaultGameSkeleton`.
3. **Tests** — the conformance suite (`packages/games-core/tests/conformance.test.ts`)
   covers your game automatically once it's in `GAMES`. Add a focused engine test
   `packages/games-core/tests/<type>.test.ts` (turn/role enforcement, every win
   condition, draws, illegal moves, post-terminal rejection) and schema-strictness
   cases.
4. **Document** — add `docs/games/<type>.md`, named after the `type` slug (e.g.
   `docs/games/tic-tac-toe.md`): how to play, player count and roles,
   win/draw/illegal-move rules, the state and move shapes (mirroring the Zod
   schemas), any `configFields`, and a link to `packages/games-core/src/games/<type>/`.
   Every new game ships this doc.
5. **Verify** — `bun run type-check`, `bun test` (games-core incl. conformance),
   `bun run check`. Then `bun run dev` and play a full game two-up on `/play/:id`.

## What you reuse (never recreate)

These already work for every game — do not duplicate them:

- **Lobby** — `apps/web/app/games/[gameType]/page.tsx` + `app/games/_shared/game-lobby.tsx`
  render the catalog-driven lobby and the `configFields` form. The URL stays
  `/games/<type>`; the legacy `/games/<type>/<id>` redirects to `/play/<id>`.
- **"Play with…" flow** — `app/games/components/conversation-picker.tsx` and
  `app/chat/[handle]/game-launcher.tsx` (both take a `gameType` + optional
  `config`) create a game in a conversation via the `game:create_in_conversation`
  socket event.
- **Play view** — `app/play/[gameId]/page.tsx` loads the game and renders the
  registered client via `getGameClient(type)` inside `<Suspense>`, with
  `getGameSkeleton(type)` as the fallback. The route-level `loading.tsx` reads the
  `gl_chat_layout` cookie to render the matching chat shell (docked / popout /
  closed) while the game data is still being fetched, but its board area stays a
  generic placeholder — it can't pick a per-game board skeleton there because the
  game `type` isn't known until the fetch resolves.
- **In-chat card** — `app/chat/[handle]/game-card-message.tsx` renders the live
  card for any game.
- **Realtime** — the turn-based driver (`apps/server/src/realtime/turn-based.ts`)
  handles `join_room`/`make_move` for any turn-based engine. Add a new driver in
  `realtime/drivers.ts` **only** for a genuinely different `mode` (e.g. realtime
  `step`-based games).
- **Database** — the generic `game` (+ `config` JSONB), `move`, and `game_player`
  tables store every game. Never add a per-game table; the engine owns the typed
  shape and Zod validates it.

## Automating it

The `game-builder` agent (`.claude/agents/game-builder.md`) follows this guide to
implement a game end-to-end from a spec or doc — including the tests and
verification. Keep that agent and this document in sync.
