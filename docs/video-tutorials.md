# Game video tutorials

`vid-tutorials/` (`@gamelobby/vid-tutorials`) is a [Remotion](https://www.remotion.dev/)
workspace that renders one short animated **tutorial video per game** - the
goal, setup, turns, win conditions, and edge cases of a game in 30-90 seconds
of motion graphics, themed like the app and scored with the game's own
background music. Pacing is tight by convention: a scene ends about one second
after its last animation settles, fades its content out over 12 frames
(`<SceneShell>`), and hard-cuts to the next - two scenes are never blended on
screen together.

## Quick start

```bash
cd vid-tutorials
bun run studio                          # Remotion Studio at http://localhost:3100
bun run render tic-tac-toe out/tic-tac-toe.mp4
bun run still tic-tac-toe out/frame.png --frame=120
bun run type-check
```

The **composition id is the game's type slug**, so Remotion Studio serves each
tutorial at `http://localhost:3100/<type>` (e.g. `/tic-tac-toe`). Rendered
files go to `vid-tutorials/out/`, which is gitignored - renders are never
committed.

## Layout

```text
vid-tutorials/
  remotion.config.ts        entry point; publicDir -> apps/web/public
  src/
    index.ts                registerRoot
    root.tsx                maps the TUTORIALS registry to <Composition>s
    lib/
      video.ts              FPS (30), 1920x1080, sec(), 30-90s duration bounds
      scene-shell.tsx       <SceneShell> - per-scene fade-out before the cut
      tutorial-music.tsx    <TutorialMusic> - looping bg music, fade in/out
    theme/
      theme.css             app theme tokens scoped to .vt-theme[data-mode]
      theme-root.tsx        <ThemeRoot> - sets --d/--v, background, font
      fonts.ts              Geist via @remotion/google-fonts
      pattern-backdrop.tsx  <PatternBackdrop> - the app's doodle-tile backdrop
    tutorials/
      registry.tsx          TUTORIALS: one entry per game (id = type slug)
      <type>/
        composition.tsx     the per-game composition
        scenes/             one file per scene
```

`root.tsx` registers every `TUTORIALS` entry as a 1920x1080 / 30 fps
`<Composition>`; per-game code never registers compositions itself.

## Theme - the app's tokens, not new ones

`<ThemeRoot>` wraps every composition. It reads `THEMES` /`DEFAULT_THEME` from
`@gamelobby/shared/constants` (so the default video theme **is** the app's
default theme) and sets the same `--d`/`--v` seed variables the web app uses;
`src/theme/theme.css` derives the full token set (`--background`, `--surface`,
`--primary`, `--muted-foreground`, `--border`, …) with the same `color-mix`
recipes as `apps/web/app/globals.css`, scoped to `.vt-theme[data-mode]`
(default: dark). Scenes style exclusively with those variables - brand colors
are never hardcoded - so a future `themeId`/`mode` prop swap restyles a whole
video.

## Assets - shared with the web app

`remotion.config.ts` sets Remotion's `publicDir` to `apps/web/public`, so the
app's static assets are addressable via `staticFile()` with no copying:
`sounds/<type>-bg.ogg` (bg music, the same files
`apps/web/lib/audio/music-sources.ts` registers), `games/<type>-cover.png`
(cover art), and `patterns/*.svg` (the doodle tiles `<PatternBackdrop>` masks,
mirroring `.app-canvas::before`).

Every tutorial plays its game's own bg track via `<TutorialMusic>`, which
loops it for the full video, fades in/out, and defaults to the app's
`DEFAULT_MUSIC_VOLUME`. A game with no track gets silence, never another
game's music.

## Adding a tutorial

Use the **`game-tutorial-builder`** agent
(`.claude/agents/game-tutorial-builder.md`): give it a markdown brief of the
game's rules - `docs/games/<type>.md` is the canonical input - and the type
slug. It writes the scene script, implements
`vid-tutorials/src/tutorials/<type>/`, registers the entry, and verifies
(type-check, biome, no-comments gate, per-scene stills, a full render).

Authoring conventions - scene structure, duration budget, motion rules
(`useCurrentFrame()` + `interpolate()`/`spring()` only; CSS animations and
`motion/react` are forbidden inside Remotion), theme/token usage - live in the
**`game-tutorial-videos`** skill (`.claude/skills/game-tutorial-videos/SKILL.md`),
which builds on the vendored **`remotion-best-practices`** skill
(`.claude/skills/remotion-best-practices/`, installed from
[`remotion-dev/skills`](https://github.com/remotion-dev/skills) via
`bunx skills add remotion-dev/skills`).

## Repo gates that apply

`vid-tutorials` is a regular workspace: `bun run type-check`, `bun run check`
(Biome), and the no-comments gate (`bun run strip-comments -- --check`) all
cover it, and `turbo run type-check` picks it up from the root.
