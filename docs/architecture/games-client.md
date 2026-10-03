# Game boards and shared sessions

`@kyzen/games-client` contains React boards and common board primitives. `@kyzen/games-core` contains pure engines; the authoritative server imports that package without importing React.

Turbo Pitch mounts a Three.js arena through the ordinary `GameClientProps` board contract. The board renders authoritative ball and car snapshots, sends bounded control intents through `makeMove`, and owns keyboard and touch input locally. It does not create its own socket or manage chat, profiles, or the room lifecycle.

## Board contract

`src/types.ts` defines `GameClientProps`:

| Prop | Purpose |
| --- | --- |
| `game` | Current authoritative `GameJson`, including opaque game-specific state |
| `moves` | Ordered `MoveJson` history |
| `userId` | Current viewer, or null |
| `connected` | Shared connection status |
| `makeMove` | Send a game-specific move intent |
| `onViewProfile` | Open a player's profile through the shared shell |

A board owns rendering, game-specific affordances, animations, and replay presentation. It does not own game snapshots, socket subscriptions, room membership, or transport errors.

## Shared session

`src/use-game-session.ts` runs once in `apps/web/app/play/[gameId]/play-client.tsx`. It starts from SSR data and uses `src/session.ts` to subscribe to the room through the application's existing Socket.IO connection.

`bindGameSession` joins immediately when connected and joins again after reconnect to request a full snapshot. It accepts `game_state` only for the mounted room. It removes its own listeners and leaves the room on unmount without disconnecting the shared connection. Completed rooms remain subscribed so rematch notifications can reach viewers.

`mergeGameMoves` replaces history when a full snapshot arrives. For move deltas it merges by move number, drops moves from other games, and sorts the result. The hook stores game and moves together, so the board and overlays consume one consistent session.

The play route keys its client by room code. Navigating to a different room therefore mounts a fresh session and resets game-specific UI state.

## Registry and loading

`src/registry.ts` contains one `Record<GameType, { Board, Skeleton? }>` registration. `getGameClient` returns a board or null; `getGameSkeleton` returns its optional skeleton or `DefaultGameSkeleton`. Own-property lookups reject prototype names such as `constructor`.

The current board is statically imported for SSR. A heavy board may use `React.lazy`, with the shell's existing Suspense boundary. Route loading uses a generic board placeholder because the game type is not yet known, while the saved chat layout can already be restored.

## Shared features

The play shell mounts `GameChatSplit` for games linked to a conversation. It controls docked, floating, and minimized chat. It also mounts settings, profile popups, the waiting overlay, and the result/rematch overlay. Each overlay receives the same current game as the board.

Game sound effects use `src/audio/use-game-audio.ts`. The web audio bridge supplies preferences and background music from `GameMeta.backgroundMusic`. Boards can reuse `src/playing-cards`, `src/ui`, and the skeleton primitives.

## Tic-tac-toe

`src/games/tic-tac-toe/client.tsx` renders marks and player bars, calculates legal UI actions, calls `makeMove({ row, col })`, and reconstructs finished positions from move history for replay. Private hooks own replay controls and keyboard listeners (`useReplay`), live move and outcome sounds (`useBoardAudio`), and winning-line animation (`useWinningStrike`). `BoardCells` renders the grid, while `GameConnectionNotice` renders connection guidance. Replay setters remain pure, and the current step ref updates in a layout effect. Its server engine remains responsible for legality and outcomes.

## Verification

`tests/session.test.ts` covers room isolation, reconnect joins, cleanup that preserves chat listeners, and move-history resynchronization. Registry tests check board/engine parity and unknown-key handling. Engine conformance and game rules are tested in games-core.

See [adding a game](../adding-a-game.md), [realtime](realtime.md), [audio](audio.md), and the [architecture map](README.md).
