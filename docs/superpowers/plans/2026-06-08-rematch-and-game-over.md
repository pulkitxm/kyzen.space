# Rematch + Game-Over Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let finished games show a game-over modal and start a linked **rematch series**, with a series scoreboard + "View series" modal in chat and a one-live-game-per-type-per-conversation rule.

**Architecture:** Games gain a self-referencing `seriesId` (id of the first game in the series). The server adds a `game:rematch` socket event that pre-seats both prior players with loser-first roles into a new `active` game in the same conversation; a `GET /api/games/:gameId/series` endpoint returns the series score + game list. The chat game card and a new game-over modal render a shared `SeriesScoreboard`.

**Tech stack:** Bun + TypeScript monorepo, Drizzle/Postgres, Hono, Socket.IO, Next.js 16 + React 19 + Jotai + framer-motion, Zod (only in `@gamelobby/shared`).

**Spec:** `docs/superpowers/specs/2026-06-08-rematch-and-game-over-design.md`

**Conventions (read before starting):**
- **No comments** in any code file (`//`, `/* */`, JSDoc all forbidden; only tooling directives like `biome-ignore`). Self-documenting names only.
- **Icons:** `react-icons/fa6` first.
- **Zod lives only in `@gamelobby/shared`.** Elsewhere import `z` and schemas from `@gamelobby/shared/types`.
- After each task: `bun run type-check` must pass. Before committing UI: `bun run check`.
- The dev DB is **push-managed**: apply schema changes with `bun run db:push`, never `db:migrate`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File map

**Create:**
- `packages/shared/src/types/games/series.ts` — series Zod schemas + inferred types.
- `apps/server/src/chat/series.ts` — pure `computeSeriesScore`.
- `apps/server/src/chat/rematch-seating.ts` — pure `computeRematchSeating`.
- `apps/web/components/games/series-scoreboard.tsx` — avatars-over-score block.
- `apps/web/components/games/series-detail-modal.tsx` — series modal content (score + game list).
- `apps/web/app/play/[gameId]/game-over-overlay.tsx` — the game-over modal.
- Tests: `packages/shared/tests/series.test.ts`, `apps/server/tests/series.test.ts`, `apps/server/tests/rematch-seating.test.ts`, `apps/server/tests/rematch.test.ts`.

**Modify:**
- `packages/shared/src/types/games/index.ts` (export series), `packages/shared/src/constants/chat.ts` (events), `packages/shared/src/types/chat/schemas.ts` (`clientRematchSchema`, `seriesScore` on card meta), `packages/shared/src/types/chat/socket-events.ts` + `chat/index.ts` (event types).
- `packages/database/src/schema.ts` (`seriesId` column), `packages/shared/src/types/db/index.ts` (`GameRow`, `CreateGameInput`), `packages/shared/src/types/db/io.ts` (`createGameInputSchema`), `packages/database/src/repositories/games.ts` (id+seriesId on create; `getSeriesGames`; `findLiveGameInConversation`).
- `apps/server/src/chat/games-in-chat-service.ts` (one-live guard, `rematchGame`, shared `announceGame`), `apps/server/src/realtime/games-in-chat.ts` (rematch handler), `apps/server/src/chat/game-card.ts` + `apps/server/src/chat/assemble.ts` (series enrichment), `apps/server/src/api/routes/games.ts` + `apps/server/src/api/serialize.ts` (series endpoint).
- `apps/web/app/play/[gameId]/play-client.tsx` (mount overlay), `apps/web/app/chat/[handle]/game-card-message.tsx` (scoreboard + buttons).
- Docs: `docs/architecture/realtime.md`, `database.md`, `database-schema.md`, `web.md`.

---

## Phase A — Shared types & constants

### Task 1: Series Zod schemas + types

**Files:**
- Create: `packages/shared/src/types/games/series.ts`
- Modify: `packages/shared/src/types/games/index.ts`
- Test: `packages/shared/tests/series.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/series.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import { seriesDetailSchema, seriesScoreSchema } from "../src/types";

describe("series score schema", () => {
  test("accepts a valid score", () => {
    const r = seriesScoreSchema.safeParse({
      entries: [{ userId: "u1", username: "aman", wins: 2 }],
      draws: 1,
      completedGames: 3,
      totalGames: 4,
    });
    expect(r.success).toBe(true);
  });

  test("rejects a negative win count", () => {
    const r = seriesScoreSchema.safeParse({
      entries: [{ userId: "u1", username: "aman", wins: -1 }],
      draws: 0,
      completedGames: 0,
      totalGames: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe("series detail schema", () => {
  test("accepts a valid detail", () => {
    const r = seriesDetailSchema.safeParse({
      seriesId: "11111111-1111-1111-1111-111111111111",
      gameType: TIC_TAC_TOE,
      score: { entries: [], draws: 0, completedGames: 0, totalGames: 1 },
      games: [
        {
          gameId: "K7P2QX",
          gameNumber: 1,
          status: "completed",
          winner: "u1",
          winnerUsername: "aman",
          completedAt: null,
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test tests/series.test.ts`
Expected: FAIL — `seriesScoreSchema`/`seriesDetailSchema` are not exported.

- [ ] **Step 3: Create the schemas**

Create `packages/shared/src/types/games/series.ts`:

```ts
import { z } from "zod";
import { avatarConfigSchema } from "../avatar";
import { gameTypeSchema } from "./core";
import { gameStatusSchema } from "./wire";

export const seriesScoreEntrySchema = z.object({
  userId: z.string(),
  username: z.string(),
  wins: z.number().int().nonnegative(),
  avatar: avatarConfigSchema.nullable().optional(),
});

export const seriesScoreSchema = z.object({
  entries: z.array(seriesScoreEntrySchema),
  draws: z.number().int().nonnegative(),
  completedGames: z.number().int().nonnegative(),
  totalGames: z.number().int().nonnegative(),
});

export const seriesGameSummarySchema = z.object({
  gameId: z.string(),
  gameNumber: z.number().int().positive(),
  status: gameStatusSchema,
  winner: z.string().nullable(),
  winnerUsername: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export const seriesDetailSchema = z.object({
  seriesId: z.string(),
  gameType: gameTypeSchema,
  score: seriesScoreSchema,
  games: z.array(seriesGameSummarySchema),
});

export type SeriesScoreEntry = z.infer<typeof seriesScoreEntrySchema>;
export type SeriesScore = z.infer<typeof seriesScoreSchema>;
export type SeriesGameSummary = z.infer<typeof seriesGameSummarySchema>;
export type SeriesDetail = z.infer<typeof seriesDetailSchema>;
```

> Verify the avatar import: `avatarConfigSchema` is exported from `@gamelobby/shared/types`. If `../avatar` does not resolve it, run `grep -rn "avatarConfigSchema" packages/shared/src/types` and import from the file that defines it.

- [ ] **Step 4: Export from the games barrel**

In `packages/shared/src/types/games/index.ts`, append:

```ts
export {
  type SeriesDetail,
  type SeriesGameSummary,
  type SeriesScore,
  type SeriesScoreEntry,
  seriesDetailSchema,
  seriesGameSummarySchema,
  seriesScoreEntrySchema,
  seriesScoreSchema,
} from "./series";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && bun test tests/series.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check and commit**

```bash
bun run type-check
git add packages/shared/src/types/games/series.ts packages/shared/src/types/games/index.ts packages/shared/tests/series.test.ts
git commit -m "feat(shared): series score + detail schemas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Chat events, rematch payload schema, and `seriesScore` on the card

**Files:**
- Modify: `packages/shared/src/constants/chat.ts`
- Modify: `packages/shared/src/types/chat/schemas.ts`
- Modify: `packages/shared/src/types/chat/socket-events.ts`
- Modify: `packages/shared/src/types/chat/index.ts`
- Test: `packages/shared/tests/series.test.ts` (extend)

- [ ] **Step 1: Add the failing test**

Append to `packages/shared/tests/series.test.ts`:

```ts
import {
  clientRematchSchema,
  gameCardMetaSchema,
} from "../src/types";

describe("rematch payload schema", () => {
  test("accepts a game id", () => {
    expect(clientRematchSchema.safeParse({ gameId: "K7P2QX" }).success).toBe(
      true,
    );
  });
  test("rejects an empty payload", () => {
    expect(clientRematchSchema.safeParse({}).success).toBe(false);
  });
});

describe("game card meta with series score", () => {
  test("accepts an optional seriesScore", () => {
    const r = gameCardMetaSchema.safeParse({
      gameId: "K7P2QX",
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
      creatorUsername: "aman",
      seriesScore: {
        entries: [{ userId: "u1", username: "aman", wins: 1 }],
        draws: 0,
        completedGames: 1,
        totalGames: 2,
      },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test tests/series.test.ts`
Expected: FAIL — `clientRematchSchema` not exported; `gameCardMetaSchema` rejects unknown `seriesScore` (it is `.strict()`).

- [ ] **Step 3: Add the events**

In `packages/shared/src/constants/chat.ts`, add inside `CHAT_EVENTS` — `rematch` next to `createGameInConversation`, and `rematchCreated` in the server-events block:

```ts
  createGameInConversation: "game:create_in_conversation",
  rematch: "game:rematch",
```

```ts
  messageUpdated: "message_updated",
  rematchCreated: "game:rematch_created",
```

- [ ] **Step 4: Add the rematch schema + seriesScore on card meta**

In `packages/shared/src/types/chat/schemas.ts`, add the series import at the top (next to the existing `gameTypeSchema` import):

```ts
import { seriesScoreSchema } from "../games/series";
```

Add `seriesScore` as the last field of `gameCardMetaSchema` (before `.strict()`):

```ts
    players: z.array(gameCardPlayerSchema).optional(),
    seriesScore: seriesScoreSchema.optional(),
  })
  .strict();
```

At the end of the file add:

```ts
export const clientRematchSchema = z
  .object({ gameId: z.string().min(1) })
  .strict();
```

- [ ] **Step 5: Add the event types and export them**

In `packages/shared/src/types/chat/socket-events.ts` add:

```ts
export type ClientRematch = z.infer<typeof clientRematchSchema>;
export type ServerRematchCreated = { newGameId: string };
```

Ensure `clientRematchSchema` is imported there the same way the other client schemas are (check the file's existing imports from `./schemas`). In `packages/shared/src/types/chat/index.ts` add `clientRematchSchema` to the `export { … } from "./schemas"` block and `ClientRematch` + `ServerRematchCreated` to the `export type { … } from "./socket-events"` block.

- [ ] **Step 6: Run test, type-check, commit**

Run: `cd packages/shared && bun test tests/series.test.ts` → Expected: PASS.

```bash
bun run type-check
git add packages/shared/src/constants/chat.ts packages/shared/src/types/chat/schemas.ts packages/shared/src/types/chat/socket-events.ts packages/shared/src/types/chat/index.ts packages/shared/tests/series.test.ts
git commit -m "feat(shared): rematch events + payload schema + card seriesScore

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — Database

### Task 3: `seriesId` column + types + create-time population

**Files:**
- Modify: `packages/database/src/schema.ts`
- Modify: `packages/shared/src/types/db/index.ts`
- Modify: `packages/shared/src/types/db/io.ts`
- Modify: `packages/database/src/repositories/games.ts`

- [ ] **Step 1: Add the column to the Drizzle schema**

In `packages/database/src/schema.ts`, import `AnyPgColumn` (add to the existing `drizzle-orm/pg-core` import):

```ts
import { type AnyPgColumn, /* …existing… */ } from "drizzle-orm/pg-core";
```

In the `game` table, add `seriesId` after `challengedUserId` and a series index in the table-config tuple:

```ts
    challengedUserId: text("challenged_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    seriesId: uuid("series_id").references((): AnyPgColumn => game.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
```

```ts
  (t) => [
    index("game_conversation_idx").on(t.conversationId),
    index("game_series_idx").on(t.seriesId),
  ],
```

- [ ] **Step 2: Add `seriesId` to the hand-written row + input types**

In `packages/shared/src/types/db/index.ts`, add to `GameRow` (after `challengedUserId`):

```ts
  challengedUserId: string | null;
  seriesId: string | null;
  startedAt: Date | null;
```

Add to `CreateGameInput` (after `challengedUserId`):

```ts
  challengedUserId?: string | null;
  seriesId?: string | null;
};
```

In `packages/shared/src/types/db/io.ts`, add to `createGameInputSchema` (after `challengedUserId`):

```ts
  challengedUserId: z.string().nullable().optional(),
  seriesId: z.string().nullable().optional(),
});
```

- [ ] **Step 3: Populate `seriesId` in `createGame`**

In `packages/database/src/repositories/games.ts`, add at the top:

```ts
import { randomUUID } from "node:crypto";
```

Replace the `db.transaction` body's insert so the id is generated app-side and `seriesId` defaults to the game's own id:

```ts
      return await db.transaction(async (tx) => {
        const id = randomUUID();
        const [row] = await tx
          .insert(game)
          .values({
            id,
            gameType: input.gameType,
            status: input.status ?? "waiting",
            gameState: input.gameState,
            config: input.config ?? null,
            winner: null,
            seriesId: input.seriesId ?? id,
            conversationId: input.conversationId ?? null,
            creatorUserId: input.creatorUserId ?? null,
            seatingMode: input.seatingMode ?? null,
            challengedUserId: input.challengedUserId ?? null,
          })
          .returning();
        if (!row) throw new Error("Failed to create game");
        const created = row;
        if (input.players.length) {
          await tx.insert(gamePlayer).values(
            input.players.map((p, i) => ({
              gameId: created.id,
              userId: p.userId,
              username: p.username,
              role: p.role,
              seatOrder: i,
            })),
          );
        }
        return toGameRecord(created, input.players);
      });
```

- [ ] **Step 4: Type-check (drift-guard verifies schema↔type)**

Run: `bun run type-check`
Expected: PASS. (A mismatch between `game.$inferSelect` and `GameRow` would surface here via `drift-guard.ts`.)

- [ ] **Step 5: Generate + apply the migration**

```bash
bun run db:start
bun run db:generate
bun run db:push
```

Expected: `db:generate` writes a new SQL file under `packages/database/drizzle/` adding `series_id` + the FK + index; `db:push` applies it (answer non-interactively / accept the additive change).

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/schema.ts packages/shared/src/types/db/index.ts packages/shared/src/types/db/io.ts packages/database/src/repositories/games.ts packages/database/drizzle
git commit -m "feat(db): add game.seriesId self-reference, set on create

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Repository reads — `getSeriesGames` + `findLiveGameInConversation`

**Files:**
- Modify: `packages/database/src/repositories/games.ts`

- [ ] **Step 1: Ensure drizzle operators are imported**

In `packages/database/src/repositories/games.ts`, the `eq` import already exists; extend the `drizzle-orm` import to include `and`, `inArray`, `desc`:

```ts
import { and, asc, desc, eq, inArray } from "drizzle-orm";
```

> If `asc` is not used elsewhere, omit it; `getSeriesGames` below uses `game.createdAt` ordering ascending, which is the default for `.orderBy(game.createdAt)` so `asc` is optional.

- [ ] **Step 2: Add the two functions**

Append to `packages/database/src/repositories/games.ts`:

```ts
export async function getSeriesGames(seriesId: string): Promise<GameRecord[]> {
  const rows = await db
    .select()
    .from(game)
    .where(eq(game.seriesId, seriesId))
    .orderBy(game.createdAt);
  const records: GameRecord[] = [];
  for (const row of rows) {
    const players = await getPlayers(row.id);
    records.push(toGameRecord(row, players));
  }
  return records;
}

export async function findLiveGameInConversation(
  conversationId: string,
  gameType: GameType,
): Promise<GameRecord | null> {
  const [row] = await db
    .select()
    .from(game)
    .where(
      and(
        eq(game.conversationId, conversationId),
        eq(game.gameType, gameType),
        inArray(game.status, ["waiting", "active"]),
      ),
    )
    .orderBy(desc(game.createdAt))
    .limit(1);
  if (!row) return null;
  const players = await getPlayers(row.id);
  return toGameRecord(row, players);
}
```

> `GameType` is already imported in this file (used by `toGameRecord`). If not, add `type GameType` to the `@gamelobby/shared/types` import.

- [ ] **Step 3: Type-check and commit**

```bash
bun run type-check
git add packages/database/src/repositories/games.ts
git commit -m "feat(db): getSeriesGames + findLiveGameInConversation reads

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Server logic

### Task 5: `computeSeriesScore` (pure)

**Files:**
- Create: `apps/server/src/chat/series.ts`
- Test: `apps/server/tests/series.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/series.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { GameRecord } from "@gamelobby/database";
import { computeSeriesScore } from "../src/chat/series";

function game(status: string, winner: string | null): GameRecord {
  return {
    players: [
      { userId: "u1", username: "aman", role: "X" },
      { userId: "u2", username: "riya", role: "O" },
    ],
    status,
    winner,
  } as unknown as GameRecord;
}

describe("computeSeriesScore", () => {
  test("tallies wins, draws, and totals", () => {
    const score = computeSeriesScore([
      game("completed", "u1"),
      game("completed", "draw"),
      game("completed", "u1"),
      game("active", null),
    ]);
    expect(score.totalGames).toBe(4);
    expect(score.completedGames).toBe(3);
    expect(score.draws).toBe(1);
    const aman = score.entries.find((e) => e.userId === "u1");
    const riya = score.entries.find((e) => e.userId === "u2");
    expect(aman?.wins).toBe(2);
    expect(riya?.wins).toBe(0);
  });

  test("empty series is zeroed", () => {
    const score = computeSeriesScore([]);
    expect(score).toEqual({
      entries: [],
      draws: 0,
      completedGames: 0,
      totalGames: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/series.test.ts`
Expected: FAIL — `computeSeriesScore` not found.

- [ ] **Step 3: Implement**

Create `apps/server/src/chat/series.ts`:

```ts
import type { GameRecord } from "@gamelobby/database";
import type { SeriesScore, SeriesScoreEntry } from "@gamelobby/shared/types";

export function computeSeriesScore(seriesGames: GameRecord[]): SeriesScore {
  const byUser = new Map<string, SeriesScoreEntry>();
  for (const g of seriesGames) {
    for (const p of g.players) {
      if (!byUser.has(p.userId)) {
        byUser.set(p.userId, {
          userId: p.userId,
          username: p.username,
          wins: 0,
          avatar: p.avatar ?? null,
        });
      }
    }
  }

  let draws = 0;
  let completedGames = 0;
  for (const g of seriesGames) {
    if (g.status !== "completed") continue;
    completedGames += 1;
    if (g.winner === "draw") {
      draws += 1;
    } else if (g.winner) {
      const entry = byUser.get(g.winner);
      if (entry) entry.wins += 1;
    }
  }

  return {
    entries: [...byUser.values()],
    draws,
    completedGames,
    totalGames: seriesGames.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test tests/series.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/chat/series.ts apps/server/tests/series.test.ts
git commit -m "feat(server): pure computeSeriesScore

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `computeRematchSeating` (loser-first seam)

**Files:**
- Create: `apps/server/src/chat/rematch-seating.ts`
- Test: `apps/server/tests/rematch-seating.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/rematch-seating.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { GameRecord } from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { computeRematchSeating } from "../src/chat/rematch-seating";

function prev(winner: string | null): GameRecord {
  return {
    gameType: TIC_TAC_TOE,
    winner,
    players: [
      { userId: "u1", username: "aman", role: "X" },
      { userId: "u2", username: "riya", role: "O" },
    ],
  } as unknown as GameRecord;
}

describe("computeRematchSeating (2 players)", () => {
  test("loser of a decisive game goes first", () => {
    expect(computeRematchSeating(prev("u1"))).toEqual(["u2", "u1"]);
    expect(computeRematchSeating(prev("u2"))).toEqual(["u1", "u2"]);
  });

  test("a draw swaps the previous first mover", () => {
    expect(computeRematchSeating(prev("draw"))).toEqual(["u2", "u1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/rematch-seating.test.ts`
Expected: FAIL — `computeRematchSeating` not found.

- [ ] **Step 3: Implement**

Create `apps/server/src/chat/rematch-seating.ts`:

```ts
import type { GameRecord } from "@gamelobby/database";
import { getDefinition } from "@gamelobby/games-core";

export function computeRematchSeating(prev: GameRecord): string[] {
  const { engine } = getDefinition(prev.gameType);
  const firstRole = engine.roles[0];
  const ordered = [...prev.players].sort(
    (a, b) => engine.roles.indexOf(a.role) - engine.roles.indexOf(b.role),
  );
  const ids = ordered.map((p) => p.userId);

  if (ids.length === 2) {
    const prevStarter =
      ordered.find((p) => p.role === firstRole)?.userId ?? ids[0];
    let firstMover: string;
    if (prev.winner && prev.winner !== "draw") {
      firstMover = ids.find((id) => id !== prev.winner) ?? ids[0];
    } else {
      firstMover = ids.find((id) => id !== prevStarter) ?? ids[0];
    }
    const other = ids.find((id) => id !== firstMover) ?? ids[0];
    return [firstMover, other];
  }

  return [...ids.slice(1), ids[0]];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test tests/rematch-seating.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/chat/rematch-seating.ts apps/server/tests/rematch-seating.test.ts
git commit -m "feat(server): computeRematchSeating loser-first seam

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `rematchGame` service + one-live guard + shared `announceGame`

**Files:**
- Modify: `apps/server/src/chat/games-in-chat-service.ts`
- Test: `apps/server/tests/rematch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/rematch.test.ts`:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

type AnyGame = {
  id: string;
  code: string;
  gameType: string;
  status: string;
  winner: string | null;
  config: unknown;
  conversationId: string | null;
  seatingMode: string | null;
  challengedUserId: string | null;
  seriesId: string | null;
  players: { userId: string; username: string; role: string }[];
};

let prev: AnyGame;
let liveGame: AnyGame | null;
let createInput: { players: { userId: string; role: string }[]; status?: string; seriesId?: string | null } | null;
const notifyCalls: { userId: string; type: string }[] = [];
const sentCards: { gameId: string }[] = [];

mock.module("@gamelobby/database", () => ({
  conversations: {
    getMemberIds: async () => ["u1", "u2"],
  },
  games: {
    getGameByCode: async () => prev,
    findLiveGameInConversation: async () => liveGame,
    createGame: async (input: AnyGame & { players: { userId: string; username: string; role: string }[] }) => {
      createInput = { players: input.players, status: input.status, seriesId: input.seriesId };
      return { ...input, id: "new-id", code: "NEWGM2" };
    },
  },
}));

mock.module("../src/realtime/notify", () => ({
  notify: async (userId: string, type: string) => {
    notifyCalls.push({ userId, type });
  },
}));

mock.module("../src/chat/messages-service", () => ({
  sendMessage: async (input: { gameId: string }) => {
    sentCards.push({ gameId: input.gameId });
    return { ok: true, value: { id: "msg1" } };
  },
}));

const { rematchGame } = await import("../src/chat/games-in-chat-service");

function freshPrev(over: Partial<AnyGame> = {}): AnyGame {
  return {
    id: "old-id",
    code: "OLDGM1",
    gameType: TIC_TAC_TOE,
    status: "completed",
    winner: "u1",
    config: { firstPlayer: "X" },
    conversationId: "conv1",
    seatingMode: "open",
    challengedUserId: null,
    seriesId: "series1",
    players: [
      { userId: "u1", username: "aman", role: "X" },
      { userId: "u2", username: "riya", role: "O" },
    ],
    ...over,
  };
}

describe("rematchGame", () => {
  beforeEach(() => {
    prev = freshPrev();
    liveGame = null;
    createInput = null;
    notifyCalls.length = 0;
    sentCards.length = 0;
  });

  test("creates an active rematch with loser first and inherited seriesId", async () => {
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    expect(createInput?.status).toBe("active");
    expect(createInput?.seriesId).toBe("series1");
    expect(createInput?.players[0]?.userId).toBe("u2");
    expect(createInput?.players[0]?.role).toBe("X");
    expect(sentCards.length).toBe(1);
    expect(notifyCalls.some((n) => n.userId === "u2")).toBe(true);
  });

  test("de-dupes to an existing live game without creating", async () => {
    liveGame = freshPrev({ id: "live-id", code: "LIVEGM", status: "active" });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.game.id).toBe("LIVEGM");
    expect(createInput).toBeNull();
  });

  test("rejects a rematch from a non-player", async () => {
    const res = await rematchGame({ userId: "u9", gameId: "OLDGM1" });
    expect(res.ok).toBe(false);
  });

  test("rejects a rematch of an unfinished game", async () => {
    prev = freshPrev({ status: "active" });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/rematch.test.ts`
Expected: FAIL — `rematchGame` not exported.

- [ ] **Step 3: Refactor card-posting into `announceGame` and add `rematchGame`**

In `apps/server/src/chat/games-in-chat-service.ts`:

Add imports at the top:

```ts
import type { GameRecord } from "@gamelobby/database";
import { computeRematchSeating } from "./rematch-seating";
```

Add a shared private helper (place it above `createGameInConversation`):

```ts
async function announceGame(opts: {
  game: GameRecord;
  actorUserId: string;
  creatorUsername: string;
  seatingMode: SeatingMode;
  challengedUserId: string | null;
}): Promise<ServiceResult<MessageJson>> {
  const metadata: GameCardMeta = {
    gameId: opts.game.code,
    gameType: opts.game.gameType,
    seatingMode: opts.seatingMode,
    challengedUserId: opts.challengedUserId,
    creatorUsername: opts.creatorUsername,
  };
  const sent = await sendMessage({
    conversationId: opts.game.conversationId as string,
    senderId: opts.actorUserId,
    kind: "game_card",
    metadata,
    gameId: opts.game.id,
  });
  if (!sent.ok) return fail(sent.error, sent.status);

  const memberIds = await conversations.getMemberIds(
    opts.game.conversationId as string,
  );
  for (const uid of memberIds) {
    if (uid === opts.actorUserId) continue;
    await notify(
      uid,
      opts.challengedUserId === uid ? "game_challenge" : "game_started",
      {
        actorId: opts.actorUserId,
        payload: {
          conversationId: opts.game.conversationId as string,
          gameId: opts.game.code,
          gameType: opts.game.gameType,
        },
      },
    );
  }
  return ok(sent.value);
}
```

In `createGameInConversation`, after the membership + engine checks and before creating, add the one-live guard:

```ts
  if (!hasEngine(input.gameType)) return fail("Unsupported game type", 400);

  const existingLive = await games.findLiveGameInConversation(
    input.conversationId,
    input.gameType,
  );
  if (existingLive) {
    return ok({ game: serializeGame(existingLive) });
  }
```

Replace the inline metadata/sendMessage/notify block in `createGameInConversation` with a call to `announceGame` (keeping the `created` game and `profile.username`):

```ts
  const announced = await announceGame({
    game: created,
    actorUserId: input.userId,
    creatorUsername: profile.username,
    seatingMode,
    challengedUserId,
  });
  if (!announced.ok) return fail(announced.error, announced.status);

  return ok({ game: serializeGame(created), message: announced.value });
```

Change the function's return type to make `message` optional (so the one-live branch can omit it):

```ts
): Promise<ServiceResult<{ game: GameJson; message?: MessageJson }>> {
```

Add `rematchGame` at the end of the file:

```ts
export async function rematchGame(input: {
  userId: string;
  gameId: string;
}): Promise<ServiceResult<{ game: GameJson }>> {
  const prev = await games.getGameByCode(input.gameId);
  if (!prev) return fail("Game not found", 404);
  if (prev.status !== "completed") return fail("Game is not finished", 400);
  if (!prev.players.some((p) => p.userId === input.userId)) {
    return fail("Not a player in this game", 403);
  }
  if (!prev.conversationId) return fail("Game is not in a conversation", 400);
  if (!hasEngine(prev.gameType)) return fail("Unsupported game type", 400);

  const existingLive = await games.findLiveGameInConversation(
    prev.conversationId,
    prev.gameType,
  );
  if (existingLive) return ok({ game: serializeGame(existingLive) });

  const { engine } = getDefinition(prev.gameType);
  const orderedUserIds = computeRematchSeating(prev);
  const players = orderedUserIds.map((uid, i) => {
    const seat = prev.players.find((p) => p.userId === uid);
    const role = engine.roles[i];
    if (!seat || !role) throw new Error("Rematch seating mismatch");
    return { userId: uid, username: seat.username, role };
  });
  const becomesActive = players.length >= engine.minPlayers;

  const created = await games.createGame({
    gameType: prev.gameType,
    status: becomesActive ? "active" : "waiting",
    players,
    gameState: engine.createInitialState(players.map((p) => ({ role: p.role }))),
    config: prev.config,
    conversationId: prev.conversationId,
    creatorUserId: input.userId,
    seriesId: prev.seriesId,
    seatingMode: prev.seatingMode ?? undefined,
    challengedUserId: prev.challengedUserId,
  });

  const creatorUsername =
    prev.players.find((p) => p.userId === input.userId)?.username ?? "player";
  const announced = await announceGame({
    game: created,
    actorUserId: input.userId,
    creatorUsername,
    seatingMode: created.seatingMode ?? "open",
    challengedUserId: created.challengedUserId,
  });
  if (!announced.ok) return fail(announced.error, announced.status);

  return ok({ game: serializeGame(created) });
}
```

> `becomesActive` when starting active relies on `createInitialState` accepting the full seat list; the existing `createGameInConversation` seeds only one seat, so confirm the engine's `createInitialState` handles the 2-seat list (tic-tac-toe ignores seats and returns a fresh board — safe).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && bun test tests/rematch.test.ts`
Expected: PASS (4 tests).
Run: `cd apps/server && bun test tests/games-in-chat.test.ts`
Expected: PASS (the create path still returns `{ game, message }`).

- [ ] **Step 5: Type-check and commit**

```bash
bun run type-check
git add apps/server/src/chat/games-in-chat-service.ts apps/server/tests/rematch.test.ts
git commit -m "feat(server): rematchGame service + one-live guard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Rematch socket handler

**Files:**
- Modify: `apps/server/src/realtime/games-in-chat.ts`

- [ ] **Step 1: Implement the handler**

Rewrite `apps/server/src/realtime/games-in-chat.ts` to use `io` and add the rematch handler:

```ts
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import {
  clientCreateGameInConversationSchema,
  clientRematchSchema,
} from "@gamelobby/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import {
  createGameInConversation,
  rematchGame,
} from "../chat/games-in-chat-service";
import { emitToGame } from "./rooms";

export function attachGameChatHandlers(io: IOServer, socket: Socket): void {
  socket.on(
    CHAT_EVENTS.createGameInConversation,
    (payload: unknown, ack?: (res: unknown) => void) => {
      void (async () => {
        const parsed = clientCreateGameInConversationSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({ ok: false, error: "Invalid payload" });
          return;
        }
        const data = parsed.data;
        const res = await createGameInConversation({
          userId: socket.data.userId,
          conversationId: data.conversationId,
          gameType: data.gameType,
          seatingMode: data.seatingMode,
          challengedUserId: data.challengedUserId ?? null,
          config: data.config,
        });
        if (!res.ok) {
          ack?.({ ok: false, error: res.error });
          return;
        }
        ack?.({ ok: true, ...res.value });
      })();
    },
  );

  socket.on(
    CHAT_EVENTS.rematch,
    (payload: unknown, ack?: (res: unknown) => void) => {
      void (async () => {
        const parsed = clientRematchSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({ ok: false, error: "Invalid payload" });
          return;
        }
        const res = await rematchGame({
          userId: socket.data.userId,
          gameId: parsed.data.gameId,
        });
        if (!res.ok) {
          ack?.({ ok: false, error: res.error });
          return;
        }
        emitToGame(io, parsed.data.gameId, CHAT_EVENTS.rematchCreated, {
          newGameId: res.value.game.id,
        });
        ack?.({ ok: true, gameId: res.value.game.id });
      })();
    },
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
bun run type-check
git add apps/server/src/realtime/games-in-chat.ts
git commit -m "feat(server): game:rematch socket handler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Series enrichment on the game card

**Files:**
- Modify: `apps/server/src/chat/game-card.ts`
- Modify: `apps/server/src/chat/assemble.ts`

- [ ] **Step 1: Extend the snapshot + enrichment**

In `apps/server/src/chat/game-card.ts`, add `SeriesScore` to the import and `seriesScore` to the snapshot + return:

```ts
import type { GameCardMeta, SeriesScore } from "@gamelobby/shared/types";

export type GameCardSnapshot = {
  status: string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
  seriesScore?: SeriesScore;
};

export function enrichGameCardMeta(
  base: GameCardMeta,
  game: GameCardSnapshot | null,
): GameCardMeta {
  if (!game) return base;
  const winnerUsername =
    game.winner && game.winner !== "draw"
      ? (game.players.find((p) => p.userId === game.winner)?.username ?? null)
      : null;
  return {
    ...base,
    status: game.status,
    winner: game.winner,
    winnerUsername,
    players: game.players,
    seriesScore: game.seriesScore,
  };
}
```

- [ ] **Step 2: Compute series in `withGameCardStatus`**

In `apps/server/src/chat/assemble.ts`, import `computeSeriesScore` and pass `seriesScore`:

```ts
import { computeSeriesScore } from "./series";
import { enrichGameCardMeta } from "./game-card";
```

Update `withGameCardStatus`:

```ts
async function withGameCardStatus(
  msg: MessageJson,
  row: MessageRow,
): Promise<MessageJson> {
  if (msg.kind !== "game_card" || !row.gameId || !msg.metadata) return msg;
  const game = await games.getGameById(row.gameId);
  if (!game) return msg;
  const seriesGames = game.seriesId
    ? await games.getSeriesGames(game.seriesId)
    : [game];
  return {
    ...msg,
    gameId: game.code,
    metadata: enrichGameCardMeta(msg.metadata as GameCardMeta, {
      status: game.status,
      winner: game.winner,
      players: (game.players ?? []) as GamePlayer[],
      seriesScore: computeSeriesScore(seriesGames),
    }),
  };
}
```

- [ ] **Step 3: Type-check and commit**

```bash
bun run type-check
git add apps/server/src/chat/game-card.ts apps/server/src/chat/assemble.ts
git commit -m "feat(server): enrich game card with series score

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Series API endpoint

**Files:**
- Modify: `apps/server/src/api/serialize.ts`
- Modify: `apps/server/src/api/routes/games.ts`

- [ ] **Step 1: Add `serializeSeries`**

In `apps/server/src/api/serialize.ts`, add (uses the existing `iso()` helper):

```ts
import type {
  GameRecord,
  GameType,
} from "@gamelobby/shared/types";
import type { SeriesDetail, SeriesScore } from "@gamelobby/shared/types";

export function serializeSeries(
  seriesId: string,
  gameType: GameType,
  seriesGames: GameRecord[],
  score: SeriesScore,
): SeriesDetail {
  return {
    seriesId,
    gameType,
    score,
    games: seriesGames.map((g, i) => ({
      gameId: g.code,
      gameNumber: i + 1,
      status: g.status,
      winner: g.winner,
      winnerUsername:
        g.winner && g.winner !== "draw"
          ? (g.players.find((p) => p.userId === g.winner)?.username ?? null)
          : null,
      completedAt: iso(g.completedAt),
    })),
  };
}
```

> `GameRecord`/`GameType` may already be imported in this file — merge rather than duplicate the import.

- [ ] **Step 2: Add the route**

In `apps/server/src/api/routes/games.ts`, import the helpers and chain a `/:gameId/series` route onto `gamesRouter`:

```ts
import { computeSeriesScore } from "../../chat/series";
import { serializeGame, serializeMove, serializeSeries } from "../serialize";
```

```ts
export const gamesRouter = new Hono<LoggerEnv>()
  .get("/:gameId/series", async (c) => {
    const code = c.req.param("gameId");
    if (!isGameCode(code)) return c.json({ error: "Not found" }, 404);
    const found = await games.getGameByCode(code);
    if (!found || !found.seriesId) return c.json({ error: "Not found" }, 404);
    const seriesGames = await games.getSeriesGames(found.seriesId);
    const score = computeSeriesScore(seriesGames);
    return c.json(
      serializeSeries(found.seriesId, found.gameType, seriesGames, score),
    );
  })
  .get("/:gameId", async (c) => {
    const code = c.req.param("gameId");
    if (!isGameCode(code)) return c.json({ error: "Not found" }, 404);
    const found = await games.getGameByCode(code);
    if (!found) return c.json({ error: "Not found" }, 404);
    const moves = await games.listMoves(found.id);
    return c.json({
      game: serializeGame(found),
      moves: moves.map((m) => serializeMove(m, found.code)),
    });
  });
```

> Keep the existing imports (`isGameCode`, `games`, `LoggerEnv`). The `/series` route is registered before `/:gameId` so the more specific path matches first.

- [ ] **Step 3: Type-check and commit**

```bash
bun run type-check
git add apps/server/src/api/serialize.ts apps/server/src/api/routes/games.ts
git commit -m "feat(server): GET /api/games/:gameId/series endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Integration test — rematch end-to-end

**Files:**
- Create: `apps/server/integration/rematch.test.ts`

- [ ] **Step 1: Write the integration test**

Create `apps/server/integration/rematch.test.ts` (mirrors `game-driver.test.ts` setup):

```ts
import { afterAll, describe, expect, it } from "bun:test";
import { games } from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import {
  createGameInConversation,
  rematchGame,
} from "../src/chat/games-in-chat-service";
import { handleJoinRoom, handleMakeMove } from "../src/realtime/turn-based";
import { createHarness, DB_UP, type TestUser } from "./harness";

const h = createHarness("rm");
afterAll(h.cleanup);

describe.skipIf(!DB_UP)("rematch end-to-end", () => {
  it("links a rematch into the same series with loser-first seating", async () => {
    const a = await h.makeUser("a");
    const b = await h.makeUser("b");
    const convId = await h.makeDm(a, b);

    const first = await createGameInConversation({
      userId: a.id,
      conversationId: convId,
      gameType: TIC_TAC_TOE,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const code = first.value.game.id;
    h.trackGame(code);

    const io = { to: () => ({ emit: () => {} }) } as never;
    const sockA = { data: { userId: a.id }, join() {}, emit() {} } as never;
    const sockB = { data: { userId: b.id }, join() {}, emit() {} } as never;
    await handleJoinRoom(io, sockA, { gameId: code });
    await handleJoinRoom(io, sockB, { gameId: code });

    const move = (row: number, col: number) => ({ gameId: code, moveData: { row, col } });
    await handleMakeMove(io, sockA, move(0, 0));
    await handleMakeMove(io, sockB, move(1, 0));
    await handleMakeMove(io, sockA, move(0, 1));
    await handleMakeMove(io, sockB, move(1, 1));
    await handleMakeMove(io, sockA, move(0, 2));

    const finished = await games.getGameByCode(code);
    expect(finished?.status).toBe("completed");
    expect(finished?.winner).toBe(a.id);

    const rematch = await rematchGame({ userId: a.id, gameId: code });
    expect(rematch.ok).toBe(true);
    if (!rematch.ok) return;
    const newCode = rematch.value.game.id;
    h.trackGame(newCode);

    const newGame = await games.getGameByCode(newCode);
    expect(newGame?.seriesId).toBe(finished?.seriesId);
    const xPlayer = newGame?.players.find((p) => p.role === "X");
    expect(xPlayer?.userId).toBe(b.id);

    const dup = await rematchGame({ userId: b.id, gameId: code });
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.value.game.id).toBe(newCode);
  });
});
```

> Confirm the move payload shape against `game-driver.test.ts` (it uses `{ row, col }` move data and `{ gameId }`); adjust the winning line if tic-tac-toe's winner detection differs. The point is: play `a` to a win, rematch, assert same `seriesId` + `b` is now `X` + de-dupe.

- [ ] **Step 2: Run (requires DB)**

```bash
bun run db:start
cd apps/server && bun run test:integration
```

Expected: the rematch test passes (or is skipped if `DB_UP` is false — then run it after `db:start`).

- [ ] **Step 3: Commit**

```bash
git add apps/server/integration/rematch.test.ts
git commit -m "test(server): rematch series integration test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — Web UI

### Task 12: `SeriesScoreboard` component

**Files:**
- Create: `apps/web/components/games/series-scoreboard.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/components/games/series-scoreboard.tsx`:

```tsx
"use client";

import type { SeriesScore } from "@gamelobby/shared/types";
import { Character } from "@/components/ui/character";

export function SeriesScoreboard({ score }: { score: SeriesScore }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-start justify-center gap-6">
        {score.entries.map((entry) => (
          <div key={entry.userId} className="flex flex-col items-center gap-1">
            <Character
              config={entry.avatar ?? null}
              fallbackSeed={entry.username}
              size={48}
              className="rounded-full border-2 border-card bg-surface-overlay"
            />
            <span className="max-w-24 truncate text-muted-foreground text-sm">
              {entry.username}
            </span>
            <span className="font-bold text-2xl">{entry.wins}</span>
          </div>
        ))}
      </div>
      {score.draws > 0 ? (
        <span className="text-muted-foreground text-xs">
          draws: {score.draws}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint, then commit**

```bash
bun run type-check
bun run check
git add apps/web/components/games/series-scoreboard.tsx
git commit -m "feat(web): SeriesScoreboard component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `SeriesDetailModal` content

**Files:**
- Create: `apps/web/components/games/series-detail-modal.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/components/games/series-detail-modal.tsx`:

```tsx
"use client";

import type { SeriesDetail } from "@gamelobby/shared/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FaArrowRight } from "react-icons/fa6";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { clientFetchJson } from "@/lib/api-client";

function rowLabel(status: string, winnerUsername: string | null, winner: string | null): string {
  if (status !== "completed") return "in progress";
  if (winner === "draw") return "draw";
  return winnerUsername ? `${winnerUsername} won` : "finished";
}

export function SeriesDetailModal({ gameId }: { gameId: string }) {
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    clientFetchJson<SeriesDetail>(`/api/games/${gameId}/series`)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [gameId]);

  if (error) return <p className="text-muted-foreground text-sm">Could not load the series.</p>;
  if (!detail) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <SeriesScoreboard score={detail.score} />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-muted-foreground text-xs uppercase">
          Games
        </span>
        {detail.games.map((g) => (
          <Link
            key={g.gameId}
            href={`/play/${g.gameId}`}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-surface-overlay"
          >
            <span className="text-sm">
              {g.gameNumber}. {rowLabel(g.status, g.winnerUsername, g.winner)}
            </span>
            <FaArrowRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint, then commit**

```bash
bun run type-check
bun run check
git add apps/web/components/games/series-detail-modal.tsx
git commit -m "feat(web): SeriesDetailModal content

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Game-over overlay + mount in PlayClient

**Files:**
- Create: `apps/web/app/play/[gameId]/game-over-overlay.tsx`
- Modify: `apps/web/app/play/[gameId]/play-client.tsx`

- [ ] **Step 1: Implement the overlay**

Create `apps/web/app/play/[gameId]/game-over-overlay.tsx`:

```tsx
"use client";

import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type { GameJson, SeriesDetail } from "@gamelobby/shared/types";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { Button } from "@/components/ui/button";
import { clientFetchJson } from "@/lib/api-client";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import { emitAck, useSocket, useSocketEvent } from "@/lib/socket/socket-context";

function isOver(status: string): boolean {
  return status === "completed" || status === "abandoned";
}

function outcome(game: GameJson, userId: string): string {
  if (game.status === "abandoned") return "Game abandoned";
  if (game.winner === "draw") return "It's a draw";
  if (!game.winner) return "Game over";
  return game.winner === userId ? "You won! 🎉" : "You lost";
}

export function GameOverOverlay({
  gameId,
  userId,
  initialGame,
}: {
  gameId: string;
  userId: string;
  initialGame: GameJson;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const { openLayer } = useLayeredPopup();
  const [game, setGame] = useState<GameJson>(initialGame);
  const [open, setOpen] = useState(isOver(initialGame.status));
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [rematchCode, setRematchCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useSocketEvent<{ game: GameJson }>("game_state", (payload) => {
    setGame(payload.game);
    if (isOver(payload.game.status)) setOpen(true);
  });
  useSocketEvent<{ newGameId: string }>(CHAT_EVENTS.rematchCreated, (payload) => {
    setRematchCode(payload.newGameId);
  });

  useEffect(() => {
    if (!open || !isOver(game.status)) return;
    let active = true;
    clientFetchJson<SeriesDetail>(`/api/games/${gameId}/series`)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, gameId, game.status]);

  const isPlayer = game.players.some((p) => p.userId === userId);
  const canRematch =
    isPlayer && game.status === "completed" && !!game.conversationId;
  const showSeries = (detail?.score.totalGames ?? 0) >= 2;

  const onRematch = useCallback(async () => {
    if (rematchCode) {
      router.push(`/play/${rematchCode}`);
      return;
    }
    setBusy(true);
    try {
      const res = await emitAck<{ gameId: string }>(socket, CHAT_EVENTS.rematch, {
        gameId,
      });
      router.push(`/play/${res.gameId}`);
    } catch {
      setBusy(false);
    }
  }, [socket, gameId, rematchCode, router]);

  if (!open || !isOver(game.status)) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setOpen(false)}
      >
        <motion.div
          className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-4 text-center font-bold text-xl">
            {outcome(game, userId)}
          </h2>
          {showSeries && detail ? (
            <div className="mb-4">
              <SeriesScoreboard score={detail.score} />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {canRematch ? (
              <Button onClick={onRematch} disabled={busy}>
                {rematchCode ? "Go to rematch" : "Rematch"}
              </Button>
            ) : null}
            {showSeries ? (
              <Button
                variant="secondary"
                onClick={() =>
                  openLayer({
                    title: "Series",
                    content: <SeriesDetailModal gameId={gameId} />,
                    size: "md",
                  })
                }
              >
                View series
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

> Verify the `Button` variant names (`secondary`, `ghost`) against `apps/web/components/ui/button.tsx`; the probe lists `primary | secondary | ghost | danger`.

- [ ] **Step 2: Mount it in PlayClient**

In `apps/web/app/play/[gameId]/play-client.tsx`, import and render the overlay as a sibling of the game node (so it overlays everything). Add near the existing `<GameClient … />` usage:

```tsx
import { GameOverOverlay } from "./game-over-overlay";
```

Render it inside the component's returned tree (it positions itself `fixed`, so placement in the tree is not critical):

```tsx
      <GameOverOverlay gameId={gameId} userId={userId} initialGame={initialGame} />
```

> `initialGame` in `PlayClient` is typed `GameClientProps["initialGame"]`, which is `GameJson`. If TS complains, cast or align the type via `import type { GameJson } from "@gamelobby/shared/types"`.

- [ ] **Step 3: Type-check + lint**

```bash
bun run type-check
bun run check
```

- [ ] **Step 4: Manual verification**

```bash
bun run db:start
bun run dev
```

Play a tic-tac-toe game to completion in a DM (two browser sessions). Verify: the overlay opens on the final move; **Rematch** creates a new game and navigates you there; the opponent's overlay shows **Go to rematch**; reloading a finished game re-opens the overlay (revisit). For game 1 there is no scoreboard / View series; from game 2 the scoreboard + View series appear.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/play/[gameId]/game-over-overlay.tsx apps/web/app/play/[gameId]/play-client.tsx
git commit -m "feat(web): game-over overlay with rematch + series

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Game card — scoreboard, View series, Rematch

**Files:**
- Modify: `apps/web/app/chat/[handle]/game-card-message.tsx`

- [ ] **Step 1: Add series UI to the card**

In `apps/web/app/chat/[handle]/game-card-message.tsx`:

Add imports:

```tsx
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
```

Inside `GameCardMessage`, derive series visibility and wire actions:

```tsx
  const { socket } = useSocket();
  const { openLayer } = useLayeredPopup();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const seriesScore = meta.seriesScore;
  const showSeries = (seriesScore?.totalGames ?? 0) >= 2;
  const canRematch = status === "completed" && isPlayer;

  const onRematch = async () => {
    setBusy(true);
    try {
      const res = await emitAck<{ gameId: string }>(socket, CHAT_EVENTS.rematch, {
        gameId,
      });
      router.push(`/play/${res.gameId}`);
    } catch {
      setBusy(false);
    }
  };
```

In the card's JSX, after the existing status text, render the scoreboard + buttons when `showSeries`:

```tsx
      {showSeries && seriesScore ? (
        <div className="mt-3 flex flex-col gap-3">
          <SeriesScoreboard score={seriesScore} />
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-overlay"
              onClick={() =>
                openLayer({
                  title: "Series",
                  content: <SeriesDetailModal gameId={gameId} />,
                  size: "md",
                })
              }
            >
              View series
            </button>
            {canRematch ? (
              <button
                type="button"
                disabled={busy}
                className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-primary-foreground text-sm disabled:opacity-50"
                onClick={onRematch}
              >
                Rematch
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
```

> Match the existing class tokens in this file (`bg-surface-raised`, `border-border`, etc.) and its existing button styles; the snippet uses the same design tokens but adjust to the file's conventions. Keep the existing waiting/active action button untouched.

- [ ] **Step 2: Type-check + lint**

```bash
bun run type-check
bun run check
```

- [ ] **Step 3: Manual verification**

With `bun run dev` running, complete a game and a rematch in a DM. Verify the chat card upgrades to show the scoreboard once the series has ≥2 games, **View series** opens the modal listing each game with working `/play/{code}` links, and **Rematch** routes you into the new game (or to the existing live one).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/chat/[handle]/game-card-message.tsx
git commit -m "feat(web): series scoreboard + View series + Rematch on game card

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: One-live "Resume" on the create entry

**Files:**
- Modify: the in-chat / lobby create-game caller (locate in Step 1)

- [ ] **Step 1: Locate the create caller**

Run:

```bash
grep -rn "createGameInConversation" apps/web
```

Find the client component that emits `CHAT_EVENTS.createGameInConversation` (e.g. the games menu in the conversation or `app/games/_shared/game-lobby.tsx`).

- [ ] **Step 2: Navigate to the returned game**

After the create ack resolves, the server now returns `{ game }` whether it created a new game or found a live one. Ensure the caller navigates to `/play/${res.game.id}` using the returned id rather than assuming a brand-new game. This makes "create while a live game exists" land the user in the existing game (the §7 behavior) without any error.

> This is the minimal, robust form of the §7 UX. A nicer label ("Resume game" when a live game exists) is optional polish and can be layered on later by reading the conversation's live-game state.

- [ ] **Step 3: Type-check + lint, manual verify, commit**

```bash
bun run type-check
bun run check
```

Manually confirm that attempting to create a second tic-tac-toe in a DM that already has a live one drops you into the existing game. Then:

```bash
git add apps/web
git commit -m "feat(web): create routes to existing live game (one-live rule)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Docs

### Task 17: Sync architecture docs

**Files:**
- Modify: `docs/architecture/realtime.md`, `docs/architecture/database.md`, `docs/architecture/database-schema.md`, `docs/architecture/web.md`

- [ ] **Step 1: realtime.md**

Add a "Rematch & series" subsection near the game-flow section: the `game:rematch` event, the loser-first `computeRematchSeating` seam, pre-seating both players into an `active` game, the one-live-per-(conversation, gameType) guard, the `game:rematch_created` broadcast to the old game room, and that the game card is enriched with `seriesScore`.

- [ ] **Step 2: database.md + database-schema.md**

Document the `game.seriesId` self-reference (id of the first game in the series; set at create time, copied by rematches), the `game_series_idx`, and the new `getSeriesGames` / `findLiveGameInConversation` repository reads.

- [ ] **Step 3: web.md**

Document the game-over overlay (mounted in `play-client.tsx`, auto-opens on completion + revisit), the series-detail modal (via `GET /api/games/:gameId/series`), and the `SeriesScoreboard` shared by the card + both modals.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture
git commit -m "docs: rematch + series + game-over architecture

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase F — Maintainers, review & PR

### Task 18: Run the docs-maintainer and test-maintainer agents

- [ ] **Step 1: docs-maintainer**

Run the `docs-maintainer` agent (`.claude/agents/docs-maintainer.md`) against the whole change set so every `docs/` page + the root README reflect the rematch/series/game-over behavior (not just the Phase E pages). Apply its fixes, then `bun run check`, and commit any doc edits.

- [ ] **Step 2: test-maintainer**

Run the `test-maintainer` agent (`.claude/agents/test-maintainer.md`) to audit the new + existing suites and add missing edge-case coverage for the rematch/series logic (de-dupe, draw seating, abandoned games, series score with abandoned games, one-live across game types). Apply its additions, run the affected suites green, and commit.

- [ ] **Step 3: Final adversarial review**

Dispatch a final code review across the whole branch diff (spec compliance + correctness + quality). Fix anything it surfaces before opening the PR.

### Task 19: Open the PR and drive CI to green

- [ ] **Step 1: Final local gate**

```bash
bun run type-check
bun run check
bun run test
bun run db:start && cd apps/server && bun run test:integration && cd ../..
```

All must pass.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/rematch-and-game-over
gh pr create --base main --head feat/rematch-and-game-over --title "feat: rematch + game-over experience" --body "<summary + spec/plan links + test notes>"
```

- [ ] **Step 3: Drive checks green + resolve review comments**

Monitor `gh pr checks` until all are green; fix any failures and push. Resolve every review comment (including CodeRabbit) — address the feedback in code or reply with rationale, push, and re-check — so that when the user returns there are **no unresolved review threads and all checks pass**.

## Final verification

- [ ] `bun run type-check` (all workspaces) passes.
- [ ] `bun run check` passes (no comments introduced; Tailwind classes sorted).
- [ ] `bun test` passes across workspaces; `apps/server` integration tests pass with `db:start`.
- [ ] Manual: full DM flow — play → game-over overlay → rematch (loser first) → scoreboard from game 2 → View series modal with working links → one-live rule routes to existing game.
- [ ] docs-maintainer + test-maintainer agents run; PR opened; all CI checks green; no unresolved review comments.
