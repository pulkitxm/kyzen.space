

# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Icons

Use `react-icons` for icons instead of hand-writing inline `<svg>`. Prefer Font Awesome 6 (`react-icons/fa6`) first; if it lacks a good match, use another `react-icons` pack (Lucide `react-icons/lu`, or brand logos `react-icons/fc`). Only fall back to a raw inline `<svg>` when no library icon fits - that fallback is allowed. Use `fa6`, not the legacy `fa` (FA5). Generated/decorative SVG (doodle tiles, pattern assets), avatar rendering, and test SVG are not icons and stay as-is.

# Shared packages: one home for types, schemas, and constants

`@kyzen/shared` is the single source of truth for **every TypeScript type, every Zod schema, and every shared constant**, and is the **only** package allowed to depend on `zod`.

- Import types, Zod schemas, and `z` itself from `@kyzen/shared/types`; import shared constant values from `@kyzen/shared/constants`. Never `import … from "zod"` outside `packages/shared`, and never add `zod` to another `package.json`.
- A new shared type or schema goes under `@kyzen/shared/types` (`chat/`, `games/`, `db/`, or a top-level module). A new shared constant goes in `@kyzen/shared/constants`.
- The Drizzle schema and all DB repositories live in `@kyzen/database`; repositories validate inputs with `@kyzen/shared/types` schemas. `apps/web` must never import `@kyzen/database`.
- `@kyzen/avatar` is the one exception: it owns its own types and stays `zod`-free (`@kyzen/shared` re-exports `AvatarConfig`).
- Never duplicate a type, schema, or constant across web and server - put it in `@kyzen/shared`.

See `docs/architecture/shared.md` and the "Shared packages - strict rules" section of `CLAUDE.md`.

# Reserved usernames vs. top-level routes

The profile page is a dynamic `/[username]` route, so every top-level segment under `apps/web/app/` is a potential username collision. When you add a new top-level route, add its segment to `RESERVED_USERNAMES` in `@kyzen/shared/constants` (`packages/shared/src/constants/username.ts`) if a user claiming that name would shadow the route. Per-user blocklisting is separate - that's the `NOT_ALLOWED_USERNAMES` env var (parsed in `apps/server/src/env.ts`).

# Game video tutorials

`vid-tutorials/` is a Remotion workspace with one tutorial composition per game; the composition id is the game's type slug (Studio at `localhost:3100/<type>`). Videos must use the app's theme tokens (`<ThemeRoot>` + `src/theme/theme.css`, seeded from `@kyzen/shared/constants`) and the game's own bg music (`<TutorialMusic>`; `publicDir` is `apps/web/public`). Build tutorials with the `game-tutorial-builder` agent from a markdown rules brief (canonically `docs/games/<type>.md`); conventions are in the `game-tutorial-videos` skill. Inside Remotion, animate only with `useCurrentFrame()` + `interpolate()`/`spring()` - CSS animations/transitions and `motion/react` are forbidden there. See `docs/video-tutorials.md`.

# Keep docs and agents in sync

A change is not done until the docs and agents reflect it. In the same change, update the matching `docs/architecture/*` page for subsystem/behavior changes (including `docs/architecture/shared.md` and `docs/architecture/database.md` for package-boundary changes), `docs/adding-a-game.md` + `.claude/agents/game-builder.md` for the game-authoring flow, `docs/games/<type>.md` for a new/changed game, `docs/video-tutorials.md` + the `game-tutorial-videos` skill + `.claude/agents/game-tutorial-builder.md` for the tutorial-video flow, and `CLAUDE.md` + this file for convention changes. Start from `docs/architecture/README.md`.

