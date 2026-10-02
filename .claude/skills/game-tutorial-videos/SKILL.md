---
name: game-tutorial-videos
description: Use when creating or editing a game tutorial video in vid-tutorials/ - house conventions for Remotion-based tutorials (app theme tokens, per-game bg music, composition registry, duration limits, verification)
metadata:
  tags: remotion, video, tutorial, games, theme
---

# Game tutorial videos (`vid-tutorials/`)

`vid-tutorials/` is the Bun workspace (`@kyzen/vid-tutorials`) that holds one
Remotion composition per game. The **composition id is the game's type slug**
(e.g. `tic-tac-toe`), so Remotion Studio serves each tutorial at
`http://localhost:3100/<type>` (`bun run studio` from `vid-tutorials/`).

**Read `.claude/skills/remotion-best-practices/SKILL.md` first** for Remotion
fundamentals, and pull in its `rules/*.md` files as needed (`timing.md`,
`sequencing.md`, `transitions.md`, `text-animations.md`, `audio.md`). This file
covers only what is specific to this repo.

## Layout

```
vid-tutorials/
  remotion.config.ts        entry point + publicDir (-> apps/web/public)
  scripts/
    export-tutorials.ts     bun run export -> out/<type>/tutorial.mp4 + chapters.txt
  src/
    index.ts                registerRoot
    root.tsx                maps TUTORIALS -> <Composition>
    lib/
      video.ts              FPS (30), 1920x1080, sec(), duration bounds
      scene-shell.tsx       <SceneShell> per-scene fade-out before the cut
      tutorial-music.tsx    <TutorialMusic> looping bg music with fade in/out
    theme/
      theme.css             app theme tokens scoped to .vt-theme[data-mode]
      theme-root.tsx        <ThemeRoot> wrapper (sets --d/--v + bg/fg/font)
      fonts.ts              fontSans (Geist via @remotion/google-fonts)
      pattern-backdrop.tsx  <PatternBackdrop> app-style doodle backdrop
    tutorials/
      manifest.ts           data-only list: id, title, chapters (no React)
      registry.tsx          maps manifest entries to composition components
      <type>/               one folder per game tutorial
        composition.tsx     the composition component
        timeline.ts         scene frame counts + labeled chapters
        styles.css          static style blocks as classes (imported here)
        scenes/             one file per scene
```

## Registering a tutorial

1. Export an ordered **chapter list** from `src/tutorials/<type>/timeline.ts`:
   one `{ label, durationInFrames }` per scene/beat (`TutorialChapter` from
   `src/lib/video.ts`). The labels are public - they become the timestamps in
   the exported `chapters.txt` - so name the game's main parts ("Intro",
   "The goal", "Winning", "The draw", …).
2. Add `{ id, title, chapters }` to `TUTORIAL_MANIFEST` in
   `src/tutorials/manifest.ts`. The `id` must be the game's type-slug
   constant from `@kyzen/shared/constants` (e.g. `TIC_TAC_TOE`). Keep
   this file free of React imports - the export script loads it directly.
3. Map the composition component by id in `COMPONENTS` in
   `src/tutorials/registry.tsx`.

A tutorial's `durationInFrames` is **derived from the chapter sum**, so
chapters can never drift from the video. `root.tsx` turns each entry into a
`<Composition>` at 1920x1080 / 30 fps - do not register compositions anywhere
else or change those dimensions per game.

## Theme - always the app's tokens

Wrap every composition in `<ThemeRoot>` (defaults: the app's `DEFAULT_THEME`,
dark mode). It sets `--d`/`--v` from `THEMES` in `@kyzen/shared/constants`
and `theme.css` derives the same tokens as the web app's `globals.css`.

- Style **only** with the CSS variables: `var(--background)`, `--foreground`,
  `--surface`, `--surface-raised`, `--card`, `--primary`, `--primary-hover`,
  `--primary-foreground`, `--muted-foreground`, `--border`, `--success`,
  `--warning`, `--danger`, `--accent-warm`, `--page-ambient`, the `--banner-*`
  gradient stops, and `--pattern-ink`/`--pattern-opacity`.
- **Never hardcode brand colors.** Neutral one-off alphas (e.g. shadows) are
  fine.
- Fonts: `fontSans` from `src/theme/fonts.ts` (Geist, matching the web app).
  `<ThemeRoot>` already applies it.
- `<PatternBackdrop>` renders the app's tiled doodle backdrop (same mask
  technique as `.app-canvas::before` in `globals.css`); keep it subtle.

## Assets - shared with the web app

`remotion.config.ts` points `publicDir` at `apps/web/public`, so the web app's
static assets are available via `staticFile()` with **no copying**:

- bg music: `staticFile("sounds/<type>-bg.ogg")`
- cover art: `staticFile("games/<type>-cover.png")`
- pattern tiles: `staticFile("patterns/<name>.svg")`

## Background music - required

Every tutorial plays the **game's own bg music** (the track registered in
the game's `meta.backgroundMusic`, file under `apps/web/public/sounds/`).
Render it once at the top of the composition:

```tsx
<TutorialMusic src="sounds/tic-tac-toe-bg.ogg" />
```

`<TutorialMusic>` loops the track for the whole video, fades in (1s) and out
(2s), and defaults its volume to the app's `DEFAULT_MUSIC_VOLUME` so speech-free
tutorials stay pleasant. If a game has no bg track, say so in your report
instead of substituting another game's music.

## Duration and pacing

- **30-90 seconds** total (`MIN_TUTORIAL_SECONDS` / `MAX_TUTORIAL_SECONDS` in
  `src/lib/video.ts`) - as short as the content allows.
- **A scene ends ~1s after its last animation settles**: hold the settled
  frame for about 30 frames (one beat to read it), then the 12-frame
  `SceneShell` fade-out plays and the next scene cuts in. Dead air after the
  hold reads as slow - never pad a scene past it.
- Cover, in order: what the game is (one line), the goal, setup/board, how a
  turn works, how you win (show a concrete example), notable edge cases
  (e.g. draws), and a closing card inviting the viewer to play.
- One idea per scene.

## Motion rules

- Subtle motion graphics, not slideshows: stagger reveals, slide/fade titles,
  animate board pieces placing, draw win-lines with `pathLength`-style
  interpolation, gently scale/parallax backgrounds.
- All motion via `useCurrentFrame()` + `interpolate()`/`spring()` with clamped
  extrapolation, per the remotion-best-practices skill. CSS
  transitions/animations and `motion/react` are **forbidden in Remotion** -
  the repo's framer-motion preference applies to the web app only.
- Lay scenes out with `<Series>`, each wrapped in `<SceneShell>`
  (`src/lib/scene-shell.tsx`), which fades a scene's content out over its
  last 12 frames before a hard cut. **Two scenes' content must never be on
  screen at the same time** - no crossfades between scenes
  (`@remotion/transitions`' `fade()` overlaps outgoing and incoming content).
  The shared backdrop persists across cuts, so the cut reads smooth; scenes
  animate their own content in from an empty frame.
- Prefer `Easing.bezier(0.16, 1, 0.3, 1)` for entrances.
- Icons come from `react-icons` (fa6 first), same as the rest of the repo.

## Repo rules that still apply

- **No comments** in any file (CI gate) - `bun run strip-comments -- --check`.
- Biome formatting/linting - `bun run check` (or `bun run fix`).
- **React Doctor reviews PRs** and warns on inline styles with 8+ properties,
  non-component exports from component files, and `[]`/`{}` default props.
  Put a scene's static style block in the tutorial's `styles.css` as a class
  (keep frame-driven values like `opacity`/`transform` inline), keep helper
  functions/types in non-component modules (e.g. `palette.ts`), and hoist
  array/object default props to module constants.
- No `zod` and no new deps without checking the shared-package rules in
  `CLAUDE.md`; types/constants shared with the app come from
  `@kyzen/shared`.

## Verification (all from `vid-tutorials/`)

```bash
bun run type-check
bunx remotion compositions src/index.ts        # registry sanity: id appears
bun run still <type> out/<type>-still.png --frame=<n>
bun run export                                 # out/<type>/tutorial.mp4 + chapters.txt
```

Render at least one still per scene (pick mid-scene frames) and **look at
them** to verify layout/contrast, then do one full render to confirm audio +
duration. `out/` is untracked scratch space - never commit renders.
