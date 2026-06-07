# games-client: React Game UI & Lazy Registry

## What this is / why it matters

`@gamelobby/games-client` is the **web-only React layer** that draws a game's board and wires it to the realtime backend. It is the visible half of a deliberate split that runs through the whole monorepo:

- **`packages/games-core`** holds the *logic* — the `GameEngine`, the strict Zod schemas, the rules. It has **no React** and no DOM dependency, so the **server can import it** to authoritatively validate every move.
- **`packages/games-client`** holds the *UI* — one `"use client"` React component per game. It depends on React and `socket.io-client` (as *peer* deps), so it can never be pulled into the server bundle.

This separation is the point. The same `TicTacToeState` type and `ticTacToeMoveSchema` that the board in `packages/games-client/src/games/tic-tac-toe/client.tsx` uses to render cells are the exact ones the server runs through `engine.reduce` in `apps/server/src/realtime/turn-based.ts:148`. The client **informs** the UI but **never decides** anything: it emits a `make_move` over the socket, the server re-validates against the shared schema + engine, and the board only updates when the server broadcasts the new state back. The client is never trusted — it is a thin, optimistic-free view that mirrors server-authoritative state.

A second key idea is **lazy resolution by `type` string**. The web app has a single dynamic play route; it never imports a specific game component directly. Instead it asks `getGameClient(gameType)` for a `React.lazy` component, which code-splits each game's board into its own chunk. Adding a game means adding one registry entry, not touching the route.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/games-client/src/index.ts` | Public package surface: re-exports `getGameClient`, `getGameSkeleton`, `DefaultGameSkeleton`, `SkeletonBox`, and the `GameClientProps` type. |
| `packages/games-client/src/types.ts` | `GameClientProps` — the contract every board component receives (`gameId`, `userId`, the shared `socket` + `connected`, `initialGame`, `initialMoves`). |
| `packages/games-client/src/registry.ts` | Two registries keyed by the typed `GameType` from `@gamelobby/shared`: `REGISTRY` (`React.lazy` board components) and `SKELETON_REGISTRY` (eager skeleton components). `getGameClient(type)` returns the board (`null` for unknown types); `getGameSkeleton(type)` returns the skeleton, falling back to `DefaultGameSkeleton`. |
| `packages/games-client/src/skeletons.tsx` | `SkeletonBox` (a pulse-animated placeholder primitive) and `DefaultGameSkeleton` (the generic board placeholder). No `"use client"` — pure markup, so it renders in both server and client trees. |
| `packages/games-client/src/games/tic-tac-toe/client.tsx` | A concrete board: reuses the shared socket from props, emits `join_room`/`make_move`/`leave_room`, listens for `game_state`/`move_made`/`game_error`, derives `canMove`, and renders a replay scrubber for finished games. |
| `packages/games-client/src/games/tic-tac-toe/skeleton.tsx` | `TicTacToeSkeleton` — a prop-less placeholder that mirrors the board (status dot, 3×3 grid, footer line) so the loading state matches the eventual UI. |
| `packages/games-client/package.json` | Declares `react`, `react-dom`, `react-icons`, `socket.io-client` as **peer** deps (provided by the host web app), not bundled. |

Consumed on the web side by:

| Path | Role |
| --- | --- |
| `apps/web/app/play/[gameId]/page.tsx` | RSC route: fetches the game + moves over REST, passes them as `initial*` props. |
| `apps/web/app/play/[gameId]/play-client.tsx` | Calls `getGameClient(gameType)` and renders the board inside `<Suspense>`, with `getGameSkeleton(gameType)` as the fallback. |
| `apps/web/app/play/[gameId]/loading.tsx` + `play-skeleton.tsx` | Route-level loading UI streamed while `page.tsx` fetches the game record. Reads the `gl_chat_layout` cookie and renders the matching chat shell — docked panel (`mounted`, sized to `chatWidth`), floating window (`popout`, positioned/sized from the saved `x/y/w/h`), or floating icon (minimized, positioned from the saved `x/y`). The board area is a **generic** placeholder: the game `type` isn't known yet at this stage (it *is* the data being fetched), so it can't pick a per-game skeleton. |

Authoritative counterpart on the server:

| Path | Role |
| --- | --- |
| `apps/server/src/realtime/index.ts` | Receives `join_room` (`:65`), `make_move` (`:98`), and `leave_room` (`:131`) socket events on the shared connection, validates the *payload envelope*, routes to a driver (`leave_room` calls `leaveGameRoom`). |
| `apps/server/src/realtime/turn-based.ts` | Re-validates the move + stored state against the game's Zod schemas, runs `engine.reduce`, persists, broadcasts. |

## The package surface

The package's public surface is small:

```ts
export { getGameClient, getGameSkeleton } from "./registry";
export { DefaultGameSkeleton, SkeletonBox } from "./skeletons";
export type { GameClientProps } from "./types";
```

(`packages/games-client/src/index.ts:1`)

That is the entire public API. Everything else — the per-game boards, the replay toolbar, the socket plumbing — is an implementation detail reached only through these helpers.

### Per-game loading skeletons

The board chunk is `React.lazy`, so something must render while it loads. `getGameSkeleton(type)` resolves the matching skeleton from a small `SKELETON_REGISTRY`, falling back to `DefaultGameSkeleton` when a game ships none:

```ts
export function getGameSkeleton(gameType: string): ComponentType {
  const registry: Record<string, ComponentType> = SKELETON_REGISTRY;
  return registry[gameType] ?? DefaultGameSkeleton;
}
```

(`packages/games-client/src/registry.ts:27`)

`SKELETON_REGISTRY` is typed `Record<GameType, ComponentType>` (every registered game must ship a skeleton); `getGameSkeleton` accepts a plain `string` and widens through a local `Record<string, ComponentType>` alias so an unknown type falls through to the default rather than failing to type-check.

Two deliberate choices:

- **Skeletons are registered eagerly, not lazily.** A skeleton must be available *before* the board chunk it stands in for has loaded — so it lives in its own tiny module (`games/<type>/skeleton.tsx`) and is statically imported into the registry, never `React.lazy`'d. Keeping it separate from `client.tsx` is also what stops the heavy board (and its `socket.io-client` import) from being pulled into the main bundle.
- **Skeletons are prop-less and `"use client"`-free.** They are pure presentational markup built from `SkeletonBox`, so they render as a `<Suspense>` fallback in the client tree without needing game data or a client boundary. A good skeleton mirrors the board's layout (tic-tac-toe draws a 3×3 grid) so the swap to the live board doesn't shift the page.

`play-client.tsx` uses it as the board's fallback:

```tsx
const GameClient = getGameClient(gameType);
const GameSkeleton = getGameSkeleton(gameType);

<Suspense fallback={<GameSkeleton />}>
  <GameClient … />
</Suspense>
```

This is distinct from the **route-level** `loading.tsx`, which streams while `page.tsx` fetches the game record. It reads the `gl_chat_layout` cookie so the chat half of the shell (docked / popout / minimized, at the saved geometry) matches what the user will see, but its board area is a generic placeholder — the game `type` is unknown at that point (it *is* the data being fetched), so it can't pick a per-game skeleton. The per-game skeleton takes over once the type is resolved and the board starts loading.

### Why React/socket.io are *peer* dependencies

```json
"peerDependencies": {
  "react": "^19",
  "react-dom": "^19",
  "react-icons": "^5.6.0",
  "socket.io-client": "^4.8.3"
},
```

(`packages/games-client/package.json:16`)

React and `socket.io-client` are peers, not regular dependencies, so the host (the Next.js app in `apps/web`) supplies the single shared copy. This avoids two React instances (which would break hooks) and keeps the package itself React-version-agnostic. The mirror-image fact is that `packages/games-core` has *no* React at all — that is what lets `apps/server` import the engine without dragging the browser runtime into a Bun process. The logic↔UI split is enforced at the dependency-graph level, not just by convention.

## The board contract: `GameClientProps`

Every board component is a `ComponentType<GameClientProps>`. The shape is intentionally small:

```ts
import type { Socket } from "socket.io-client";

export type GameClientProps = {
  gameId: string;
  userId: string | null;
  socket: Socket | null;
  connected: boolean;
  initialGame: {
    id: string;
    status: string;
    winner: string | null;
    players: { userId: string; username: string; role: string }[];
    gameState?: unknown;
  };
  initialMoves: Record<string, unknown>[];
};
```

(`packages/games-client/src/types.ts`)

Notes that matter:

- **`socket: Socket | null` + `connected: boolean`** — the *single shared* Socket.IO connection, supplied by the host app from `useSocket()` (the `SocketProvider` in `apps/web`). Boards **must not open their own `io()` connection** — both the chat lane and the game lane ride this one socket (see [Realtime](./realtime.md)). `socket` is `null` until the provider connects; `connected` mirrors the live connection status for the board's status dot.
- **`userId: string | null`** — boards must handle the signed-out viewer. Tic-tac-toe shows a "Sign in to join this table" banner instead of a connection dot.
- **`initialGame.gameState?: unknown`** — the per-game state is deliberately untyped here. games-client is generic over all games; the *concrete* board narrows `unknown` to its own type (tic-tac-toe casts to its local `GameJson`/`TicState`). The authoritative shape lives in games-core's Zod `stateSchema`, not in this prop.
- **`initialMoves: Record<string, unknown>[]`** — the full move log, used to drive replay of finished games. Again untyped at the boundary; the board interprets each move's `moveData` itself.

These `initial*` props are SSR data: the RSC route fetches them once so the board renders fully on first paint, then the board takes over live updates via the shared socket. See the walkthrough below.

## Lazy resolution by type

The registry is an object keyed by the **typed `GameType`** from `@gamelobby/shared` (not a bare string literal), with each value built by `React.lazy`. The key is the exported `TIC_TAC_TOE` constant, so a typo is a compile error rather than a silently missing board:

```ts
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import type { GameType } from "@gamelobby/shared/types";
import { type ComponentType, lazy } from "react";
import { TicTacToeSkeleton } from "./games/tic-tac-toe/skeleton";
import { DefaultGameSkeleton } from "./skeletons";
import type { GameClientProps } from "./types";

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

export function getGameClient(
  gameType: string,
): ComponentType<GameClientProps> | null {
  const registry: Record<string, ComponentType<GameClientProps>> = REGISTRY;
  return registry[gameType] ?? null;
}
```

(`packages/games-client/src/registry.ts:1`)

Why this design:

- **Typed keys.** `REGISTRY` and `SKELETON_REGISTRY` are `Record<GameType, …>`, so the compiler requires an entry for every game type the registry (`GAME_TYPES` in `@gamelobby/shared/constants`) knows about. The public getters still accept a plain `string` and widen through a local `Record<string, …>` alias, so an unknown type returns `null`/the default instead of failing to type-check.
- **Code splitting.** Each board is a dynamic `import()`, so a game's UI (and its sometimes-heavy assets) only downloads when someone actually opens that game. The lobby and unrelated games stay light.
- **The board export isn't a default.** `client.tsx` exports a *named* `TicTacToeGameClient`, so the `.then((m) => ({ default: m.TicTacToeGameClient }))` adapts it into the `{ default }` shape `React.lazy` requires.
- **Unknown types return `null`, not a throw.** A game-type the web build doesn't know how to render degrades gracefully — the caller shows a "not supported here" message rather than crashing (`apps/web/app/play/[gameId]/play-client.tsx:57`).
- **One source of truth on the web side.** The route never references a specific game component; it only knows the string. Adding a game = one line in `REGISTRY` (and, optionally, one in `SKELETON_REGISTRY`) plus the matching `GameDefinition` in games-core. No new route, no new endpoint.

Because the registry hands back `React.lazy` components, callers must render them inside a `<Suspense>` boundary. That's exactly what the web app does:

```tsx
const GameClient = getGameClient(gameType);
const GameSkeleton = getGameSkeleton(gameType);

const gameNode = GameClient ? (
  <div
    className={`mx-auto flex h-full w-full flex-col p-4 ${layoutWidth ?? "max-w-2xl"}`}
  >
    <Suspense fallback={<GameSkeleton />}>
      <GameClient
        gameId={gameId}
        userId={userId}
        socket={socket}
        connected={status === "connected"}
        initialGame={initialGame}
        initialMoves={initialMoves}
      />
    </Suspense>
  </div>
) : (
  <div className="p-6 text-center text-muted-foreground text-sm">
    This game type isn't supported here.
  </div>
);
```

(`apps/web/app/play/[gameId]/play-client.tsx:39`)

The route (`apps/web/app/play/[gameId]/page.tsx`) is a single dynamic segment for **every** game; the `gameType` it forwards comes from the fetched game record, and the registry does the dispatch.

## How a board talks to realtime

A board reaches the backend over the **shared `socket.io-client` connection** handed in via `props.socket` — it does not open its own connection, and it does not go through the web app's REST helpers for live play. The host (`apps/web/app/play/[gameId]/play-client.tsx`) pulls the connection from `useSocket()` and passes it down; the same socket also carries the chat lane. Tic-tac-toe is the reference implementation.

### Joining the room

The board only joins the live game when there's a logged-in user *and* the game is still live (`waiting` or `active`). It computes a `liveSocketKey`; if that's `null` (signed out, or the game is finished), it never joins:

```tsx
const liveSocketKey = useMemo((): {
  gameId: string;
  userId: string;
} | null => {
  if (!userId || !isLive) return null;
  return { gameId, userId };
}, [gameId, userId, isLive]);
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

Given the shared socket and a non-null key, the board registers its listeners and emits `join_room` — immediately if the socket is already connected, and again on every `connect` so a reconnect re-joins:

```tsx
useEffect(() => {
  if (!socket || !liveSocketKey) return;
  const { gameId: gid } = liveSocketKey;

  const onConnect = () => {
    setError(null);
    socket.emit("join_room", { gameId: gid });
  };
  socket.on("connect", onConnect);
  socket.on("game_state", onGameState);
  socket.on("move_made", onMoveMade);
  socket.on("game_error", onGameError);

  if (socket.connected) socket.emit("join_room", { gameId: gid });

  return () => {
    socket.off("connect", onConnect);
    socket.off("game_state", onGameState);
    socket.off("move_made", onMoveMade);
    socket.off("game_error", onGameError);
    if (socket.connected) socket.emit("leave_room", { gameId: gid });
  };
}, [socket, liveSocketKey]);
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

The board never sends its own `userId` in the payload — the server derives identity from `socket.data.userId` (set by the auth middleware, from the Better Auth cookie that rode in on the shared connection's handshake), so the client cannot impersonate anyone.

### The three inbound events

The handlers registered above:

```tsx
const onGameState = (payload: { game: GameJson; moves: MoveJson[] }) => {
  setGame(payload.game);
  setMoves(payload.moves);
};
const onMoveMade = (payload: { gameState: TicState }) => {
  setGame((g) => ({ ...g, gameState: payload.gameState }));
};
const onGameError = (payload: { message?: string }) => {
  setError(payload.message ?? "Error");
};
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

- **`game_state`** is the full snapshot (game record + entire move log). The server sends this on join and after every move, so it's the authoritative "everything is now this" message. It replaces local state wholesale.
- **`move_made`** is a lightweight patch — the server sends `{ move, gameState }`, but the board only reads `payload.gameState` for a snappy board update. The server emits both `move_made` and a follow-up full `game_state` after each move (`apps/server/src/realtime/turn-based.ts:166` and `:170`), so even if a client missed something the snapshot reconciles it.
- **`game_error`** surfaces any rejection (bad payload, not your turn, occupied cell) as a string the board displays.

The cleanup **does not disconnect the shared socket** — that would tear down the chat lane too. Instead it removes the board's own listeners with `socket.off(...)` and emits `leave_room` so the persistent socket leaves the `game:<id>` room. The effect is keyed on `socket` + `liveSocketKey`, so signing out or a game reaching a terminal status (key becomes `null`) cleanly stops the board from participating without touching the connection.

### Deriving `canMove` and emitting a move

The board computes whether the local user may act *purely as a UI hint* — the real gate is the server:

```tsx
const myRole = game.players.find((p) => p.userId === userId)?.role ?? null;
const canMove =
  Boolean(userId) &&
  game.status === "active" &&
  myRole !== null &&
  liveState.currentTurn === myRole;
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

`myRole` comes from matching `userId` against the seated `players` (each carries a `role` like `"X"`/`"O"`). You can only move when it's the active game, you hold a role, and `currentTurn` equals your role. When you click a free cell:

```tsx
const makeMove = useCallback(
  (row: number, col: number) => {
    if (!userId || !canMove) return;
    if (!socket?.connected) return;
    socket.emit("make_move", {
      gameId,
      moveData: { row, col },
    });
  },
  [userId, canMove, gameId, socket],
);
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

Crucially, `makeMove` does **not** mutate the board. There is no optimistic update. It fires `make_move` and waits; the board only changes when the server echoes `move_made`/`game_state`. This is what keeps client and server in lockstep and makes cheating pointless — `canMove` being `true` locally means nothing if the server's `engine.reduce` disagrees.

## Data-flow walkthrough: from page load to a confirmed move

**Phase 1 — server-rendered first paint (REST):**

1. User opens `/play/<gameId>` → `apps/web/app/play/[gameId]/page.tsx:20` runs as an RSC.
2. It resolves the session via `getServerSession()` (redirects to `/auth` if signed out), then `serverFetchJson` → `GET /api/games/:gameId` returns `{ game, moves }` (`apps/web/app/play/[gameId]/page.tsx:31`).
3. It renders `<PlayClient ... initialGame initialMoves gameType={data.game.gameType} />` (`apps/web/app/play/[gameId]/page.tsx:67`); `gameType` is the typed `GameType` carried on the fetched `GameJson` (`page.tsx:70`).
4. `play-client.tsx:39` calls `getGameClient(gameType)` (and `getGameSkeleton(gameType)`) → registry returns the `React.lazy` tic-tac-toe component.
5. `<Suspense>` resolves the lazy chunk and mounts `TicTacToeGameClient` with the SSR `initial*` props plus the shared `socket`/`connected` from `useSocket()` (`apps/web/app/play/[gameId]/play-client.tsx`). The board paints immediately from `initialGame`/`initialMoves` — no join needed yet.

**Phase 2 — going live (shared socket):**

6. The board's effect sees a non-null `liveSocketKey` and a live `socket`, registers its listeners, and emits `join_room { gameId }` on the **shared** connection (`packages/games-client/src/games/tic-tac-toe/client.tsx`).
7. Server `socket.on("join_room")` validates the envelope with `clientJoinRoomSchema`, looks up the game, picks a driver, calls `driver.joinRoom` (`apps/server/src/realtime/index.ts:65`).
8. `turn-based.ts` `handleJoinRoom` (`apps/server/src/realtime/turn-based.ts:103`) seats the user if there's a free seat, joins the socket room, and emits a full `game_state` snapshot back via `emitFullState` (`:121`).
9. The board's `game_state` listener overwrites local `game`/`moves` (`packages/games-client/src/games/tic-tac-toe/client.tsx`).

**Phase 3 — making a move (the trust boundary):**

10. User clicks a cell → `makeMove(row, col)` emits `make_move { gameId, moveData: { row, col } }` (`packages/games-client/src/games/tic-tac-toe/client.tsx`). No local board change.
11. Server `socket.on("make_move")` validates the envelope with `clientMakeMoveSchema`, routes to the driver (`apps/server/src/realtime/index.ts:98`).
12. `handleMakeMove` re-checks identity (`gameRow.players.find(... === userId)`), then **re-validates the move and the stored state against the game's own Zod schemas** and runs the shared engine:

```ts
const parsedMove = def.moveSchema.safeParse(payload.moveData);
if (!parsedMove.success) return err(socket, "Invalid move");
const parsedState = def.stateSchema.safeParse(gameRow.gameState);
if (!parsedState.success) return err(socket, "Corrupt game state");

const result = def.engine.reduce(
  parsedState.data,
  { role: player.role },
  parsedMove.data,
);
if (!result.ok) return err(socket, result.error);
```

(`apps/server/src/realtime/turn-based.ts:143`)

`def.moveSchema`/`def.stateSchema`/`def.engine.reduce` here are **the same `ticTacToeMoveSchema`, `ticTacToeStateSchema`, and `ticTacToeEngine.reduce`** the board imported types from — see `packages/shared/src/types/games/tic-tac-toe/schemas.ts` and the rule logic in `packages/games-core/src/games/tic-tac-toe/engine.ts:70` (turn check, occupied-cell check, win/draw outcome). One definition, used to *inform* the client and to *enforce* on the server.

13. On success the server persists the move + new state, finalizes win/draw stats, then broadcasts `move_made` (a patch — `{ move, gameState }`, `apps/server/src/realtime/turn-based.ts:166`) and a fresh `game_state` (snapshot, via `emitFullState`, `:170`) to the room.
14. The board's listeners apply the update; the new mark appears. On rejection (step 12 returning an error), the board receives `game_error` and shows the message — the board never advanced on its own, so there's nothing to roll back.

Net: **user click → `make_move` over socket → server Zod-validates + `engine.reduce` → DB → broadcast `game_state` → board re-renders.** The arrow from click to pixels always passes through the server.

## Replay mode for finished games

When a game's status is `completed` or `abandoned`, the board flips from "live, socket-driven" to "offline replay scrubber". The same component handles both; it just selects a different state source.

The mode flags and initial scrub position:

```tsx
const isLive = game.status === "waiting" || game.status === "active";

const isPast = game.status === "completed" || game.status === "abandoned";
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

`replayStep` starts at the end if the game was already finished on load (`pastInitially ? initialMoves.length : 0`, `packages/games-client/src/games/tic-tac-toe/client.tsx`). Because `liveSocketKey` is `null` once `isLive` is false, **no socket is opened for finished games** — replay is entirely client-side from the move log.

The board reconstructs the position at any step by folding moves over an empty board — note it deliberately re-derives state rather than trusting any stored snapshot, sorting by `moveNumber` and applying each player's `role`:

```tsx
function buildStateAtStep(
  moves: MoveJson[],
  step: number,
  players: GameJson["players"],
): TicState {
  const board = emptyBoard();
  let currentTurn: "X" | "O" = "X";
  const sorted = sortMoves(moves);
  const n = Math.max(0, Math.min(step, sorted.length));
  for (let i = 0; i < n; i++) {
    const m = sorted[i];
    if (!m) continue;
    const pid = String(m.playerId ?? "");
    const role = roleForPlayer(players, pid);
    const md = m.moveData as { row?: unknown; col?: unknown };
    if (!role || typeof md.row !== "number" || typeof md.col !== "number") {
      continue;
    }
    const idx = md.row * 3 + md.col;
    if (idx < 0 || idx > 8) continue;
    board[idx] = role;
    currentTurn = role === "X" ? "O" : "X";
  }
  return { board, currentTurn };
}
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

The single line that swaps between modes is:

```tsx
const state = isPast ? replayState : liveState;
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

The rest of replay is UI sugar: a `<ReplayToolbar>` with first/prev/play/next/last buttons whose glyphs come from `react-icons/fa6` (`FaBackwardStep`/`FaChevronLeft`/`FaPlay`/`FaPause`/`FaChevronRight`/`FaForwardStep`) rather than hand-written `<svg>`, per the repo icon convention (`packages/games-client/src/games/tic-tac-toe/client.tsx:5`), an autoplay interval of `REPLAY_MS` (850ms) that advances `replayStep` and stops at the end (`packages/games-client/src/games/tic-tac-toe/client.tsx`), and keyboard shortcuts (←/→/Space) that are ignored while focus is in an input/textarea/contenteditable (`packages/games-client/src/games/tic-tac-toe/client.tsx`). There's also a transition effect: when a game flips from live to finished *during* the session, it jumps the scrubber to the last move and stops autoplay (`packages/games-client/src/games/tic-tac-toe/client.tsx`).

## Gotchas, invariants & conventions

- **No comments anywhere.** This repo enforces a strict no-comments rule on all code files; the only comment in `turn-based.ts` is a `biome-ignore` directive (a permitted tooling directive). Do not add explanatory `//` comments to any board you write.
- **Never trust the client.** A board may compute `canMove`, gray out occupied cells, etc., but those are UX only. The server re-validates with the game's Zod `moveSchema`/`stateSchema` and `engine.reduce` (`apps/server/src/realtime/turn-based.ts:143`). If your board's gating ever disagrees with the engine, the engine wins and the user sees a `game_error`.
- **No optimistic updates in tic-tac-toe.** `makeMove` emits and waits; the board mutates only on `move_made`/`game_state`. This is the recommended pattern — it keeps the displayed board provably equal to server state.
- **Reuse the shared socket — never call `io()`.** The board receives the one shared connection via `props.socket` and rides it for the game lane alongside chat. Opening your own `io()` would create a second redundant connection (double handshake/auth, doubled presence). On cleanup, remove your listeners with `socket.off(...)` and emit `leave_room`; **never** call `socket.disconnect()` — the connection is owned by the host's `SocketProvider`.
- **Identity is never in the payload.** Boards send `{ gameId, moveData }` only. The server reads the user from the authenticated socket (`socket.data.userId`), set from the Better Auth session cookie that rode on the shared connection's handshake (`withCredentials: true`). Sending a `userId` from the client would be ignored.
- **`gameState` and `moveData` cross the boundary as `unknown`.** `GameClientProps.initialGame.gameState` is `unknown` and `initialMoves` is `Record<string, unknown>[]` because games-client is generic. Each board narrows these itself (tic-tac-toe casts to a local `GameJson`/`TicState`). The real schema lives in games-core; keep that the single source of truth and import its types rather than re-declaring shapes.
- **Boards must be `"use client"` and Suspense-safe.** They are `React.lazy`-loaded, so a caller must wrap them in `<Suspense>` (the web route does at `apps/web/app/play/[gameId]/play-client.tsx:45`). The first line of `client.tsx` is `"use client"`.
- **Register by the typed `GameType` key.** Both `REGISTRY` and `SKELETON_REGISTRY` are `Record<GameType, …>` keyed by the constant exported from `@gamelobby/shared/constants` (`TIC_TAC_TOE`), so a typo or a missing entry is a *compile error* — the registries can't fall out of sync with `GAME_TYPES` silently. The runtime getters still accept a plain `string` (the value comes off a fetched record), and an unrecognized one yields `null` (board) / `DefaultGameSkeleton` (skeleton).
- **Tailwind must see the source.** Classes used in board components only survive the build because `apps/web/app/globals.css:3` has `@source "../../../packages/games-client/src/**/*.{ts,tsx}"` and `apps/web/next.config.ts:5` lists `@gamelobby/games-client` in `transpilePackages`. A new board file outside that glob would lose its Tailwind classes.
- **React/socket.io are peers.** Don't add `react` or `socket.io-client` as regular dependencies of this package — they must come from the host app to avoid duplicate-instance bugs.
- **Room participation is keyed on `liveSocketKey`.** Signing out, or a game reaching a terminal status, sets the key to `null`; the effect then emits `leave_room` and detaches its listeners (leaving the shared connection intact). Finished games never join a room; they replay from the move log.

## Where to go next

- [Architecture index](./README.md) — start here for the full doc map.
- [games-core schemas](./games-core-schemas.md) — the strict Zod `stateSchema`/`moveSchema`/`configSchema` whose types this package consumes (`Cell`, `TicTacToeState`) and which the server validates against.
- [games-core engine](./games-core-engine.md) — `GameEngine`/`reduce`/`Outcome`, the authoritative rules the board mirrors.
- [Realtime](./realtime.md) — the socket lanes, `join_room`/`make_move`, the turn-based driver, and the broadcast events this package listens for.
- [Server API](./server-api.md) — `GET /api/games/:gameId`, the REST source for the `initial*` props.
- [Web app](./web.md) — the `/play/[gameId]` route and how `getGameClient` is mounted under `<Suspense>`.
- [Auth](./auth.md) — how the session cookie carried by `withCredentials: true` becomes `socket.data.userId` on the server.
