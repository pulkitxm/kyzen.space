# Game audio: SFX engine, background music & the settings gear

## What this is / why it matters

Games on the play screen have sound: short **effect** tones (hover, touch, win,
draw) and an ambient **background-music** loop. Both are synthesized in the
browser with the Web Audio API — there are **no audio asset files** to ship,
license, or cache-bust. Two user preferences (a *game-sound* channel and a
*background-music* channel, each with a volume and a mute) drive everything; they
are **client-only** and persist in `localStorage`. Nothing here touches the game
DB, the game Zod schemas, or the wire/socket contract — audio is a pure
presentation concern, so the same `GameDefinition` model from
[the overview](./README.md) is untouched.

The design splits cleanly across the package boundary:

- **`@gamelobby/games-client` owns the engine** — a framework-light, imperative
  `GameAudioEngine` singleton plus pure helpers. It has **no jotai dependency**;
  it just exposes `play*` / `set*` methods.
- **`apps/web` owns the preferences and the UI** — two `atomWithStorage` atoms, a
  bridge hook that pushes their values into the engine, the sliding gear button,
  and the settings modal (rendered through the layered-popup host).

Because jotai is a singleton across the workspace (`transpilePackages`, see
[web.md](./web.md)), the `apps/web` bridge and the `games-client` board call the
**same** engine instance — the board never needs to read an atom.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/constants/audio.ts` | Storage keys (`GAME_SFX_STORAGE_KEY`, `GAME_MUSIC_STORAGE_KEY`), default volumes, `VOLUME_MIN`/`MAX`/`STEP`. |
| `packages/shared/src/types/audio.ts` | `AudioChannelPrefs = { volume, muted }` — the per-channel shape used on both sides. |
| `packages/games-client/src/audio/engine.ts` | `GameAudioEngine` (lazy `AudioContext`, oscillator SFX, procedural music loop) + `getGameAudioEngine()` singleton + pure helpers `clampVolume` / `stepVolume` / `shouldPlayMusic`. |
| `packages/games-client/src/audio/use-game-audio.ts` | `useGameAudio()` → stable `{ playHover, playTouch, playWin, playDraw, unlock }` bound to the singleton. |
| `apps/web/lib/audio/atoms.ts` | `gameSfxAtom` / `gameMusicAtom` (`atomWithStorage`, SSR-safe noop storage), seeded from the shared defaults. |
| `apps/web/lib/audio/use-audio-bridge.ts` | `useGameAudioBridge()` — syncs both atoms into the engine, marks music active for the play screen's lifetime, and registers a one-time gesture `unlock`. |
| `apps/web/app/play/[gameId]/game-settings-gear.tsx` | The `FaGear` button; slides via `motion/react` and opens the settings popup. |
| `apps/web/app/play/[gameId]/game-settings-panel.tsx` | Modal body: per-channel mute toggle, −/+ buttons, range slider, % readout. |

## The engine (`games-client`)

`GameAudioEngine` creates its `AudioContext` lazily (`ensureContext`) so the
module is safe to import during SSR; `getGameAudioEngine()` returns `null` when
`window` is undefined and otherwise memoizes a single instance.

- **SFX** are one-shot oscillators following the reference's specs — hover
  (triangle 600Hz/0.05s), touch (square 800Hz/0.1s), draw (sawtooth 300Hz/0.5s),
  and a win fanfare (a sine arpeggio C5→E5→G5→C6). Each note ramps its gain
  exponentially from a peak down to a floor, both scaled by the SFX volume; a
  muted or zero-volume channel plays nothing.
- **Background music** is a procedurally-scheduled sine arpeggio over a four-chord
  loop, fed through a persistent `musicGain` node. A short look-ahead scheduler
  (`startMusicLoop`) queues notes ahead of the audio clock. `reconcileMusic`
  centralizes the "should it be playing?" decision via the pure
  `shouldPlayMusic({ active, muted, volume, running })` predicate, so volume/mute/
  active/unlock changes all converge on one start/stop path. The arpeggio is a
  deliberate placeholder ("any BG music") and can be swapped for a different
  generator (or a sampled track) without changing any caller.

The volume math (`clampVolume`, `stepVolume`) and `shouldPlayMusic` are exported
pure functions, unit-tested in `packages/games-client/tests/audio.test.ts`
(the `AudioContext` paths aren't exercised under Bun).

### Browser autoplay & the gesture unlock

Browsers refuse to start an `AudioContext` before a user gesture. The bridge
registers one-time `pointerdown`/`keydown` listeners that call `engine.unlock()`
(resume the context, then `reconcileMusic`), so music begins right after the
first interaction and SFX are audible from the first tap. SFX `play*` methods also
opportunistically `resume()`.

## Preferences, the bridge & live updates (`apps/web`)

`gameSfxAtom` / `gameMusicAtom` are `atomWithStorage<AudioChannelPrefs>` with the
shared keys + defaults and the same SSR-safe noop-storage pattern as
`lib/sidebar-atoms.ts`. They are read only inside client components (the bridge's
effects and the settings panel inside the portal), so there is no SSR/hydration
output to mismatch.

`useGameAudioBridge()` (called once in `play-client.tsx`) is the one-way pipe
**atoms → engine**: effects push `setSfx*` / `setMusic*` whenever a value
changes, `setMusicActive(true)` for the screen's lifetime (false on unmount), and
the gesture-unlock listeners. The settings panel writes the atoms; the bridge
reflects the change into the engine on the next render — so dragging a slider or
toggling mute updates the running sound immediately.

## The gear (slide + modal)

`GameSettingsGear` is an `absolute top-3 right-3` `motion.div` that animates
`x` between `0` and `-offset` using the house `EASE_OUT` cubic-bezier. It opens
`GameSettingsPanel` through `useLayeredPopup().openLayer(...)` (the global
layered-popup host, mounted in `app-shell.tsx`).

`GameChatSplit` (`app/play/[gameId]/game-chat-split.tsx`) owns the chat docking
state, so it renders the gear and computes when it should slide:
`docked = isDesktop && mode === "mounted" && !minimized`, with
`offset = chatWidth + RESIZE_HANDLE_W`. When the chat docks it occupies width on
the right, so the gear slides left to stay over the game area; popping out,
minimizing, or stashing the chat returns it to `x: 0`. The no-conversation play
branch (`play-client.tsx`) renders a static, non-sliding gear so settings are
reachable even when there is no chat.

## Win sound: exactly once, live only

The win/draw fanfare must fire once when the game ends *live* and never on
replay or when revisiting a finished game. The tic-tac-toe board
(`packages/games-client/src/games/tic-tac-toe/client.tsx`) detects this with a
status-transition effect rather than the win-line animation or a socket event
(which would race the live-socket teardown): a `useEffect` keyed on
`game.status` / `game.winner` plays the sound only on a `waiting|active →
completed` transition seen within the component's lifetime, guarded by a
once-only ref.

- **Revisit / reload**: the game loads already `completed`, so there is no
  transition — silent.
- **Replay**: scrubbing changes `replayStep`, never the top-level `game.status` —
  silent.
- **Live finish**: the winning `game_state` flips `active → completed` — plays
  once.

Hover and touch tones, by contrast, fire on the cell `onMouseEnter` / `onClick`.
To make them work during replay too (cells are non-interactive then), the cell
uses `aria-disabled` + a `playable` guard instead of the native `disabled`
attribute (which suppresses pointer events); `makeMove` only runs when `playable`.

## Gotchas & conventions

- **No audio assets.** SFX and music are synthesized. Don't add `.mp3`/`.wav`
  files unless you also swap the engine's music generator; keep the engine the
  single playback authority.
- **The engine is jotai-free.** Preferences live in `apps/web` atoms and are
  pushed in via the bridge. Don't add jotai to `games-client` to read prefs.
- **Audio is client-only.** No DB, no game schema, no socket event. The win
  signal is derived from the existing `game.status`/`game.winner` the board
  already receives.
- **One gesture unlock.** Music can't start before a user interaction; that's a
  browser policy, handled by the bridge's unlock listeners — not a bug.
- **Defaults:** game sound `0.6`, music `0.3`, both unmuted, persisted per-device
  under the `gl-game-sfx` / `gl-game-music` keys.

## Where to go next

- [web.md](./web.md) — the play route, the layered-popup host, jotai-as-singleton,
  and `GameChatSplit`'s chat docking state the gear keys off.
- [games-client.md](./games-client.md) — the board package the engine ships in and
  the `GameClientProps` the board receives.
- [tic-tac-toe](../games/tic-tac-toe.md) — where the sound triggers are wired.
