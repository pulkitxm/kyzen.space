# Game audio: SFX engine, background music & the settings gear

## What this is / why it matters

Games on the play screen have sound: short **effect** sounds (hover, touch, win,
draw) and **background music**. Everything is an audio **file** played through the
Web Audio API - there is no runtime tone synthesis. All assets are **Opus** in
`.ogg` (the best-compressing widely-supported web codec). SFX are tiny clips
decoded into buffers; the background music is a per-game streamed track
(tic-tac-toe ships a jazz `.ogg`). Two user preferences (a *game-sound* channel
and a *background-music* channel, each with a volume and a mute) drive everything;
they are **client-only** and persist in `localStorage`. Nothing here touches the
game DB, the game Zod schemas, or the wire/socket contract - audio is a pure
presentation concern, so the same `GameDefinition` model from
[the overview](./README.md) is untouched.

The design splits cleanly across the package boundary:

- **`@kyzen/games-client` owns the engine** - a framework-light, imperative
  `GameAudioEngine` singleton plus pure helpers. It has **no jotai dependency**;
  it just exposes `play*` / `set*` methods.
- **`apps/web` owns the preferences and the UI** - two `atomWithStorage` atoms, a
  bridge hook that pushes their values into the engine, the sliding gear button,
  and the settings modal (rendered through the layered-popup host).

Because jotai is a singleton across the workspace (`transpilePackages`, see
[web.md](./web.md)), the `apps/web` bridge and the `games-client` board call the
**same** engine instance - the board never needs to read an atom.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/constants/audio.ts` | Storage keys (`GAME_SFX_STORAGE_KEY`, `GAME_MUSIC_STORAGE_KEY`), default volumes, `VOLUME_MIN`/`MAX`/`STEP`. |
| `packages/shared/src/types/audio.ts` | `AudioChannelPrefs = { volume, muted }` - the per-channel shape used on both sides. |
| `packages/games-client/src/audio/engine.ts` | `GameAudioEngine` (lazy `AudioContext`; file SFX decoded to buffers through an `sfxGain`; a single looping streamed music track that fades out/in at the loop boundary through `musicGain`) + `getGameAudioEngine()` singleton + pure helpers `clampVolume` / `stepVolume` / `shouldPlayMusic`. |
| `packages/games-client/src/audio/use-game-audio.ts` | `useGameAudio()` → stable `{ playHover, playTouch, playWin, playDraw, unlock }` bound to the singleton. |
| `apps/web/lib/audio/atoms.ts` | `gameSfxAtom` / `gameMusicAtom` (`atomWithStorage`, SSR-safe noop storage), seeded from the shared defaults. |
| `apps/web/lib/audio/use-audio-bridge.ts` | `useGameAudioBridge(musicUrl?)` - registers the SFX file URLs, sets the per-game music source, syncs both atoms into the engine, marks music active for the play screen's lifetime, and registers gesture-`unlock` listeners that live for the screen's lifetime. |
| `apps/web/lib/audio/music-sources.ts` | `gameMusicSource(gameType)` - reads the registered game's `meta.backgroundMusic` asset URL (tic-tac-toe → `/sounds/tic-tac-toe-bg.ogg`); `null` (no music) for the rest. |
| `apps/web/public/sounds/` | The Opus `.ogg` audio assets: `tic-tac-toe-bg.ogg` (background music) and `hover.ogg` / `click.ogg` / `win.ogg` / `draw.ogg` (SFX), each served at `/sounds/<name>`. |
| `apps/web/app/play/[gameId]/game-settings-gear.tsx` | The `FaGear` button; CSS slide via the `md:gear-shift` utility + `--gear-shift` var and opens the settings popup. |
| `apps/web/app/play/[gameId]/game-settings-panel.tsx` | Modal body: per-channel mute toggle, −/+ buttons, range slider, % readout. |

## The engine (`games-client`)

`GameAudioEngine` creates its `AudioContext` lazily (`ensureContext`) so the
module is safe to import during SSR; `getGameAudioEngine()` returns `null` when
`window` is undefined and otherwise memoizes a single instance.

- **SFX** are short audio files (`setSfxSources({ hover, touch, win, draw })`),
  each `fetch`ed once and `decodeAudioData`'d into an `AudioBuffer` (cached;
  preloaded on `unlock`). A trigger fires a fresh `AudioBufferSourceNode` into the
  `sfxGain` node, so rapid hovers **overlap** cleanly and the SFX volume/mute is
  one gain. A muted or zero-volume channel, a missing URL, or a failed load all
  play nothing. There is **no oscillator synthesis** anywhere in the engine.
- **Background music** is a streamed file routed through a persistent `musicGain`
  node. When a per-game track URL is registered (`setMusicSource`, e.g.
  tic-tac-toe's `/sounds/tic-tac-toe-bg.ogg`) it plays via an `HTMLAudioElement`
  → a per-track fade gain → `musicGain`. Streaming (rather than decoding the whole
  file) keeps memory low for multi-minute tracks (the jazz clip is ~5 min). The
  loop is **fade-out/fade-in at the loop boundary** (a single looping element's
  per-track fade gain, not two overlapping playbacks): a `timeupdate` handler ramps
  the fade gain down over the last `MUSIC_FADE_S` seconds and back up at the start of
  each pass (and on resume), so the wrap doesn't feel like a hard repeat. A game with no registered
  track simply has no music. `reconcileMusic` centralizes the "should it be
  playing?" decision via the pure `shouldPlayMusic({ active, muted, volume,
  running })` predicate, so volume/mute/active/source/unlock changes all converge
  on one start/stop path (and `AudioContext.onstatechange` re-runs it when an async
  `resume()` finishes).

The volume math (`clampVolume`, `stepVolume`) and `shouldPlayMusic` are exported
pure functions, unit-tested in `packages/games-client/tests/audio.test.ts`
(the `AudioContext` paths aren't exercised under Bun).

### Browser autoplay & the gesture unlock

Browsers refuse to start an `AudioContext` before a user gesture. The bridge
registers `pointerdown`/`keydown` listeners (added in an effect, removed only on
unmount) that call the idempotent `engine.unlock()` (resume the context,
`reconcileMusic`, and preload the SFX buffers), so music begins right after the
first interaction and SFX are decoded ahead of the first tap. `unlock()` is safe
to call on every gesture - repeat calls just no-op once the context is running.
SFX `play*` methods also opportunistically `resume()`.

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
reflects the change into the engine on the next render - so dragging a slider or
toggling mute updates the running sound immediately.

## The gear (slide + modal)

`GameSettingsGear` is an `absolute top-3 right-3` button that opens
`GameSettingsPanel` through `useLayeredPopup().openLayer(...)` (the global
layered-popup host, mounted in `app-shell.tsx`). Its slide is **CSS-driven and
SSR-correct**: the element carries a `--gear-shift` inline CSS variable and the
`md:gear-shift` utility (a custom `@utility` in `globals.css` →
`transform: translateX(var(--gear-shift, 0px))`) plus `transition-transform` for
the smooth slide. Living behind the `md:` breakpoint variant (pure CSS, not a JS
media query) means it renders correctly from the first server paint - no flash,
no `isDesktop` hook.

`GameChatSplit` (`app/play/[gameId]/game-chat-split.tsx`) owns the chat docking
state and sets `--gear-shift`: when the chat is docked
(`mode === "mounted" && !minimized`) the shift is `-(chatWidth + RESIZE_HANDLE_W)`
so the gear sits over the game area; popping out, minimizing, or stashing resets
it to `0`. On mobile the `md:` rule doesn't apply, so the gear stays at the corner
(the chat is a tab there). The no-conversation play branch (`play-client.tsx`)
renders a non-shifting gear.

The **loading skeleton** (`play-skeleton.tsx`) renders the gear with the *same*
`md:gear-shift` + `--gear-shift`, derived from the chat-layout **cookie** (the
same cookie that positions the skeleton's chat - see [web.md](./web.md)). So the
gear is pre-positioned during SSR and doesn't jump when the live page swaps in;
no gear-specific cookie is needed since its position is a function of the chat
layout.

## Win sound: exactly once, live only

The win/draw sound must fire once when the game ends *live* and never on
replay or when revisiting a finished game. The tic-tac-toe board
(`packages/games-client/src/games/tic-tac-toe/client.tsx`) detects this with a
status-transition effect rather than the win-line animation or a socket event
(which would race the live-socket teardown): a `useEffect` keyed on
`game.status` / `game.winner` plays the sound only on a `waiting|active →
completed` transition seen within the component's lifetime, guarded by a
once-only ref.

- **Revisit / reload**: the game loads already `completed`, so there is no
  transition - silent.
- **Replay**: scrubbing changes `replayStep`, never the top-level `game.status` -
  silent.
- **Live finish**: the winning `game_state` flips `active → completed` - plays
  once.

Hover and touch sounds, by contrast, fire on the cell `onMouseEnter` / `onClick`
but only when the cell is **playable** (empty, your turn, live) - both handlers
are guarded by the same `playable` flag that sets the cell's `disabled` state, so
manually hovering or clicking a finished/replayed board is silent. The
**opponent's** move has no local click, so the board also plays the touch sound
whenever the *live* board gains a mark (a `liveFilled` count increase) that isn't
the move you just made - de-duped via the post-move `currentTurn` flip (your own
move already sounded on click; after it, `currentTurn` is the opponent's, so the
echo is skipped; spectators, with no role, hear every move). Replay *playback* is
separate and audible: advancing the replay forward (autoplay or step-next, keyed
off `replayStepRef`) fires the **touch** sound per move, while the win/draw sound
never plays in replay (it's gated to the live status transition).

## Gotchas & conventions

- **Everything is a file; no synthesis.** SFX and music are all **Opus `.ogg`**
  assets under `apps/web/public/sounds/` (Opus is the best-compressing codec with
  broad 2026 browser + `decodeAudioData` support). SFX URLs are registered via
  `setSfxSources` (the bridge's `SFX_SOURCES` map → `/sounds/hover.ogg`,
  `/sounds/click.ogg`, `/sounds/win.ogg`, `/sounds/draw.ogg`); per-game music via
  `gameMusicSource`. Swap a sound by replacing the file; add a game's music by
  dropping a file in `public/sounds/` and adding one line to `gameMusicSource`.
  Keep the engine the single playback authority - route new audio through
  `sfxGain`/`musicGain`, not a stray `new Audio()` elsewhere.
- **The engine is jotai-free.** Preferences live in `apps/web` atoms and are
  pushed in via the bridge. Don't add jotai to `games-client` to read prefs.
- **Audio is client-only.** No DB, no game schema, no socket event. The win
  signal is derived from the existing `game.status`/`game.winner` the board
  already receives.
- **Gesture unlock.** Music can't start before a user interaction; that's a
  browser policy, handled by the bridge's `pointerdown`/`keydown` listeners
  calling the idempotent `engine.unlock()` - not a bug.
- **Defaults:** game sound `0.6`, music `0.3`, both unmuted, persisted per-device
  under the `gl-game-sfx` / `gl-game-music` keys.

## Where to go next

- [web.md](./web.md) - the play route, the layered-popup host, jotai-as-singleton,
  and `GameChatSplit`'s chat docking state the gear keys off.
- [games-client.md](./games-client.md) - the board package the engine ships in and
  the `GameClientProps` the board receives.
- [tic-tac-toe](../games/tic-tac-toe.md) - where the sound triggers are wired.
