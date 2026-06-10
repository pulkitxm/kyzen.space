# Liquid Glass appearance mode - design

Date: 2026-06-10
Status: approved (brainstormed interactively with live browser samples; fidelity, tints, and architecture each user-validated)

## What

An optional **Liquid Glass** appearance mode for the whole platform: an Apple-grade glass material applied to the app's surfaces wherever possible. Off by default, enabled from a new **Glass** tab in Settings → Appearance, persisted exactly like the existing appearance axes (palette, color mode, pattern).

Reference: [Aave - Building glass for the web](https://aave.com/design/building-glass-for-the-web).

## User-validated decisions

1. **Fidelity** - full liquid glass, not flat "glassmorphism" frost:
   - near-clear center (light blur only); the optical work happens in a bezel ring
   - real edge **refraction** via SVG displacement maps (Chromium-only progressive enhancement)
   - subtle **chromatic aberration** at the rim (per-channel displacement scales)
   - **specular rim lights**: bright arc top-left, softer arc bottom-right (offset inset shadows), plus faint inner shine
   - **saturation/brightness lift** behind the pane (`saturate(170%) brightness(1.05)`)
   - layered **depth shadows** (wide soft drop + tight contact shadow)
   - **gel pressure**: press compresses the pane (`scale(.96-.97)`, springy overshoot release via `cubic-bezier(0.34, 1.8, 0.5, 1)`, background brightens while pressed)
2. **Material character: mixed, per-surface** (Apple's own approach) - "Clear" (near-transparent, `blur(2px)`) for floating controls, "Regular" (frostier body, `blur(8-12px)`, same liquid edges) for content surfaces that hold text.
3. **Setting shape** - a third Appearance tab **Glass** offering modes, not just a switch:
   - `off` (default - app unchanged)
   - `neutral` (default material when enabled)
   - `tinted` (glass picks up the active palette's vivid hue from `--v`)
   - `smoke` (dark glass that dims content behind it)
4. **Architecture: hybrid CSS + lens layer** (chosen over CSS-only and over running every surface through lens components).

## Architecture

### Axis model (follows palette/pattern precedent exactly)

- `packages/shared/src/constants/glass.ts`: `GLASS_MODES = ["off", "neutral", "tinted", "smoke"]`, `DEFAULT_GLASS_MODE = "off"`, `GLASS_MODE_DEFS` (id/name/blurb catalog for the picker), `GLASS_STORAGE_KEY = "gl-glass"`.
- `packages/shared/src/types/glass.ts`: `glassModeSchema = z.enum(GLASS_MODES)`, `GlassMode`, `isValidGlassMode`. `appearancePatchSchema` (`types/db/io.ts`) gains optional `glass`.
- DB: `pgEnum("glass_mode", GLASS_MODES)`, `glass` column on `user_profile` (not null, default `off`), Drizzle migration. Profile row type in shared gains `glass`; drift-guard keeps them aligned.
- Server: `GET /api/profiles/me` returns `glass`; `PUT /api/profiles/me/appearance` validates it with `isValidGlassMode`.
- Web: `data-glass="neutral|tinted|smoke"` on `<html>` (attribute absent when off), `GLASS_BOOT_SCRIPT` (localStorage, FOUC-free), `AppearanceProvider` gains `useGlassMode()` with the same dual persistence (localStorage + PUT when signed in; server wins for signed-in users).

### Layer 1 - CSS material (all browsers)

In `globals.css`, scoped under `html[data-glass]`:

- Glass material variables (`--glass-bg`, `--glass-rim-hi`, `--glass-rim-lo`, `--glass-shine`, `--glass-blur`, …) with light/dark values; `html[data-glass="tinted"]` derives them from the palette (`--v`) via `color-mix`; `html[data-glass="smoke"]` uses dark bases.
- One component class applied statically to the popup surfaces (a no-op while `data-glass` is absent):
  - `.glass-pane` - the glass material: translucent bg, `backdrop-filter: blur(…) saturate(170%) brightness(1.05)`, rim-light inset shadows, inner shine, depth shadows.
- `.glass-press` - gel pressure states for interactive glass.
- `@media (prefers-reduced-transparency: reduce)` - forces solid surfaces even when enabled.
- `@supports not (backdrop-filter: blur(1px))` - raises bg alpha to near-solid so text stays readable.

### Layer 2 - refraction lens (Chromium-only enhancement)

`apps/web/components/glass/` (client-only):

- a feature gate (Chromium UA + backdrop-filter support, plus `data-glass` present);
- displacement-map generation (rounded-rect SDF, smoothstep bezel profile, curvature exponent - the parameters validated in the brainstorm demos), rendered to canvas, cached as data-URI per size bucket;
- one shared hidden `<svg>` holding one `<filter>` per unique size bucket: `feImage` map → three `feDisplacementMap`s at staggered scales (R/G/B) → channel-isolating `feColorMatrix`es → additive `feComposite` (chromatic aberration);
- a `useLiquidLens` hook / `LiquidGlass` wrapper that measures its element (ResizeObserver, sizes bucketed to 8px), then sets `backdrop-filter: url(#lens-…) blur(2px) saturate(170%) brightness(1.05)` inline.
- Applied to a bounded set of floating surfaces only: popovers, layered popups (modals), notifications popover, profile popup, game-settings gear cluster, chat popout. Buttons and large fixed panes rely on Layer 1 (refraction on tiny elements is imperceptible; large always-on panes would multiply GPU-resident filters).
- Safari/Firefox: the gate never engages; Layer 1 renders. (Also sidesteps Safari's SVG-filter caching and video-compositing quirks documented in the Aave article.)

### Settings UI

- `appearance-tabs.tsx` gains a **Glass** tab (`FaDroplet`, fa6).
- `apps/web/app/settings/appearance/glass/page.tsx` + `glass-picker.tsx`: mode cards (Off / Neutral / Tinted / Smoke) following the theme-picker pattern - hover/focus live-preview by setting `data-glass` directly, click to commit, restore on leave; a live preview pane sits above the grid so the material is visible over the user's actual theme + doodles.

### Surface mapping (revised: all popups)

Scope settled on **every popup surface**, delivered through shared building blocks (`GlassPane` / `GlassMotionPane` / `useGlassPaneRef` in `components/glass/glass-pane.tsx`) so new popups get glass by construction. The sidebar was tried and reverted: the side-by-side layout means nothing passes behind it, so the material never reads as glass there.

- Glass (`.glass-pane` + lens): the shared popover wrapper (all popovers, incl. notifications), layered-popup dialogs (all stacked modals), the profile popup, the two chat dialogs (new group, group settings), the game-over overlay, the conversation picker, the guest nudge, the account-identity confirm dialog, the avatar editor (sheet + confirm), the chat game-launcher menu, and the composer emoji/GIF picker.
- Scrims (`.glass-scrim`): popup overlays lighten from `bg-black/40-60` to 25% black while glass is on.
- Pressure (`.glass-press`): the shared `Button` carries the class, but the CSS only activates it inside a `.glass-pane`, so press physics exist solely within glass popups.
- Unchanged: the sidebar, game lobby cards, settings cards, standalone buttons, the game-settings gear, the chat-popout controls pill, text inputs, game-board internals in `games-client`, generated art/avatars.

## Data flow

Boot: SSR sets `data-glass` from the profile (signed-in) → boot script re-applies from localStorage pre-hydration (anonymous/FOUC) → provider reconciles (server wins signed-in, localStorage wins anonymous) → `setGlass` writes localStorage + `PUT /me/appearance`.

## Error handling

- Non-Chromium → CSS layer only, silently.
- No backdrop-filter at all → near-solid fallback backgrounds.
- `prefers-reduced-transparency` → solid surfaces.
- Lens map generation failures → catch, skip refraction (CSS layer remains).
- API persist failures → `console.warn`, local state still applies (matches existing `persistAppearance`).

## Testing

- `packages/shared/tests/glass.test.ts` - id/validator round-trip, default membership (mirrors `theme.test.ts`).
- `apps/web/tests/glass.test.ts` - catalog bijection, boot script contains key + every id (mirrors `themes.test.ts`).
- `apps/server/tests/profiles-route.test.ts` - PUT accepts valid `glass`, rejects junk; GET returns it.
- Lens unit tests: displacement-map generator (dimensions, neutral center, zero displacement outside the rounded rect, symmetry), size bucketing/cache.
- Existing drift-guard asserts the new column matches the shared row type.

## Docs to sync (same change)

`docs/architecture/web.md` (new appearance axis + glass layers), `docs/architecture/shared.md` (new constants/types), `docs/architecture/database.md` (enum + column), `CLAUDE.md`/`AGENTS.md` constants enumerations.
