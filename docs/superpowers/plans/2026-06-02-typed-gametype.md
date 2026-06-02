# Typed `gameType` at the parse layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare-string `gameType` with one registry-derived `GameType` union + `gameTypeSchema`, declare the slug literal exactly once, and propagate the type to every prop/argument/schema across the four workspaces.

**Architecture:** A new leaf module `packages/games-core/src/game-types.ts` declares the slug constant(s), a `GAME_TYPES` tuple, the `GameType` union, and `gameTypeSchema = z.enum(GAME_TYPES)`. Everything imports from there. The registry stays the runtime trust boundary (`getDefinition`/`getEngine` accept `string`; `hasEngine` becomes a `type is GameType` guard). Raw DB rows stay `string`; a single cast at each `GameRecord` construction site narrows the app-facing read type.

**Tech Stack:** TypeScript, Zod v3, Bun (test runner + package manager), Turborepo, Drizzle ORM, Next.js.

**Spec:** `docs/superpowers/specs/2026-06-02-typed-gametype-design.md`

**Ordering rationale:** Tasks are ordered by dependency so every commit leaves the whole repo type-checking green. The chain that forces the order: `GameRecord.gameType` (server) must become `GameType` before `gameJsonSchema`/chat-core schemas narrow (they are built from it); the server *create-input* must narrow only after chat-core narrows (its callers feed it). Do not reorder.

**Verification commands (used throughout):**
- Whole repo: `bun run type-check` (Turbo-cached, no build) and `bun test`.
- One workspace: `cd <workspace> && bun test` or `bunx tsc --noEmit`.

---

### Task 1: Single source — `game-types.ts` (slug + tuple + type + schema) and registry

**Files:**
- Create: `packages/games-core/src/game-types.ts`
- Create (test): `packages/games-core/tests/game-types.test.ts`
- Modify: `packages/games-core/src/games/tic-tac-toe/schemas.ts` (remove moved constant)
- Modify: `packages/games-core/src/games/tic-tac-toe/meta.ts` (import path)
- Modify: `packages/games-core/src/games/tic-tac-toe/engine.ts` (import path)
- Modify: `packages/games-core/src/definition.ts` (narrow `GameMeta.type`)
- Modify: `packages/games-core/src/registry.ts` (`hasEngine` guard, `listGameTypes` return)
- Modify: `packages/games-core/src/index.ts` (exports)

- [ ] **Step 1: Write the failing test**

Create `packages/games-core/tests/game-types.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { GAME_TYPES, gameTypeSchema, TIC_TAC_TOE } from "../src/index";

describe("game-types", () => {
  test("the slug constant is the canonical value", () => {
    expect(TIC_TAC_TOE).toBe("tic-tac-toe");
  });

  test("GAME_TYPES contains the slug constant", () => {
    expect(GAME_TYPES).toContain(TIC_TAC_TOE);
  });

  test("gameTypeSchema accepts a registered slug", () => {
    expect(gameTypeSchema.parse(TIC_TAC_TOE)).toBe("tic-tac-toe");
  });

  test("gameTypeSchema rejects an unknown slug", () => {
    expect(gameTypeSchema.safeParse("chess").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/games-core && bun test tests/game-types.test.ts`
Expected: FAIL — `GAME_TYPES`, `gameTypeSchema` are not exported yet.

- [ ] **Step 3: Create the leaf module**

Create `packages/games-core/src/game-types.ts`:

```ts
import { z } from "zod";

export const TIC_TAC_TOE = "tic-tac-toe";

export const GAME_TYPES = [TIC_TAC_TOE] as const;

export type GameType = (typeof GAME_TYPES)[number];

export const gameTypeSchema = z.enum(GAME_TYPES);
```

- [ ] **Step 4: Remove the moved constant from the game folder**

In `packages/games-core/src/games/tic-tac-toe/schemas.ts`, delete this line (line 3):

```ts
export const TIC_TAC_TOE = "tic-tac-toe";
```

- [ ] **Step 5: Repoint the game folder's imports to the leaf**

In `packages/games-core/src/games/tic-tac-toe/meta.ts`, change line 2 from:

```ts
import { TIC_TAC_TOE } from "./schemas";
```

to:

```ts
import { TIC_TAC_TOE } from "../../game-types";
```

In `packages/games-core/src/games/tic-tac-toe/engine.ts`, remove `TIC_TAC_TOE,` from the `from "./schemas"` import block and add a new import. The import block becomes:

```ts
import type { GameEngine, Outcome, ReduceResult, Seat } from "../../engine";
import { TIC_TAC_TOE } from "../../game-types";
import {
  type Cell,
  type Mark,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeMoveSchema,
} from "./schemas";
```

- [ ] **Step 6: Narrow `GameMeta.type`**

In `packages/games-core/src/definition.ts`, add the import after the existing imports (top of file):

```ts
import type { GameType } from "./game-types";
```

Change the `GameMeta` interface field from `type: string;` to:

```ts
  type: GameType;
```

- [ ] **Step 7: Make `hasEngine` a type guard and tighten `listGameTypes`**

In `packages/games-core/src/registry.ts`, add to the imports:

```ts
import type { GameType } from "./game-types";
```

Change `hasEngine` to a type predicate:

```ts
export function hasEngine(type: string): type is GameType {
  return byType.has(type);
}
```

Change `listGameTypes` return type:

```ts
export function listGameTypes(): GameType[] {
  return GAMES.map((def) => def.meta.type);
}
```

- [ ] **Step 8: Export the new symbols from the package root**

In `packages/games-core/src/index.ts`, remove `TIC_TAC_TOE,` from the `from "./games/tic-tac-toe/schemas"` export block (it no longer lives there), and add a new export block (place it right after the `export { ticTacToeDefinition } ...` line):

```ts
export {
  GAME_TYPES,
  type GameType,
  gameTypeSchema,
  TIC_TAC_TOE,
} from "./game-types";
```

The tic-tac-toe schemas export block must no longer list `TIC_TAC_TOE`:

```ts
export {
  type Cell,
  type Mark,
  type TicTacToeConfig,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeConfigSchema,
  ticTacToeMoveSchema,
  ticTacToeStateSchema,
} from "./games/tic-tac-toe/schemas";
```

- [ ] **Step 9: Run the test and the type-check**

Run: `cd packages/games-core && bun test tests/game-types.test.ts && bunx tsc --noEmit`
Expected: PASS, no type errors. Then from the repo root: `bun run type-check` — Expected: green (GameJson is still `string`, so no consumer breaks yet).

- [ ] **Step 10: Commit**

```bash
git add packages/games-core
git commit -m "feat(games-core): single-source GameType + gameTypeSchema from a leaf module"
```

---

### Task 2: Drift guard — `GAME_TYPES` must match the registry

**Files:**
- Modify: `packages/games-core/tests/conformance.test.ts`

- [ ] **Step 1: Add `GAME_TYPES` + `listGameTypes` to the test imports**

In `packages/games-core/tests/conformance.test.ts`, change line 3 from:

```ts
import { GAME_CATEGORIES, GAMES } from "../src/index";
```

to:

```ts
import { GAME_CATEGORIES, GAME_TYPES, GAMES, listGameTypes } from "../src/index";
```

- [ ] **Step 2: Add the drift assertion**

Inside the existing `describe("GAMES registry", () => { ... })` block, add this test after the existing `"is non-empty and has unique types"` test:

```ts
  test("GAME_TYPES matches the registry exactly", () => {
    expect([...GAME_TYPES].sort()).toEqual(listGameTypes().sort());
  });
```

- [ ] **Step 3: Run the test**

Run: `cd packages/games-core && bun test tests/conformance.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/games-core/tests/conformance.test.ts
git commit -m "test(games-core): assert GAME_TYPES never drifts from the registry"
```

---

### Task 3: games-client registries driven by the single source

**Files:**
- Modify: `packages/games-client/src/registry.ts`

- [ ] **Step 1: Import the slug constant and `GameType`**

In `packages/games-client/src/registry.ts`, add after the existing imports:

```ts
import { type GameType, TIC_TAC_TOE } from "@gamelobby/games-core";
```

- [ ] **Step 2: Type both registries against `GameType` and use computed keys**

Replace the two registry declarations:

```ts
const REGISTRY: Record<GameType, ComponentType<GameClientProps>> = {
  [TIC_TAC_TOE]: lazy(() =>
    import("./games/tic-tac-toe/client").then((m) => ({
      default: m.TicTacToeGameClient,
    })),
  ),
};

const SKELETON_REGISTRY: Record<GameType, ComponentType> = {
  [TIC_TAC_TOE]: TicTacToeSkeleton,
};
```

- [ ] **Step 3: Keep the getters defensive against unknown strings**

Replace the two getter bodies so the `string` param still works and the `?? fallback` stays meaningful at runtime (widen at the lookup, do not lie with `as GameType`):

```ts
export function getGameClient(
  gameType: string,
): ComponentType<GameClientProps> | null {
  const registry: Record<string, ComponentType<GameClientProps>> = REGISTRY;
  return registry[gameType] ?? null;
}

export function getGameSkeleton(gameType: string): ComponentType {
  const registry: Record<string, ComponentType> = SKELETON_REGISTRY;
  return registry[gameType] ?? DefaultGameSkeleton;
}
```

- [ ] **Step 4: Type-check + run the structural skeleton test**

Run: `bun run type-check` then `cd apps/web && bun test tests/game-skeletons.test.tsx`
Expected: green; skeleton test passes. (A future game added to `GAME_TYPES` without a `REGISTRY`/`SKELETON_REGISTRY` entry now fails to compile.)

- [ ] **Step 5: Commit**

```bash
git add packages/games-client/src/registry.ts
git commit -m "feat(games-client): drive board/skeleton registries from GameType"
```

---

### Task 4: Server read side — `GameRecord.gameType` becomes `GameType`

**Files:**
- Modify: `apps/server/src/db/repositories/games.ts`
- Modify: `apps/server/src/db/repositories/profiles.ts`

- [ ] **Step 1: Import `GameType` and override the read type with a single cast helper**

In `apps/server/src/db/repositories/games.ts`, add to the imports:

```ts
import type { GameType } from "@gamelobby/games-core";
```

Change the `GameRecord` type (line 14) to override the raw row's `gameType`, and add a private helper just below it:

```ts
export type GameRecord = Omit<GameRow, "gameType"> & {
  gameType: GameType;
  players: GamePlayer[];
};

function toGameRecord(row: GameRow, players: GamePlayer[]): GameRecord {
  return { ...row, gameType: row.gameType as GameType, players };
}
```

- [ ] **Step 2: Route all three `GameRecord` construction sites through the helper**

In the same file, replace the three `return { ...row, players }` style returns:

- In `createGame` (currently `return { ...created, players: input.players };`):

```ts
    return toGameRecord(created, input.players);
```

- In `getGameById` (currently `return { ...row, players };`):

```ts
  return toGameRecord(row, players);
```

- In `updateGame` (currently `return { ...row, players };`):

```ts
  return toGameRecord(row, players);
```

- [ ] **Step 3: Narrow `bumpStats` to accept `GameType`**

In `apps/server/src/db/repositories/profiles.ts`, add to the imports:

```ts
import type { GameType } from "@gamelobby/games-core";
```

Change the `bumpStats` signature parameter from `gameType: string` to:

```ts
export async function bumpStats(
  userId: string,
  gameType: GameType,
  outcome: "won" | "lost" | "drawn",
): Promise<void> {
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: green. (`GameRecord.gameType` is now `GameType` and assignable to the still-`string` `GameJson.gameType`; `bumpStats` callers in `turn-based.ts` pass `gameRow.gameType`, now `GameType`.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/repositories/games.ts apps/server/src/db/repositories/profiles.ts
git commit -m "feat(server): narrow GameRecord.gameType to GameType at the repo boundary"
```

---

### Task 5: chat-core schemas use `gameTypeSchema`

**Files:**
- Modify: `packages/chat-core/package.json`
- Modify: `packages/chat-core/src/schemas.ts`
- Modify (test): `packages/chat-core/tests/schemas.test.ts` (create if absent)

- [ ] **Step 1: Add the games-core dependency**

In `packages/chat-core/package.json`, add to `dependencies` (keep alphabetical):

```json
  "dependencies": {
    "@gamelobby/avatar": "workspace:*",
    "@gamelobby/games-core": "workspace:*",
    "zod": "^3.24.1"
  },
```

Then run: `bun install`
Expected: workspace link resolved, no errors.

- [ ] **Step 2: Write the failing test**

Create (or append to) `packages/chat-core/tests/schemas.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { clientCreateGameInConversationSchema } from "../src/schemas";

describe("clientCreateGameInConversationSchema", () => {
  test("accepts a registered gameType", () => {
    const r = clientCreateGameInConversationSchema.safeParse({
      conversationId: "c1",
      gameType: "tic-tac-toe",
    });
    expect(r.success).toBe(true);
  });

  test("rejects an unknown gameType", () => {
    const r = clientCreateGameInConversationSchema.safeParse({
      conversationId: "c1",
      gameType: "chess",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/chat-core && bun test tests/schemas.test.ts`
Expected: FAIL — `"chess"` currently passes `z.string().min(1)`.

- [ ] **Step 4: Swap the three `gameType` fields to `gameTypeSchema`**

In `packages/chat-core/src/schemas.ts`, add the import at the top:

```ts
import { gameTypeSchema } from "@gamelobby/games-core";
```

Then change the three fields:

- In `gameCardMetaSchema`: `gameType: z.string().min(1),` → `gameType: gameTypeSchema,`
- In `notificationPayloadSchema`: `gameType: z.string().optional(),` → `gameType: gameTypeSchema.optional(),`
- In `clientCreateGameInConversationSchema`: `gameType: z.string().min(1),` → `gameType: gameTypeSchema,`

- [ ] **Step 5: Run the test and type-check**

Run: `cd packages/chat-core && bun test tests/schemas.test.ts` then from root `bun run type-check`
Expected: PASS; green. (Server builds `GameCardMeta` from `GameRecord.gameType`, now `GameType` — assignable.)

- [ ] **Step 6: Commit**

```bash
git add packages/chat-core/package.json packages/chat-core/src/schemas.ts packages/chat-core/tests/schemas.test.ts bun.lock
git commit -m "feat(chat-core): validate gameType against the registry enum"
```

---

### Task 6: Narrow the wire DTO — `gameJsonSchema.gameType`

**Files:**
- Modify: `packages/games-core/src/schemas.ts`
- Modify (test): `packages/games-core/tests/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/games-core/tests/schemas.test.ts`, add after the existing `"gameJson rejects an invalid status"` test:

```ts
  test("gameJson rejects an unknown gameType", () => {
    expect(
      gameJsonSchema.safeParse({
        id: "g1",
        gameType: "chess",
        status: "active",
        winner: null,
        players: [],
      }).success,
    ).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/games-core && bun test tests/schemas.test.ts`
Expected: FAIL — `gameType: z.string()` still accepts `"chess"`.

- [ ] **Step 3: Use the registry enum in `gameJsonSchema`**

In `packages/games-core/src/schemas.ts`, add the import at the top:

```ts
import { gameTypeSchema } from "./game-types";
```

Change the `gameJsonSchema` field (line 46) from `gameType: z.string(),` to:

```ts
  gameType: gameTypeSchema,
```

- [ ] **Step 4: Run the test and type-check**

Run: `cd packages/games-core && bun test tests/schemas.test.ts` then from root `bun run type-check`
Expected: PASS; green. (`serializeGame` builds `GameJson` from `GameRecord.gameType`, now `GameType`.)

- [ ] **Step 5: Commit**

```bash
git add packages/games-core/src/schemas.ts packages/games-core/tests/schemas.test.ts
git commit -m "feat(games-core): validate GameJson.gameType against the registry enum"
```

---

### Task 7: Server create-input side accepts `GameType`

**Files:**
- Modify: `apps/server/src/db/repositories/games.ts`
- Modify: `apps/server/src/chat/games-in-chat-service.ts`
- Modify: `apps/server/src/api/routes/conversations.ts`

- [ ] **Step 1: Narrow the create-input type**

In `apps/server/src/db/repositories/games.ts`, change `CreateGameInput.gameType` from `gameType: string;` to:

```ts
  gameType: GameType;
```

(`GameType` is already imported from Task 4.)

- [ ] **Step 2: Narrow the service input**

In `apps/server/src/chat/games-in-chat-service.ts`, add `type GameType` to the existing games-core import:

```ts
import {
  type GameJson,
  type GameType,
  getDefinition,
  hasEngine,
} from "@gamelobby/games-core";
```

Change the `createGameInConversation` input field from `gameType: string;` to:

```ts
  gameType: GameType;
```

- [ ] **Step 3: Validate the REST body with `gameTypeSchema`**

In `apps/server/src/api/routes/conversations.ts`, add `gameTypeSchema` to the games-core import (add the import if none exists):

```ts
import { gameTypeSchema } from "@gamelobby/games-core";
```

In the `.post("/:id/games", ...)` handler, replace the inline `gameType: typeof body?.gameType === "string" ? body.gameType : ""` by validating first. Insert before the `createGameInConversation` call:

```ts
    const parsedType = gameTypeSchema.safeParse(body?.gameType);
    if (!parsedType.success) {
      return c.json({ error: "Unsupported game type" }, 400);
    }
```

and change the call's field to:

```ts
      gameType: parsedType.data,
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: green. (The socket caller passes `data.gameType`, now `GameType` from Task 5; the REST caller passes `parsedType.data`.)

- [ ] **Step 5: Run the server game-creation tests**

Run: `cd apps/server && bun test tests/games-in-chat.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/repositories/games.ts apps/server/src/chat/games-in-chat-service.ts apps/server/src/api/routes/conversations.ts
git commit -m "feat(server): accept GameType on the game-creation paths"
```

---

### Task 8: Web props/args use `GameType`

**Files:**
- Modify: `apps/web/app/play/[gameId]/play-client.tsx`
- Modify: `apps/web/app/games/components/conversation-picker.tsx`
- Modify: `apps/web/app/chat/[handle]/game-launcher.tsx`
- Modify: `apps/web/app/chat/[handle]/game-card-message.tsx`
- Modify: `apps/web/lib/profile-activity-games.ts`

- [ ] **Step 1: `play-client.tsx`**

Add `GameType` to the games-client import block (it already imports from `@gamelobby/games-client`, but `GameType` lives in games-core — add a games-core import):

```ts
import type { GameType } from "@gamelobby/games-core";
```

Change the prop type `gameType: string;` to `gameType: GameType;`. (The value comes from the loaded game's `gameType`, now `GameType`; if the parent passes a `string`, narrow it at the source — `initialGame.gameType` is `GameType`.)

- [ ] **Step 2: `conversation-picker.tsx`**

Add:

```ts
import type { GameType } from "@gamelobby/games-core";
```

Change the prop type `gameType: string;` to `gameType: GameType;`.

- [ ] **Step 3: `game-launcher.tsx`**

Change the existing games-core import to also bring in `TIC_TAC_TOE` and `GameType`:

```ts
import { type GameType, listGameMeta, TIC_TAC_TOE } from "@gamelobby/games-core";
```

Change the destructured default and the prop type. The default must be a real `GameType` (not `""`):

```ts
export function GameLauncher({
  conversation,
  userId,
  gameType = listGameMeta()[0]?.type ?? TIC_TAC_TOE,
}: {
  conversation: ConversationJson;
  userId: string;
  gameType?: GameType;
}) {
```

- [ ] **Step 4: `game-card-message.tsx`**

Add:

```ts
import type { GameType } from "@gamelobby/games-core";
```

Change the helper signature `function gameName(gameType: string): string {` to:

```ts
function gameName(gameType: GameType): string {
```

(`meta.gameType` is now `GameType` from chat-core.)

- [ ] **Step 5: `profile-activity-games.ts`**

Change the existing import to add `GameType`:

```ts
import { type GameType, listGameMeta } from "@gamelobby/games-core";
```

Change `ProfileActivityApiRow.gameType` from `gameType: string;` to:

```ts
  gameType: GameType;
```

- [ ] **Step 6: Type-check + web tests**

Run: `bun run type-check` then `cd apps/web && bun test`
Expected: green; tests pass. If `play-client.tsx`'s parent (`app/play/[gameId]/page.tsx`) reports a `string`→`GameType` error, narrow the source there: the value comes from the loaded `GameJson.gameType`, which is `GameType`, so pass that field directly rather than a re-derived string.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): type gameType props/args as GameType"
```

---

### Task 9: Replace raw slug literals in test fixtures with the constant

Convert **fixture/setup** usages of `"tic-tac-toe"` to the imported `TIC_TAC_TOE`. **Leave assertions** that check the literal value (`expect(...).toBe("tic-tac-toe")`, `.toContain("tic-tac-toe")`, object-key reads like `stats["tic-tac-toe"]`) as raw strings — they intentionally pin the wire contract.

**Files (fixtures only):**
- `packages/games-core/tests/schemas.test.ts`
- `apps/web/tests/game-skeletons.test.tsx`
- `apps/server/tests/serialize.test.ts`
- `apps/server/tests/games-in-chat.test.ts`
- `apps/server/tests/turn-based.test.ts`
- `apps/server/tests/game-card.test.ts`
- `apps/server/integration/game-flows.test.ts`
- `apps/server/integration/games-in-chat-edge.test.ts`
- `apps/server/integration/game-driver.test.ts`

- [ ] **Step 1: In each file, import the constant**

Add to each file's imports (games-core test uses the relative path, the rest use the package):

- games-core test: `import { TIC_TAC_TOE } from "../src/index";` (merge into the existing `../src/index` import if present)
- all others: `import { TIC_TAC_TOE } from "@gamelobby/games-core";`

- [ ] **Step 2: Swap fixture occurrences**

In each file, replace `gameType: "tic-tac-toe"` (object fixtures passed into create/serialize helpers) with `gameType: TIC_TAC_TOE`. Do **not** touch:
- `expect(g.gameType).toBe("tic-tac-toe")` (serialize.test.ts) — assertion.
- `expect(meta.gameType).toBe("tic-tac-toe")` (game-card.test.ts) — assertion.
- `expect(getEngine("tic-tac-toe"))...`, `expect(hasEngine("tic-tac-toe"))...`, `expect(listGameTypes()).toContain("tic-tac-toe")` (tic-tac-toe.test.ts is not in this list, but apply the same rule anywhere) — assertions.
- `profile?.stats?.["tic-tac-toe"]` (game-driver.test.ts) — keyed read asserting the stored key.

- [ ] **Step 3: Type-check + run the full test suite**

Run: `bun run type-check` then `bun test`
Expected: green; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/games-core/tests apps/web/tests apps/server/tests apps/server/integration
git commit -m "test: reuse the TIC_TAC_TOE slug constant in fixtures"
```

---

### Task 10: Sync docs and the game-builder agent

**Files:**
- Modify: `docs/adding-a-game.md`
- Modify: `.claude/agents/game-builder.md`
- Modify: the `docs/architecture/*` page(s) that describe the `gameType` field / game schemas

- [ ] **Step 1: Find the doc sites to update**

Run: `rg -n "gameType|game type|TIC_TAC_TOE|slug" docs/adding-a-game.md .claude/agents/game-builder.md docs/architecture`
Expected: a list of the passages describing where a game's type/slug is declared and how schemas validate `gameType`.

- [ ] **Step 2: Update `docs/adding-a-game.md`**

In the step that scaffolds `games-core/src/games/<type>/...`, state that the slug now lives in `packages/games-core/src/game-types.ts`: declare a `export const <SLUG> = "<type>";` constant there and append it to `GAME_TYPES` (`export const GAME_TYPES = [TIC_TAC_TOE, <SLUG>] as const;`). The game's `meta.ts`/`engine.ts` import the slug from `../../game-types`. Note that `getDefinition`/`hasEngine` reject unknown types at runtime, and the conformance drift test asserts `GAME_TYPES` matches the registry. Also note the games-client `Record<GameType, …>` registries require a board + skeleton entry per game (compile error otherwise).

- [ ] **Step 3: Update `.claude/agents/game-builder.md`**

Mirror the same change in the agent's scaffolding checklist: add "declare the slug constant + append to `GAME_TYPES` in `game-types.ts`" and "register the board/skeleton in the `Record<GameType, …>` maps".

- [ ] **Step 4: Update the architecture page(s)**

In the `docs/architecture/*` page(s) found in Step 1 that describe the wire schemas / `gameType`, note that `gameType` is the `GameType` union derived from `GAME_TYPES`, validated by `gameTypeSchema`, with `GameRecord.gameType` narrowed at the repo boundary.

- [ ] **Step 5: Commit**

```bash
git add docs .claude/agents/game-builder.md
git commit -m "docs: gameType is now a registry-derived GameType; slug lives in game-types.ts"
```

---

### Task 11: Final whole-repo verification

- [ ] **Step 1: Type-check, test, lint**

Run, in order:

```bash
bun run type-check
bun test
bun run check
```

Expected: all green. `bun run type-check` is the real proof that props/args now reject non-`GameType` values and that the games-client registries are exhaustive.

- [ ] **Step 2: Confirm no stray raw slug literals remain in production code**

Run: `rg -n '"tic-tac-toe"' packages apps | rg -v 'tests/|integration/|/tests|\.test\.'`
Expected: only `packages/games-core/src/game-types.ts` (the single declaration). Any other production hit is a miss — replace it with `TIC_TAC_TOE`.

- [ ] **Step 3: Final commit (only if Step 2 required fixes)**

```bash
git add -A
git commit -m "chore: remove remaining raw gameType slug literals"
```

---

## Self-Review

**Spec coverage:**
- Single source `game-types.ts` (slug + tuple + type + schema) → Task 1. ✅
- Slug declared once / reused → Tasks 1, 3, 9; verified Task 11 Step 2. ✅
- Parse-time rejection on inputs → Tasks 5 (chat-core), 6 (gameJson), 7 (REST body). ✅
- Propagate `GameType` to props/params/inputs → Tasks 4, 7, 8. ✅
- Collapse games-client registries → Task 3. ✅
- `GameMeta.type` narrowed, `hasEngine` guard, `listGameTypes(): GameType[]` → Task 1. ✅
- DB→app chokepoint cast (`GameRecord`) → Task 4. ✅
- Drift guard test → Task 2. ✅
- Docs/agents sync → Task 10. ✅
- Non-goal honored: DB column stays `text` (no migration task); `getDefinition`/`getEngine` keep `string` (untouched). ✅
- Boundary decision: `api/routes/profiles.ts` `activityRow` consumes raw `GameRow`s and stays `string` (a DB-read boundary, not an app-level arg) — deliberately not in scope; matches the spec's "raw rows stay string" stance.

**Placeholder scan:** No TBD/TODO; every code step has concrete code; the only ellipses are in prose referencing existing handlers, not in code to be written.

**Type consistency:** `GameType`, `gameTypeSchema`, `GAME_TYPES`, `TIC_TAC_TOE`, `toGameRecord`, `GameRecord` used identically across tasks. `hasEngine(type: string): type is GameType` consistent with its later use as a narrowing guard.
