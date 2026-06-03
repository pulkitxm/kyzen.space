

# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Icons

Use `react-icons` for icons instead of hand-writing inline `<svg>`. Prefer Font Awesome 6 (`react-icons/fa6`) first; if it lacks a good match, use another `react-icons` pack (Lucide `react-icons/lu`, or brand logos `react-icons/fc`). Only fall back to a raw inline `<svg>` when no library icon fits — that fallback is allowed. Use `fa6`, not the legacy `fa` (FA5). Generated/decorative SVG (doodle tiles, pattern assets), avatar rendering, and test SVG are not icons and stay as-is.

# Reserved usernames vs. top-level routes

The profile page is a catch-all `/[username]` route, so every top-level segment under `apps/web/app/` is a potential username collision. When you add a new top-level route, add its segment to `RESERVED_USERNAMES` in `apps/server/src/username-rules.ts` if a user claiming that name would shadow the route. Per-user blocklisting is separate — that's the `NOT_ALLOWED_USERNAMES` env var.

# Keep docs and agents in sync

A change is not done until the docs and agents reflect it. In the same change, update the matching `docs/architecture/*` page for subsystem/behavior changes, `docs/adding-a-game.md` + `.claude/agents/game-builder.md` for the game-authoring flow, `docs/games/<type>.md` for a new/changed game, and `CLAUDE.md` + this file for convention changes. Start from `docs/architecture/README.md`.

