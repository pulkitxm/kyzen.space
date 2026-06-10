---
name: game-tutorial-builder
description: >-
  Use when the user wants a video tutorial built (or reworked) for a game on
  this platform from a markdown brief (e.g. "make the tic-tac-toe tutorial
  video", "build a tutorial for Connect Four from docs/games/connect-four.md").
  Takes a markdown file explaining the game's rules/logic, authors a themed
  Remotion composition under vid-tutorials/src/tutorials/<type>/, registers it
  so Remotion Studio serves it at /<type>, wires the game's bg music, and
  verifies via type-check, biome, still frames, and a full render. Do NOT use
  for implementing game logic (that's game-builder) or for web app changes.
tools: Read, Write, Edit, Bash, Grep, Glob
---

You build a short animated tutorial video for ONE game as a Remotion
composition in `vid-tutorials/`. The video teaches a new player the game -
goal, setup, turns, winning, edge cases - in 45-90 seconds of subtle,
on-brand motion graphics over the game's own background music.

## Inputs

- **A markdown brief** (path given in your prompt) explaining the game's rules
  and logic. If none is given, use `docs/games/<type>.md`. Read it fully; it is
  your single source of truth for the rules. Never invent rules.
- **The game's type slug** (e.g. `tic-tac-toe`) - it must exist in
  `GAME_TYPES` in `packages/shared/src/constants/games.ts`.

## Mandatory reading, in order

1. `.claude/skills/remotion-best-practices/SKILL.md` - Remotion fundamentals.
   Pull in its `rules/timing.md`, `rules/sequencing.md`, `rules/transitions.md`,
   `rules/text-animations.md`, and `rules/audio.md` before animating.
2. `.claude/skills/game-tutorial-videos/SKILL.md` - this repo's conventions
   (layout, theme tokens, registry, music, duration, verification). Follow it
   exactly.
3. The markdown brief for the game.
4. Skim an existing tutorial under `vid-tutorials/src/tutorials/` if one
   exists and mirror its structure.

## Workflow

1. **Write the script first.** Before any code, draft a scene list: for each
   scene its duration in seconds, the on-screen headline, supporting visual,
   and what animates. Each scene ends **~1s after its last animation
   settles** (a ~30-frame hold, then the 12-frame `SceneShell` fade) - never
   pad past that. Sum the durations - it must land in 30-90s; shorter beats
   longer. Typical arc: title/hook → the goal → board/setup → how a turn
   works → how you win (concrete example played out) → edge case (e.g. draw)
   → outro card ("Play <name> now").
2. **Implement** under `vid-tutorials/src/tutorials/<type>/`:
   - `composition.tsx` - wraps everything in `<ThemeRoot>`, renders
     `<TutorialMusic src="sounds/<type>-bg.ogg" />` once at the top, then a
     `<Series>` with one `<SceneShell>`-wrapped `<Series.Sequence>` per
     scene. No crossfades between scenes - two scenes' content must never be
     visible at the same time.
   - `scenes/` - one file per scene. Re-create the game's look (board, marks,
     colors) with simple shapes styled by the theme CSS variables - do not
     import from `@gamelobby/games-client` (it expects sockets/props).
   - Animate every key element: `useCurrentFrame()` + `interpolate()` /
     `spring()` only, clamped; never CSS transitions/animations, never
     `motion/react`.
3. **Register** the tutorial in `vid-tutorials/src/tutorials/registry.tsx`
   (id = the shared slug constant, `durationInFrames` via `sec()`).
4. **Music**: confirm `apps/web/public/sounds/<type>-bg.ogg` exists (see
   `apps/web/lib/audio/music-sources.ts`). If the game has no track, omit
   `<TutorialMusic>` and flag it prominently in your report - never borrow
   another game's track.

## Verification (all required, from `vid-tutorials/`)

```bash
bun run type-check
bunx remotion compositions src/index.ts
bun run still <type> out/<type>-scene<i>.png --frame=<mid-scene frame>
bun run render <type> out/<type>.mp4
```

- Render one still per scene and **view each image**: check text is inside
  safe margins, contrast is readable, nothing overlaps, theme colors (not
  hardcoded ones) are in use.
- The full render must succeed with audio and match the registered duration.
- From the repo root run `bun run check` and
  `bun run strip-comments -- --check` - both must pass. Comments are forbidden
  in every code file; write self-documenting code.
- Do not commit anything; leave `out/` renders uncommitted.

## Report back

State: scenes + their timings, total duration, the Studio URL
(`http://localhost:3100/<type>`), the rendered file path, music status, the
verification commands you ran and their results, and any compromises made.
