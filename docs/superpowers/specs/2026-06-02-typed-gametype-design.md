# Typed `gameType` at the parse layer — design

## Problem

`gameType` is modelled as a bare `z.string()` in the wire schemas and as `gameType: string` in ~15 hand-written declarations across all four workspaces. There is no shared `GameType` type, and the *set* of valid game types is declared independently in three places:

1. the `GAMES` array (`games-core`) — the canonical registry,
2. the `REGISTRY` / `SKELETON_REGISTRY` maps (`games-client`) — a second, hardcoded source of truth keyed by string literals,
3. the per-game `TIC_TAC_TOE` constant.

Because the schemas only validate "is a string", props and arguments downstream are typed `string`. Consumers get no autocomplete, no `switch` exhaustiveness, and typos are caught only at runtime by the registry lookup (`hasEngine` / `getDefinition` throwing). Membership is enforced, but late and without type-level help.

## Goals

- One exported `GameType` literal union and one `gameTypeSchema`, derived from a single source.
- Parse-time rejection of unknown game types on input paths (not just registry lookup).
- Propagate `GameType` to hand-written props, parameters, and service inputs so they get the narrowed type.
- Collapse the `games-client` registries to the single source so a missing board/skeleton is a compile error.

## Non-goals

- No DB migration: the `game.game_type` column stays `text`.
- No change to the registry's defensive lookup contract: `getDefinition` / `hasEngine` / `getEngine` / `getDriver` keep accepting `string` (the DB is an untrusted boundary that may hold a stale type) and continue to throw / return `null` on a miss.
- Not folding the `TIC_TAC_TOE` constant or fully deriving the tuple from `GAMES` (that is the heavier "unify registries" variant; explicitly out of scope).

## Design

### Source of truth — `packages/games-core/src/game-types.ts` (new leaf)

Imports only `zod`, so any module may depend on it without creating a cycle:

```ts
export const GAME_TYPES = ["tic-tac-toe"] as const;
export type GameType = (typeof GAME_TYPES)[number];
export const gameTypeSchema = z.enum(GAME_TYPES);
```

Re-export all three from `packages/games-core/src/index.ts`.

`z.enum` gives both parse-time rejection of unknown values *and* a narrowed `z.infer`, so the schema and the type stay in lockstep by construction.

### Why a leaf module, not derivation from `GAMES`

Deriving the union from `GAMES` (`(typeof GAMES)[number]["meta"]["type"]`) would require the enum to live at the registry layer, and the foundational `schemas.ts` importing it reintroduces a circular import (`schemas → registry → games → schemas`). A standalone leaf keeps the dependency graph acyclic. The cost — `GAME_TYPES` is maintained alongside `GAMES` — is covered by the type system (below) and a drift test.

### Narrow `GameMeta.type`

In `definition.ts`, change `GameMeta.type: string` to `GameMeta.type: GameType`. A `GameDefinition` whose `meta.type` is not in `GAME_TYPES` becomes a compile error, so the tuple and the definitions cannot disagree on the type level.

### Drift guard

In `packages/games-core/tests/conformance.test.ts`, assert that the tuple and the runtime registry agree:

```ts
expect([...GAME_TYPES].sort()).toEqual(listGameTypes().sort());
```

This catches the one remaining manual step — appending to `GAME_TYPES` when adding a game — even though `listGameTypes()` returns `GameType[]` after the change.

### Validation gate stays `string`

`getDefinition`, `hasEngine`, `getEngine` (registry.ts) and `getDriver` (drivers.ts) keep `(type: string)`. They are the trust boundary against DB values and unknown input; narrowing their parameters would force casts at every call from a DB read. `listGameTypes()` return type tightens to `GameType[]`.

### Schemas → `gameTypeSchema`

- `games-core/src/schemas.ts`: `gameJsonSchema.gameType` → `gameTypeSchema`. This narrows `GameJson.gameType`, which flows into the web app.
- `chat-core`: add `"@gamelobby/games-core": "workspace:*"` to `package.json` (no package cycle — `games-core` does not depend on `chat-core`), then:
  - `clientCreateGameInConversationSchema.gameType` → `gameTypeSchema` (the create path — now rejected at parse).
  - `gameCardMetaSchema.gameType` → `gameTypeSchema`.
  - `notificationPayloadSchema.gameType` → `gameTypeSchema.optional()`.
- `apps/server/src/api/routes/conversations.ts` (~line 127): replace the `typeof body?.gameType === "string" ? … : ""` coercion with `gameTypeSchema.safeParse(body?.gameType)`.

### DB → app chokepoint

Cast once in the games repository mapper (`apps/server/src/db/repositories/games.ts`): `gameType: row.gameType as GameType`, so `GameRecord.gameType` is `GameType`. Everything downstream (turn-based driver, `GameJson`, web props) inherits the narrow type for free. The DB column type is unchanged.

### Propagate `GameType` to hand-written declarations

Replace `gameType: string` with `GameType` at:

- Server: `chat/games-in-chat-service.ts`, `db/repositories/games.ts`, `db/repositories/profiles.ts`, `api/routes/profiles.ts`.
- Web props/args: `app/play/[gameId]/play-client.tsx`, `app/games/components/conversation-picker.tsx`, `app/chat/[handle]/game-launcher.tsx`, `lib/profile-activity-games.ts`, `app/chat/[handle]/game-card-message.tsx`.

### games-client registries (collapse the 2nd source of truth)

In `packages/games-client/src/registry.ts`:

```ts
const REGISTRY: Record<GameType, ComponentType<GameClientProps>> = { "tic-tac-toe": ... };
const SKELETON_REGISTRY: Record<GameType, ComponentType> = { "tic-tac-toe": ... };
```

The `Record<GameType, …>` annotation makes a missing entry a compile error (complements the structural tests requiring every game to ship a board + skeleton). `getGameClient` / `getGameSkeleton` keep `(gameType: string)` for defensive lookup, indexing via `REGISTRY[gameType as GameType] ?? null`.

### Route params stay `string`, narrowed at the boundary

`app/games/[gameType]/page.tsx` and `app/games/[gameType]/[gameId]/page.tsx` receive raw URL strings from Next.js. Narrow at the page boundary with `gameTypeSchema.safeParse(...)` and call `notFound()` on failure, after which the value is `GameType`.

## Cost / trade-off

Adding a game becomes two appends — the `GAMES` array and the `GAME_TYPES` tuple — instead of one. Both the compiler (`GameMeta.type: GameType`) and the drift test make a mismatch impossible to ship silently. This is the deliberate price of typing the wire layer against the closed game set.

## Docs / agents sync (repo rule)

- `docs/adding-a-game.md` and `.claude/agents/game-builder.md`: add the "append your type to `GAME_TYPES`" step.
- `docs/architecture/*` pages that describe the `gameType` field / schemas / realtime payloads: note that `gameType` is the `GameType` union.

## Testing / verification

- `bun run type-check` is the real proof: hand-written props and arguments now reject non-`GameType` literals, and the `games-client` registries fail to compile if a board/skeleton is missing.
- `bun test` (including the new conformance drift assertion).
- `bun run check` for format/lint.

## File inventory

New: `packages/games-core/src/game-types.ts`.
Edited (~15): `games-core` (`index.ts`, `definition.ts`, `schemas.ts`, `registry.ts`, `tests/conformance.test.ts`); `chat-core` (`package.json`, `schemas.ts`); `games-client` (`registry.ts`); `apps/server` (`db/repositories/games.ts`, `db/repositories/profiles.ts`, `chat/games-in-chat-service.ts`, `api/routes/profiles.ts`, `api/routes/conversations.ts`); `apps/web` (`play-client.tsx`, `conversation-picker.tsx`, `game-launcher.tsx`, `profile-activity-games.ts`, `game-card-message.tsx`); docs (`adding-a-game.md`, relevant `architecture/*`) and `.claude/agents/game-builder.md`.
