# games-client: React Game UI & Registry

## What this is / why it matters

`@kyzen/games-client` is the **web-only React layer** that draws a game's board and wires it to the realtime backend. It is the visible half of a deliberate split that runs through the whole monorepo:

- **`packages/games-core`** holds the *logic* - the `GameEngine`, the strict Zod schemas, the rules. It has **no React** and no DOM dependency, so the **server can import it** to authoritatively validate every move.
- **`packages/games-client`** holds the *UI* - one `"use client"` React component per game. It depends on React and `socket.io-client` (as *peer* deps), so it can never be pulled into the server bundle.

This separation is the point. The same `TicTacToeState` type and `ticTacToeMoveSchema` that the board in `packages/games-client/src/games/tic-tac-toe/client.tsx` uses to render cells are the exact ones the server runs through `engine.reduce` in `apps/server/src/realtime/turn-based.ts:152`. The client **informs** the UI but **never decides** anything: it emits a `make_move` over the socket, the server re-validates against the shared schema + engine, and the board only updates when the server broadcasts the new state back. The client is never trusted - it is a thin, optimistic-free view that mirrors server-authoritative state.

A second key idea is **resolution by `type` string**. The web app has a single dynamic play route; it never imports a specific game component directly. Instead it asks `getGameClient(gameType)` for the board component. Adding a game means adding one registry entry, not touching the route. The registry value is a `ComponentType<GameClientProps>`, so it *can* hold a `React.lazy`-wrapped board to code-split a heavy game into its own chunk - but the currently registered tic-tac-toe board is **statically imported** into the registry so it is server-rendered in the initial HTML. That matters for revisiting finished games: an eagerly-imported board lands in the SSR'd markup with its final position already drawn, with no skeleton-to-board "snap" on load. With a single registered game (whose board only loads on the `/play` route, already its own bundle) the code-splitting loss is negligible.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/games-client/src/index.ts` | Public package surface: re-exports `getGameClient`, `getGameSkeleton`, `DefaultGameSkeleton`, `SkeletonBox`, the `GameClientProps` type, the playing-card primitives (`PlayingCard`, `CardBack`, `Joker` + their prop types), and the game-audio API (`getGameAudioEngine`, `useGameAudio`, `clampVolume`/`stepVolume`/`shouldPlayMusic`, `SfxKey`/`SfxSources` - see [audio.md](./audio.md)). |
| `packages/games-client/src/audio/` | The jotai-free `GameAudioEngine` (file-based Web Audio SFX + a streamed, crossfaded music track; no synthesis) and the `useGameAudio()` hook. Consumed by the boards (SFX) and by `apps/web`'s audio bridge (sources/volume/mute/active). |
| `packages/games-client/src/types.ts` | `GameClientProps` - the contract every board component receives (`gameId`, `userId`, the shared `socket` + `connected`, `initialGame`, `initialMoves`). |
| `packages/games-client/src/registry.ts` | Two registries keyed by the typed `GameType` from `@kyzen/shared`: `REGISTRY` (board components - `ComponentType<GameClientProps>`, currently the statically-imported `TicTacToeGameClient`) and `SKELETON_REGISTRY` (eager skeleton components). `getGameClient(type)` returns the board (`null` for unknown types); `getGameSkeleton(type)` returns the skeleton, falling back to `DefaultGameSkeleton`. |
| `packages/games-client/src/skeletons.tsx` | `SkeletonBox` (a pulse-animated placeholder primitive) and `DefaultGameSkeleton` (the generic board placeholder). No `"use client"` - pure markup, so it renders in both server and client trees. |
| `packages/games-client/src/games/tic-tac-toe/client.tsx` | A concrete board: reuses the shared socket from props, emits `join_room`/`make_move`/`leave_room`, listens for `game_state`/`game_error`, derives `canMove`, fires SFX via `useGameAudio()`, and renders a replay scrubber for finished games. Composes the sibling modules below (`PlayerBar`, `TttMark`/`TttMarkDefs`, `WinStrike`, `findWinningLine`). |
| `packages/games-client/src/games/tic-tac-toe/marks.tsx` | `TttMark` (the X/O SVG glyph, themed via `currentColor`) and `TttMarkDefs` (a hidden `<defs>` holding the shared `ttt-mark-sheen` gradient). Decorative art, so it stays inline SVG, not `react-icons`. |
| `packages/games-client/src/games/tic-tac-toe/player-bar.tsx` | `PlayerBar` - the two-seat header row: each seat shows a DiceBear `<Character>` avatar, the player's mark + name, and a turn indicator; non-self avatars become a button that calls `onViewProfile`. |
| `packages/games-client/src/games/tic-tac-toe/win-strike.tsx` | `WinStrike` - the animated winning-line stroke, drawn with `motion.line` (Framer Motion) so the line draws itself in on a win. |
| `packages/games-client/src/games/tic-tac-toe/winning-line.ts` | `WINNING_LINES` (the eight triples) and `findWinningLine(board)` - the pure helper the board uses to highlight a win. |
| `packages/games-client/src/ui/character.tsx` | `<Character>` - renders a DiceBear avataaars data-URI `<img>` from an `AvatarConfig` (falling back to a seeded config), used by `PlayerBar`. |
| `packages/games-client/src/games/tic-tac-toe/skeleton.tsx` | `TicTacToeSkeleton` - a prop-less placeholder that mirrors the board (status dot, 3×3 grid, footer line) so the loading state matches the eventual UI. |
| `packages/games-client/package.json` | Declares `motion`, `react`, `react-dom`, `react-icons`, `socket.io-client` as **peer** deps (provided by the host web app), not bundled. |

Consumed on the web side by:

| Path | Role |
| --- | --- |
| `apps/web/app/play/[gameId]/page.tsx` | RSC route: fetches the game + moves over REST, passes them as `initial*` props. |
| `apps/web/app/play/[gameId]/play-client.tsx` | Calls `getGameClient(gameType)` and renders the board inside `<Suspense>`, with `getGameSkeleton(gameType)` as the fallback. The `<Suspense>` only ever suspends for a *lazily*-registered board; the current eagerly-imported board never triggers the fallback. |
| `apps/web/app/play/[gameId]/loading.tsx` + `play-skeleton.tsx` | Route-level loading UI streamed while `page.tsx` fetches the game record. Reads the `gl_chat_layout` cookie and renders the matching chat shell - docked panel (`mounted`, sized to `chatWidth`), floating window (`popout`, positioned/sized from the saved `x/y/w/h`), or floating icon (minimized, positioned from the saved `x/y`). The board area is a **generic** placeholder: the game `type` isn't known yet at this stage (it *is* the data being fetched), so it can't pick a per-game skeleton. |

Authoritative counterpart on the server:

| Path | Role |
| --- | --- |
| `apps/server/src/realtime/index.ts` | Registers `join_room` (`:70`) and `make_move` (`:74`) on the shared connection via `registerGameEvent` (which validates the *payload envelope* then calls `handleJoinRoom`/`handleMakeMove` directly) and a `leave_room` (`:78`) listener that calls `leaveGameRoom`. |
| `apps/server/src/realtime/turn-based.ts` | Re-validates the move + stored state against the game's Zod schemas, runs `engine.reduce`, persists, broadcasts. |

## The package surface

The package's public surface is small:

```ts
export {
  clampVolume,
  GameAudioEngine,
  getGameAudioEngine,
  type MusicState,
  type SfxKey,
  type SfxSources,
  shouldPlayMusic,
  stepVolume,
} from "./audio/engine";
export { useGameAudio } from "./audio/use-game-audio";
export {
  CardBack,
  Joker,
  type JokerProps,
  PlayingCard,
  type PlayingCardProps,
} from "./playing-cards/playing-card";
export { getGameClient, getGameSkeleton } from "./registry";
export { DefaultGameSkeleton, SkeletonBox } from "./skeletons";
export type { GameClientProps } from "./types";
```

(`packages/games-client/src/index.ts:1`)

That is the entire public API. Everything else - the per-game boards, the replay toolbar, the socket plumbing - is an implementation detail reached only through these helpers.

### Per-game loading skeletons

A board registered with `React.lazy` resolves as a chunk, so something must render while it loads. The currently registered tic-tac-toe board is *not* lazy (it is statically imported, so it SSRs and never suspends), but the skeleton system is still required: the structural test makes every game ship one, and it remains the `<Suspense>` fallback the moment any game is registered lazily. `getGameSkeleton(type)` resolves the matching skeleton from a small `SKELETON_REGISTRY`, falling back to `DefaultGameSkeleton` when a game ships none:

```ts
export function getGameSkeleton(gameType: string): ComponentType {
  const registry: Record<string, ComponentType> = SKELETON_REGISTRY;
  return registry[gameType] ?? DefaultGameSkeleton;
}
```

(`packages/games-client/src/registry.ts:24`)

`SKELETON_REGISTRY` is typed `Record<GameType, ComponentType>` (every registered game must ship a skeleton); `getGameSkeleton` accepts a plain `string` and widens through a local `Record<string, ComponentType>` alias so an unknown type falls through to the default rather than failing to type-check.

Two deliberate choices:

- **Skeletons are registered eagerly, not lazily.** A skeleton must be available *before* the board it stands in for has rendered - so it lives in its own tiny module (`games/<type>/skeleton.tsx`) and is statically imported into the registry, never `React.lazy`'d. Keeping it in its own module (rather than `client.tsx`) also means it can serve as the fallback for a board that *is* lazily registered, without dragging that board's chunk in with it.
- **Skeletons are prop-less and `"use client"`-free.** They are pure presentational markup built from `SkeletonBox`, so they render as a `<Suspense>` fallback in the client tree without needing game data or a client boundary. A good skeleton mirrors the board's layout (tic-tac-toe draws a 3×3 grid) so the swap to the live board doesn't shift the page.

`play-client.tsx` uses it as the board's fallback:

```tsx
const GameClient = getGameClient(gameType);
const GameSkeleton = getGameSkeleton(gameType);

<Suspense fallback={<GameSkeleton />}>
  <GameClient … />
</Suspense>
```

This is distinct from the **route-level** `loading.tsx`, which streams while `page.tsx` fetches the game record. It reads the `gl_chat_layout` cookie so the chat half of the shell (docked / popout / minimized, at the saved geometry) matches what the user will see, but its board area is a generic placeholder - the game `type` is unknown at that point (it *is* the data being fetched), so it can't pick a per-game skeleton. The per-game skeleton takes over once the type is resolved and the board starts loading.

### Why React/socket.io are *peer* dependencies

```json
"peerDependencies": {
  "motion": "^12",
  "react": "^19",
  "react-dom": "^19",
  "react-icons": "^5.6.0",
  "socket.io-client": "^4.8.3"
},
```

(`packages/games-client/package.json:19`)

React, `socket.io-client`, and `motion` (Framer Motion, used for board animations like the winning-line strike) are peers, not regular dependencies, so the host (the Next.js app in `apps/web`) supplies the single shared copy. This avoids two React instances (which would break hooks) and keeps the package itself React-version-agnostic. The mirror-image fact is that `packages/games-core` has *no* React at all - that is what lets `apps/server` import the engine without dragging the browser runtime into a Bun process. The logic↔UI split is enforced at the dependency-graph level, not just by convention.

## The board contract: `GameClientProps`

Every board component is a `ComponentType<GameClientProps>`. The shape is intentionally small:

```ts
import type { AvatarConfig } from "@kyzen/shared/types";
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
    players: {
      userId: string;
      username: string;
      role: string;
      avatar?: AvatarConfig | null;
    }[];
    gameState?: unknown;
  };
  initialMoves: Record<string, unknown>[];
  onViewProfile?: (user: {
    username: string;
    displayName?: string | null;
    avatar?: AvatarConfig | null;
  }) => void;
};
```

(`packages/games-client/src/types.ts`)

Notes that matter:

- **`gameId: string`** - the game's public room **code** (e.g. `K7P2QX`), the value carried in the `/play/<code>` URL and serialized as `initialGame.id`. The board echoes it straight back as `gameId` in `join_room` / `make_move` / `leave_room`; the server validates it with `gameCodeSchema` and resolves the game with `getGameByCode`. The internal UUID never reaches the client.
- **`socket: Socket | null` + `connected: boolean`** - the *single shared* Socket.IO connection, supplied by the host app from `useSocket()` (the `SocketProvider` in `apps/web`). Boards **must not open their own `io()` connection** - both the chat lane and the game lane ride this one socket (see [Realtime](./realtime.md)). `socket` is `null` until the provider connects; `connected` mirrors the live connection status for the board's status dot.
- **`userId: string | null`** - boards must handle the signed-out viewer. Tic-tac-toe shows a "Sign in to join this table" banner instead of a connection dot.
- **`initialGame.gameState?: unknown`** - the per-game state is deliberately untyped here. games-client is generic over all games; the *concrete* board narrows `unknown` to its own type (tic-tac-toe casts to its local `GameJson`/`TicState`). The authoritative shape lives in games-core's Zod `stateSchema`, not in this prop.
- **`initialMoves: Record<string, unknown>[]`** - the full move log, used to drive replay of finished games. Again untyped at the boundary; the board interprets each move's `moveData` itself.
- **`onViewProfile?`** - an optional callback the host passes so the board can open a profile popup. The web route supplies it from `useProfilePopup()` (`apps/web/app/play/[gameId]/play-client.tsx:53`); tic-tac-toe forwards it to `PlayerBar`, which wires the opponent's avatar into a button. Boards may omit it (it is optional).

These `initial*` props are SSR data: the RSC route fetches them once so the board renders fully on first paint, then the board takes over live updates via the shared socket. See the walkthrough below.

## Resolution by type

The registry is an object keyed by the **typed `GameType`** from `@kyzen/shared` (not a bare string literal), with each value a `ComponentType<GameClientProps>`. The key is the exported `TIC_TAC_TOE` constant, so a typo is a compile error rather than a silently missing board. The currently registered board is **statically imported** - the registry holds the `TicTacToeGameClient` component directly:

```ts
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameType } from "@kyzen/shared/types";
import type { ComponentType } from "react";
import { TicTacToeGameClient } from "./games/tic-tac-toe/client";
import { TicTacToeSkeleton } from "./games/tic-tac-toe/skeleton";
import { DefaultGameSkeleton } from "./skeletons";
import type { GameClientProps } from "./types";

const REGISTRY: Record<GameType, ComponentType<GameClientProps>> = {
  [TIC_TAC_TOE]: TicTacToeGameClient,
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

- **Typed keys.** `REGISTRY` and `SKELETON_REGISTRY` are `Record<GameType, …>`, so the compiler requires an entry for every game type the registry (`GAME_TYPES` in `@kyzen/shared/constants`) knows about. The public getters still accept a plain `string` and widen through a local `Record<string, …>` alias, so an unknown type returns `null`/the default instead of failing to type-check.
- **Eager import → server-rendered board.** The registry holds `TicTacToeGameClient` directly (a plain function component), so the board renders during SSR and ships in the initial HTML. Opening or reloading a finished game shows the final position immediately, with no skeleton-to-board snap. Because the only registered game's board is reached on the `/play` route - already its own route bundle - there is no meaningful code-splitting cost.
- **Lazy is still permitted for a heavy game.** The registry value type is `ComponentType<GameClientProps>`, which a `React.lazy(() => import(…))`-wrapped board also satisfies. If a future game ships a heavy board (large assets, a big dependency), register it lazily to code-split it into its own chunk; its `<Suspense>` fallback (`getGameSkeleton`) will then actually render while the chunk loads. A `React.lazy` board needs the `.then((m) => ({ default: m.BoardComponent }))` adapter because `client.tsx` exports a *named* component, not a default.
- **Unknown types return `null`, not a throw.** A game-type the web build doesn't know how to render degrades gracefully - the caller shows a "not supported here" message rather than crashing (`apps/web/app/play/[gameId]/play-client.tsx:75`).
- **One source of truth on the web side.** The route never references a specific game component; it only knows the string. Adding a game = one line in `REGISTRY` (and, optionally, one in `SKELETON_REGISTRY`) plus the matching `GameDefinition` in games-core. No new route, no new endpoint.

Callers still render the board inside a `<Suspense>` boundary so that a *lazily*-registered board has a fallback (for the eager board the boundary simply never suspends). That's what the web app does:

```tsx
const GameClient = getGameClient(gameType);
const GameSkeleton = getGameSkeleton(gameType);
const { socket } = useSocket();
const status = useAtomValue(socketStatusAtom);
const openProfile = useProfilePopup();

const connected = status === "connected";
const gameNode = useMemo(
  () =>
    GameClient ? (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">
        <Suspense fallback={<GameSkeleton />}>
          <GameClient
            gameId={gameId}
            userId={userId}
            socket={socket}
            connected={connected}
            initialGame={initialGame}
            initialMoves={initialMoves}
            onViewProfile={openProfile}
          />
        </Suspense>
      </div>
    ) : (
      <div className="p-6 text-center text-muted-foreground text-sm">
        This game type isn't supported here.
      </div>
    ),
  [...],
);
```

(`apps/web/app/play/[gameId]/play-client.tsx:49`)

The route (`apps/web/app/play/[gameId]/page.tsx`) is a single dynamic segment for **every** game; the `gameType` it forwards comes from the fetched game record, and the registry does the dispatch. The `socket` arrives from `useSocket()` and the connection status is read from `socketStatusAtom` via `useAtomValue` (`play-client.tsx:51`–`:52`).

## How a board talks to realtime

A board reaches the backend over the **shared `socket.io-client` connection** handed in via `props.socket` - it does not open its own connection, and it does not go through the web app's REST helpers for live play. The host (`apps/web/app/play/[gameId]/play-client.tsx`) pulls the connection from `useSocket()` and passes it down; the same socket also carries the chat lane. Tic-tac-toe is the reference implementation.

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

Given the shared socket and a non-null key, the board registers its listeners and emits `join_room` - immediately if the socket is already connected, and again on every `connect` so a reconnect re-joins:

```tsx
useEffect(() => {
  if (!socket || !liveSocketKey) return;

  const { gameId: gid } = liveSocketKey;

  const onConnect = () => {
    setError(null);
    socket.emit("join_room", { gameId: gid });
  };
  const onGameState = (payload: {
    game: GameJson;
    moves?: MoveJson[];
    move?: MoveJson;
  }) => {
    setGame(payload.game);
    if (payload.moves) {
      setMoves(payload.moves);
    } else if (payload.move) {
      const m = payload.move;
      setMoves((prev) => appendMove(prev, m));
    }
  };
  const onGameError = (payload: { message?: string }) => {
    setError(payload.message ?? "Error");
  };

  socket.on("connect", onConnect);
  socket.on("game_state", onGameState);
  socket.on("game_error", onGameError);

  if (socket.connected) socket.emit("join_room", { gameId: gid });

  return () => {
    socket.off("connect", onConnect);
    socket.off("game_state", onGameState);
    socket.off("game_error", onGameError);
    if (socket.connected) socket.emit("leave_room", { gameId: gid });
  };
}, [socket, liveSocketKey]);
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx`)

The board never sends its own `userId` in the payload - the server derives identity from `socket.data.userId` (set by the auth middleware, from the Better Auth cookie that rode in on the shared connection's handshake), so the client cannot impersonate anyone.

### The two inbound events

The handlers (defined inline in the effect above):

- **`game_state`** is the only state message - but it arrives in two flavours. On **join** the server sends `{ game, moves }` (the full record plus the entire move log) via `emitFullState`, and the board replaces its move list wholesale (`setMoves(payload.moves)`). After **each move** the server sends `{ game, move }` (the full record plus the single *new* move as a delta) from `handleMakeMove` (`apps/server/src/realtime/turn-based.ts:170`–`:174`), and the board appends just that move (`appendMove`, which de-dupes by `moveNumber`). Either way `payload.game` overwrites the local game record, so the snapshot is always authoritative.
- **`game_error`** surfaces any rejection (bad payload, not your turn, occupied cell) as a string the board displays.

There is no separate `move_made` event - the server emits exactly one `game_state` per move.

The cleanup **does not disconnect the shared socket** - that would tear down the chat lane too. Instead it removes the board's own listeners with `socket.off(...)` and emits `leave_room` so the persistent socket leaves the `game:<id>` room. The effect is keyed on `socket` + `liveSocketKey`, so signing out or a game reaching a terminal status (key becomes `null`) cleanly stops the board from participating without touching the connection.

### Deriving `canMove` and emitting a move

The board computes whether the local user may act *purely as a UI hint* - the real gate is the server:

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

Crucially, `makeMove` does **not** mutate the board. There is no optimistic update. It fires `make_move` and waits; the board only changes when the server echoes back a `game_state`. This is what keeps client and server in lockstep and makes cheating pointless - `canMove` being `true` locally means nothing if the server's `engine.reduce` disagrees.

The board *does* layer sound effects over these same interaction points via `useGameAudio()` (`packages/games-client/src/games/tic-tac-toe/client.tsx:212`): hovering a playable cell calls `audio.playHover()` and clicking one calls `audio.playTouch()` *before* emitting (`:489`/`:493`), an applied opponent move plays `playTouch` (`:375`), a game ending plays `playWin()`/`playDraw()` (`:361`/`:360`), and replay autoplay/step plays `playTouch` (`:244`/`:395`). SFX are purely presentational - they never touch board state, so the no-optimistic-update invariant still holds. See [audio.md](./audio.md).

## Data-flow walkthrough: from page load to a confirmed move

**Phase 1 - server-rendered first paint (REST):**

1. User opens `/play/<gameId>` → `apps/web/app/play/[gameId]/page.tsx:29` runs as an RSC.
2. It validates the `[gameId]` segment is a game **code** (`isGameCode`, then normalizes + redirects to the canonical code), resolves the session via `getServerSession()` (redirects to `/auth` if signed out), then `serverFetchJson` → `GET /api/games/:gameId` returns `{ game, moves }` (`apps/web/app/play/[gameId]/page.tsx:42`). The `:gameId` is the code, and `data.game.id` is that same code (`serializeGame` maps `row.code → GameJson.id`).
3. It renders `<PlayClient ... initialGame initialMoves gameType={data.game.gameType} />` (`apps/web/app/play/[gameId]/page.tsx:78`); `gameType` is the typed `GameType` carried on the fetched `GameJson` (`page.tsx:81`).
4. `play-client.tsx:49` calls `getGameClient(gameType)` (and `getGameSkeleton(gameType)`) → registry returns the statically-imported `TicTacToeGameClient` component.
5. `<Suspense>` wraps and mounts `TicTacToeGameClient` with the SSR `initial*` props plus the shared `socket`/`connected` from `useSocket()` (`apps/web/app/play/[gameId]/play-client.tsx`). Because the board is eagerly imported, it renders during SSR and paints immediately from `initialGame`/`initialMoves` - the `<Suspense>` never suspends and the skeleton fallback is never shown - no join needed yet.

**Phase 2 - going live (shared socket):**

6. The board's effect sees a non-null `liveSocketKey` and a live `socket`, registers its listeners, and emits `join_room { gameId }` on the **shared** connection (`packages/games-client/src/games/tic-tac-toe/client.tsx`).
7. The `join_room` registration (`registerGameEvent`) validates the envelope with `clientJoinRoomSchema`, then calls `handleJoinRoom(io, socket, data)` from `./turn-based` directly (`apps/server/src/realtime/index.ts:70`).
8. `turn-based.ts` `handleJoinRoom` (`apps/server/src/realtime/turn-based.ts:107`) looks up the game, seats the user if there's a free seat, joins the socket room, and emits a full `game_state` snapshot (`{ game, moves }`) back via `emitFullState` (`:125`).
9. The board's `game_state` listener overwrites local `game`/`moves` (`packages/games-client/src/games/tic-tac-toe/client.tsx`).

**Phase 3 - making a move (the trust boundary):**

10. User clicks a cell → `makeMove(row, col)` emits `make_move { gameId, moveData: { row, col } }` (`packages/games-client/src/games/tic-tac-toe/client.tsx`). No local board change.
11. The `make_move` registration (`registerGameEvent`) validates the envelope with `clientMakeMoveSchema`, then calls `handleMakeMove(io, socket, data)` from `./turn-based` directly (`apps/server/src/realtime/index.ts:74`).
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

(`apps/server/src/realtime/turn-based.ts:147`)

`def.moveSchema`/`def.stateSchema`/`def.engine.reduce` here are **the same `ticTacToeMoveSchema`, `ticTacToeStateSchema`, and `ticTacToeEngine.reduce`** the board imported types from - see `packages/shared/src/types/games/tic-tac-toe/schemas.ts` and the rule logic in `packages/games-core/src/games/tic-tac-toe/engine.ts:70` (turn check, occupied-cell check, win/draw outcome). One definition, used to *inform* the client and to *enforce* on the server.

13. On success the server persists the move + new state, finalizes win/draw stats, then broadcasts a single `game_state` carrying `{ game, move }` - the full serialized game plus the one new move as a delta (`apps/server/src/realtime/turn-based.ts:170`–`:174`) - to the room.
14. The board's listeners apply the update; the new mark appears. On rejection (step 12 returning an error), the board receives `game_error` and shows the message - the board never advanced on its own, so there's nothing to roll back.

Net: **user click → `make_move` over socket → server Zod-validates + `engine.reduce` → DB → broadcast `game_state` → board re-renders.** The arrow from click to pixels always passes through the server.

## Replay mode for finished games

When a game's status is `completed` or `abandoned`, the board flips from "live, socket-driven" to "offline replay scrubber". The same component handles both; it just selects a different state source.

The mode flags and initial scrub position - the live/over distinction is delegated to the shared `isGameLive`/`isGameOver` status helpers (`packages/shared/src/types/games/wire.ts:104`/`:108`, re-exported from `@kyzen/shared/types`), so the board never hard-codes the status strings:

```tsx
const isLive = isGameLive(game.status);

const isPast = isGameOver(game.status);
```

(`packages/games-client/src/games/tic-tac-toe/client.tsx:222`)

`isGameLive` returns `true` for `"waiting"`/`"active"` and `isGameOver` for `"completed"`/`"abandoned"`. `replayStep` starts at the end if the game was already finished on load (`pastInitially ? initialMoves.length : 0`, where `pastInitially = isGameOver(initialGame.status)`, `packages/games-client/src/games/tic-tac-toe/client.tsx:214`). Because `liveSocketKey` is `null` once `isLive` is false, **no socket is opened for finished games** - replay is entirely client-side from the move log.

The board reconstructs the position at any step by folding moves over an empty board - note it deliberately re-derives state rather than trusting any stored snapshot, sorting by `moveNumber` and applying each player's `role`:

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

The rest of replay is UI sugar: a `<ReplayToolbar>` with first/prev/play/next/last buttons whose glyphs come from `react-icons/fa6` (`FaBackwardStep`/`FaChevronLeft`/`FaPlay`/`FaPause`/`FaChevronRight`/`FaForwardStep`) rather than hand-written `<svg>`, per the repo icon convention (`packages/games-client/src/games/tic-tac-toe/client.tsx:18`), an autoplay interval of `REPLAY_MS` (850ms) that advances `replayStep` and stops at the end (`packages/games-client/src/games/tic-tac-toe/client.tsx`), and keyboard shortcuts (←/→/Space, wired through `useEffectEvent`) that are ignored while focus is in an input/textarea/select/contenteditable (`packages/games-client/src/games/tic-tac-toe/client.tsx:417`). There's also a render-phase transition guard (a `wasLive` state mirror compared during render, not a `useEffect`): when a game flips from live to finished *during* the session, it jumps the scrubber to the last move and stops autoplay (`packages/games-client/src/games/tic-tac-toe/client.tsx:250`).

## Gotchas, invariants & conventions

- **No comments anywhere.** This repo enforces a strict no-comments rule on all code files; the only comment in `turn-based.ts` is a `biome-ignore` directive (a permitted tooling directive). Do not add explanatory `//` comments to any board you write.
- **Never trust the client.** A board may compute `canMove`, gray out occupied cells, etc., but those are UX only. The server re-validates with the game's Zod `moveSchema`/`stateSchema` and `engine.reduce` (`apps/server/src/realtime/turn-based.ts:147`). If your board's gating ever disagrees with the engine, the engine wins and the user sees a `game_error`.
- **No optimistic updates in tic-tac-toe.** `makeMove` emits and waits; the board mutates only when the server echoes back a `game_state`. This is the recommended pattern - it keeps the displayed board provably equal to server state.
- **Reuse the shared socket - never call `io()`.** The board receives the one shared connection via `props.socket` and rides it for the game lane alongside chat. Opening your own `io()` would create a second redundant connection (double handshake/auth, doubled presence). On cleanup, remove your listeners with `socket.off(...)` and emit `leave_room`; **never** call `socket.disconnect()` - the connection is owned by the host's `SocketProvider`.
- **Identity is never in the payload.** Boards send `{ gameId, moveData }` only. The server reads the user from the authenticated socket (`socket.data.userId`), set from the Better Auth session cookie that rode on the shared connection's handshake (`withCredentials: true`). Sending a `userId` from the client would be ignored.
- **`gameState` and `moveData` cross the boundary as `unknown`.** `GameClientProps.initialGame.gameState` is `unknown` and `initialMoves` is `Record<string, unknown>[]` because games-client is generic. Each board narrows these itself (tic-tac-toe casts to a local `GameJson`/`TicState`). The real schema lives in games-core; keep that the single source of truth and import its types rather than re-declaring shapes.
- **Boards must be `"use client"` and Suspense-safe.** The web route wraps every board in `<Suspense>` (`apps/web/app/play/[gameId]/play-client.tsx:62`), so a board registered with `React.lazy` has its fallback covered; the currently registered board is eagerly imported, so it SSRs and that boundary never suspends for it. Either way the first line of `client.tsx` is `"use client"`.
- **Register by the typed `GameType` key.** Both `REGISTRY` and `SKELETON_REGISTRY` are `Record<GameType, …>` keyed by the constant exported from `@kyzen/shared/constants` (`TIC_TAC_TOE`), so a typo or a missing entry is a *compile error* - the registries can't fall out of sync with `GAME_TYPES` silently. The runtime getters still accept a plain `string` (the value comes off a fetched record), and an unrecognized one yields `null` (board) / `DefaultGameSkeleton` (skeleton).
- **Tailwind must see the source.** Classes used in board components only survive the build because `apps/web/app/globals.css:3` has `@source "../../../packages/games-client/src/**/*.{ts,tsx}"` and `apps/web/next.config.ts:5` lists `@kyzen/games-client` in `transpilePackages`. A new board file outside that glob would lose its Tailwind classes.
- **React/socket.io/motion are peers.** Don't add `react`, `socket.io-client`, or `motion` (Framer Motion, used by `win-strike.tsx`) as regular dependencies of this package - they must come from the host app to avoid duplicate-instance bugs.
- **Room participation is keyed on `liveSocketKey`.** Signing out, or a game reaching a terminal status, sets the key to `null`; the effect then emits `leave_room` and detaches its listeners (leaving the shared connection intact). Finished games never join a room; they replay from the move log.

## Where to go next

- [Architecture index](./README.md) - start here for the full doc map.
- [games-core schemas](./games-core-schemas.md) - the strict Zod `stateSchema`/`moveSchema`/`configSchema` whose types this package consumes (`Cell`, `TicTacToeState`) and which the server validates against.
- [games-core engine](./games-core-engine.md) - `GameEngine`/`reduce`/`Outcome`, the authoritative rules the board mirrors.
- [Realtime](./realtime.md) - the socket lanes, `join_room`/`make_move`, the turn-based handlers (`handleJoinRoom`/`handleMakeMove`), and the `game_state` broadcast this package listens for.
- [Server API](./server-api.md) - `GET /api/games/:gameId`, the REST source for the `initial*` props.
- [Web app](./web.md) - the `/play/[gameId]` route and how `getGameClient` is mounted under `<Suspense>`.
- [Auth](./auth.md) - how the session cookie carried by `withCredentials: true` becomes `socket.data.userId` on the server.
