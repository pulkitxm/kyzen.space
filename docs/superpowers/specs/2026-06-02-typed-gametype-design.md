# Typed `gameType` at the parse layer - design

## Problem

`gameType` is modelled as a bare `z.string()` in the wire schemas and as `gameType: string` in ~15 hand-written declarations across all four workspaces. There is no shared `GameType` type, and the *set* of valid game types is declared independently in three places:

1. the `GAMES` array (`games-core`) - the canonical registry,
2. the `REGISTRY` / `SKELETON_REGISTRY` maps (`games-client`) - a second, hardcoded source of truth keyed by string literals,
3. the per-game `TIC_TAC_TOE` constant.

Because the schemas only validate "is a string", props and arguments downstream are typed `string`. Consumers get no autocomplete, no `switch` exhaustiveness, and typos are caught only at runtime by the registry lookup (`hasEngine` / `getDefinition` throwing). Membership is enforced, but late and without type-level help.

## Goals

- One exported `GameType` literal union and one `gameTypeSchema`, derived from a single source.
- The slug literal (`"tic-tac-toe"`) declared exactly once and reused everywhere - no raw slug strings in production code.
- Parse-time rejection of unknown game types on input paths (not just registry lookup).
- Propagate `GameType` to hand-written props, parameters, and service inputs so they get the narrowed type.
- Collapse the `games-client` registries to the single source so a missing board/skeleton is a compile error.

## Non-goals

- No DB migration: the `game.game_type` column stays `text`.
- No change to the registry's defensive lookup contract: `getDefinition` / `hasEngine` / `getEngine` / `getDriver` keep accepting `string` (the DB is an untrusted boundary that may hold a stale type) and continue to throw / return `null` on a miss.
- Not deriving the `GAME_TYPES` tuple from the `GAMES` array (that reintroduces a circular import - see below). The tuple is hand-listed from the slug constants and kept honest by a drift test.
- Test assertions that pin the wire value (e.g. `expect(...).toBe("tic-tac-toe")`) keep their raw literal - they are deliberate contract checks, not duplication.

## Design

### Source of truth: `packages/games-core/src/game-types.ts` (new leaf, the slug constants file)

This file is the single home for every game slug and the type/schema derived from them. It imports only `zod`, so any module may depend on it without creating a cycle:

```ts
export const TIC_TAC_TOE = "tic-tac-toe";

export const GAME_TYPES = [TIC_TAC_TOE] as const;
export type GameType = (typeof GAME_TYPES)[number];
export const gameTypeSchema = z.enum(GAME_TYPES);
```

The raw `"tic-tac-toe"` literal is written exactly once (the slug constant); the tuple references the constant, and `GameType` + `gameTypeSchema` derive from the tuple. Re-export the slug constant(s), `GAME_TYPES`, `GameType`, and `gameTypeSchema` from `packages/games-core/src/index.ts`.

`z.enum` gives both parse-time rejection of unknown values *and* a narrowed `z.infer`, so the schema and the type stay in lockstep by construction.

The existing `TIC_TAC_TOE` constant **moves here** from `games/tic-tac-toe/schemas.ts`. Its current consumers (`games/tic-tac-toe/engine.ts` and `games/tic-tac-toe/meta.ts`) import it from `../../game-types` instead of `./schemas`.

### Reuse the slug constant (kill the remaining raw literals)

- **games-client** (`registry.ts`): switch the hardcoded keys to computed keys (`{ [TIC_TAC_TOE]: ... }`) importing `TIC_TAC_TOE` from `@gamelobby/games-core`. Combined with the `Record<GameType, …>` annotation below, the registries are now driven entirely by the single source.
- **Tests**: replace fixture/setup usages (`{ gameType: "tic-tac-toe" }`) with the imported `TIC_TAC_TOE` constant. Leave assertions that check the literal wire value (`expect(...).toBe("tic-tac-toe")`, `.toContain("tic-tac-toe")`) as raw strings - they intentionally pin the contract.

### Why a leaf module, not derivation from `GAMES`

Deriving the union from `GAMES` (`(typeof GAMES)[number]["meta"]["type"]`) would require the enum to live at the registry layer, and the foundational `schemas.ts` importing it reintroduces a circular import (`schemas → registry → games → schemas`). A standalone leaf keeps the dependency graph acyclic. The cost (`GAME_TYPES` is maintained alongside `GAMES`) is covered by the type system (below) and a drift test.

### Narrow `GameMeta.type`

In `definition.ts`, change `GameMeta.type: string` to `GameMeta.type: GameType`. A `GameDefinition` whose `meta.type` is not in `GAME_TYPES` becomes a compile error, so the tuple and the definitions cannot disagree on the type level.

### Drift guard

In `packages/games-core/tests/conformance.test.ts`, assert that the tuple and the runtime registry agree:

```ts
expect([...GAME_TYPES].sort()).toEqual(listGameTypes().sort());
```

This catches the one remaining manual step (appending to `GAME_TYPES` when adding a game) even though `listGameTypes()` returns `GameType[]` after the change.

### Validation gate stays `string`

`getDefinition`, `getEngine` (registry.ts) and `getDriver` (drivers.ts) keep `(type: string)`. They are the trust boundary against DB values and unknown input; narrowing their parameters would force casts at every call from a DB read. `hasEngine` keeps its `string` parameter too, but becomes a type predicate (`hasEngine(type: string): type is GameType`) so an existing `if (!hasEngine(x)) …` guard narrows `x` to `GameType` for free. `listGameTypes()` return type tightens to `GameType[]`.

### Schemas → `gameTypeSchema`

- `games-core/src/schemas.ts`: `gameJsonSchema.gameType` → `gameTypeSchema`. This narrows `GameJson.gameType`, which flows into the web app.
- `chat-core`: add `"@gamelobby/games-core": "workspace:*"` to `package.json` (no package cycle: `games-core` does not depend on `chat-core`), then:
  - `clientCreateGameInConversationSchema.gameType` → `gameTypeSchema` (the create path, now rejected at parse).
  - `gameCardMetaSchema.gameType` → `gameTypeSchema`.
  - `notificationPayloadSchema.gameType` → `gameTypeSchema.optional()`.
- `apps/server/src/api/routes/conversations.ts` (~line 127): replace the `typeof body?.gameType === "string" ? … : ""` coercion with `gameTypeSchema.safeParse(body?.gameType)`.

### DB → app chokepoint

Cast once in the games repository mapper (`apps/server/src/db/repositories/games.ts`): `gameType: row.gameType as GameType`, so `GameRecord.gameType` is `GameType`. Everything downstream (turn-based driver, `GameJson`, web props) inherits the narrow type for free. The DB column type is unchanged.

### Propagate `GameType` to hand-written declarations

Replace `gameType: string` with `GameType` at:

- Server: `chat/games-in-chat-service.ts` (create input), `db/repositories/games.ts` (`CreateGameInput` + the `GameRecord` override), `db/repositories/profiles.ts` (`bumpStats`).
- Web props/args: `app/play/[gameId]/play-client.tsx`, `app/games/components/conversation-picker.tsx`, `app/chat/[handle]/game-launcher.tsx`, `lib/profile-activity-games.ts`, `app/chat/[handle]/game-card-message.tsx`.

Raw DB-read consumers that map `GameRow`/`GameRow[]` directly (e.g. `api/routes/profiles.ts` `activityRow`) stay `string` - they sit on the DB boundary, not the app-level argument boundary, so narrowing them would only add casts for no caller benefit.

### games-client registries (collapse the 2nd source of truth)

In `packages/games-client/src/registry.ts`:

```ts
const REGISTRY: Record<GameType, ComponentType<GameClientProps>> = { "tic-tac-toe": ... };
const SKELETON_REGISTRY: Record<GameType, ComponentType> = { "tic-tac-toe": ... };
```

The `Record<GameType, …>` annotation makes a missing entry a compile error (complements the structural tests requiring every game to ship a board + skeleton). `getGameClient` / `getGameSkeleton` keep `(gameType: string)` for defensive lookup, indexing via `REGISTRY[gameType as GameType] ?? null`.

### Route params stay `string`, narrowed at the boundary

`app/games/[gameType]/page.tsx` receives a raw URL string from Next.js and already guards with `if (!hasEngine(gameType)) notFound();`. Because `hasEngine` becomes a `type is GameType` predicate, that existing guard narrows `gameType` to `GameType` afterwards with no extra code. `app/games/[gameType]/[gameId]/page.tsx` only reads `gameId` (it redirects), so its `gameType` param needs no change.

## Cost / trade-off

Adding a game means: declare its slug constant and append it to `GAME_TYPES` (both in `game-types.ts`), then add the definition to the `GAMES` array. Both the compiler (`GameMeta.type: GameType`, `Record<GameType, …>` in games-client) and the drift test make a mismatch impossible to ship silently. This is the deliberate price of typing the wire layer against the closed game set - and the slug string itself is still declared only once.

## Docs / agents sync (repo rule)

- `docs/adding-a-game.md` and `.claude/agents/game-builder.md`: the slug now lives in `game-types.ts` (declare the constant + append to `GAME_TYPES`), not in the game's `schemas.ts`; the game's `meta.ts`/`engine.ts` import it from there.
- `docs/architecture/*` pages that describe the `gameType` field / schemas / realtime payloads: note that `gameType` is the `GameType` union.

## Testing / verification

- `bun run type-check` is the real proof: hand-written props and arguments now reject non-`GameType` literals, and the `games-client` registries fail to compile if a board/skeleton is missing.
- `bun test` (including the new conformance drift assertion).
- `bun run check` for format/lint.

## File inventory

New: `packages/games-core/src/game-types.ts`.

Edited:
- `games-core`: `index.ts`, `definition.ts`, `schemas.ts`, `registry.ts`, `games/tic-tac-toe/schemas.ts` (remove the moved constant), `games/tic-tac-toe/meta.ts`, `games/tic-tac-toe/engine.ts`, `tests/conformance.test.ts`.
- `chat-core`: `package.json` (add dep), `schemas.ts`.
- `games-client`: `registry.ts` (computed keys + `Record<GameType, …>`).
- `apps/server`: `db/repositories/games.ts`, `db/repositories/profiles.ts`, `chat/games-in-chat-service.ts`, `api/routes/conversations.ts`.
- `apps/web`: `play-client.tsx`, `conversation-picker.tsx`, `game-launcher.tsx`, `lib/profile-activity-games.ts`, `game-card-message.tsx`.
- Test fixtures (slug constant, not assertions): `games-core/tests/schemas.test.ts`; `apps/web/tests/game-skeletons.test.tsx`; `apps/server` unit (`serialize.test.ts`, `games-in-chat.test.ts`, `turn-based.test.ts`, `game-card.test.ts`) and integration (`game-flows.test.ts`, `games-in-chat-edge.test.ts`, `game-driver.test.ts`).
- Docs/agents: `docs/adding-a-game.md`, relevant `docs/architecture/*`, `.claude/agents/game-builder.md`.
