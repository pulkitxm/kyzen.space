

# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Icons

Use `react-icons` for icons instead of hand-writing inline `<svg>`. Prefer Font Awesome 6 (`react-icons/fa6`) first; if it lacks a good match, use another `react-icons` pack (Lucide `react-icons/lu`, or brand logos `react-icons/fc`). Only fall back to a raw inline `<svg>` when no library icon fits — that fallback is allowed. Use `fa6`, not the legacy `fa` (FA5). Generated/decorative SVG (doodle tiles, pattern assets), avatar rendering, and test SVG are not icons and stay as-is.

