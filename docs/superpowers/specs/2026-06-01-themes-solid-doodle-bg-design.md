# Themes: 10 solid palettes + better light mode + theme-tinted doodle background

**Date:** 2026-06-01
**Status:** Approved (design)

## Goal

Evolve the existing appearance system (added in #15) along four axes the user asked for:

1. Expand from 4 to **10** color palettes.
2. Make **light mode** look better (cleaner, higher contrast, reliable across all palettes).
3. Use **solid colors only** - remove every gradient.
4. Add a **theme-tinted doodle SVG background** whose background color and line color both follow the active palette and adapt per light/dark mode.

The two-axis model is unchanged: **palette** (`<html data-theme>`) × **color mode** (light/dark/system via `next-themes`). Palette and mode stay independent - colors are resolved per-mode.

## Background (current state)

- Each palette = two hues, `--d` (deep) + `--v` (vivid). All semantic tokens in `apps/web/app/globals.css` derive from those two via `color-mix`.
- Palette ids live in two synced lists: `apps/web/lib/themes.ts` (catalog + picker metadata) and `apps/server/src/lib/theme.ts` (validators). The server list feeds the Postgres `app_theme` pgEnum in `apps/server/src/db/schema.ts`.
- The app background is a **gradient** (`--app-gradient: linear-gradient(...)`) painted on `.app-canvas` (`apps/web/app/app-shell.tsx`) and `body`.
- The picker (`apps/web/app/settings/theme-picker.tsx`) renders each palette as a gradient swatch via `themeGradient()`.
- Persistence: `user_profile.theme` / `user_profile.color_mode` enums; `AppearanceProvider` + `next-themes` (`apps/web/lib/appearance.tsx`).

## Design

### A. Solid colors, no gradients

- Remove `--app-gradient` from both the `html:not(.dark)` and `html.dark` blocks in `globals.css`.
- `.app-canvas` and `body` paint solid `var(--background)` only (drop `background-image`).
- In `theme-picker.tsx`, replace the gradient swatch with a **solid color chip** (filled with the deep color, with a small vivid accent bar/dot).
- Remove the `themeGradient()` helper from `themes.ts` and its test.

### B. Ten palettes

Keep the existing 4 (`sangria`, `crimson-nights`, `midnight-blue`, `royal-ember`). Add 6 new `{ deep, vivid }` solid pairs:

| id        | name   | deep      | vivid     |
|-----------|--------|-----------|-----------|
| forest    | Forest | deep green | lime/green accent |
| violet    | Violet | deep indigo | purple accent |
| slate     | Slate  | graphite  | sky accent |
| amber     | Amber  | espresso  | amber/gold accent |
| rose      | Rose   | wine      | pink accent |
| cyan      | Cyan   | teal-black | cyan accent |

(Exact hexes chosen during implementation for balance/contrast.)

Synced touch points:

- `apps/web/lib/themes.ts`: `THEME_IDS` + `THEMES`.
- `apps/server/src/lib/theme.ts`: `THEME_IDS`.
- `apps/web/app/globals.css`: one `html[data-theme="…"]{ --d; --v }` block per new id.
- **Drizzle migration**: `ALTER TYPE "public"."app_theme" ADD VALUE …` for each new id (additive; default stays `midnight-blue`). Generated via `bun run db:generate`; hand-authored following the existing migration style if generation is unavailable.
- Update `apps/web/tests/themes.test.ts` and `apps/server/tests/theme.test.ts` (counts + drop the gradient assertion).

### C. Better light mode

The current light mode washes every surface with a heavy vivid tint (12–26% mixed into white), which looks muddy and fails contrast for light vivids (lime/cyan/amber). Rework the `html:not(.dark)` token block:

- **Background**: near-white neutral with only a faint (~4%) theme tint.
- **Surfaces / cards**: clean white with crisp `--border`.
- **Foreground**: a dark *neutral* (not the brand deep, which is low-contrast on some palettes) for reliable readability across all 10 palettes.
- **Primary / accent**: keep `--v`, but darken light vivids (`color-mix(var(--v), black)`) so white-on-primary text always passes contrast.

### D. Theme-tinted doodle background (both modes)

- Ship one **seamless doodle SVG** at `apps/web/public/patterns/doodles.svg` (sourced CC0/MIT, or generated fallback - see Risk).
- Render it as a fixed, behind-content layer via `.app-canvas::before`, tinted with a CSS `mask` so the asset's own colors are irrelevant - the line color comes entirely from a theme token:

  ```css
  .app-canvas::before {
    content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-color: var(--pattern-ink);
    -webkit-mask: url(/patterns/doodles.svg) repeat; mask: url(/patterns/doodles.svg) repeat;
    -webkit-mask-size: 360px; mask-size: 360px;
    opacity: var(--pattern-opacity);
  }
  ```

- `--pattern-ink` / `--pattern-opacity` are **per-mode, per-theme tokens**. Solid `--background` (deep in dark, near-white in light) sits underneath; the doodle lines are a subtle `--v`-derived tint. So both bg color and line color follow the palette, and light vs dark get distinct, subtle treatments (very subtle in dark, even subtler in light) - matching the reference.
- `.app-canvas` gets `isolation: isolate` (or its content wrapper gets `position: relative; z-index: 1`) so the sidebar/main stay above the pattern.

### Out of scope

- No new DB columns (reuses `app_theme` / `color_mode`).
- No change to the two-axis model, persistence flow, or boot-script approach.
- No unrelated refactors.

## Risks

- **Doodle asset licensing/tiling**: the pattern must be seamlessly tileable and freely licensed (CC0/MIT). If no clean exact-match doodle tile is found, fall back to a generated scatter of simple playful primitives (circles, crosses, squiggles, triangles) - still doodle-flavored and theme-tinted, just not the exact icon set. The chosen approach will be noted in the implementation.
- **Enum migration**: `ALTER TYPE … ADD VALUE` is additive and safe; existing rows keep their values. No down-migration for enum value removal is provided (Postgres doesn't support it cleanly), consistent with the project's forward-only migrations.

## Verification

- `bun run typecheck`, `bun run test` (web + server theme tests pass with new counts).
- `bun run check` (formatting).
- Manual: each of the 10 palettes renders solid bg + tinted doodles in both light and dark; no gradients remain; light mode is legible across all palettes.
