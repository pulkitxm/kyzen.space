import { seedAvatarConfig, validateAvatarConfig } from "@gamelobby/avatar";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import { games, profiles } from "../../db";
import {
  type ColorMode,
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME,
  isValidColorMode,
  isValidTheme,
  type ThemeId,
} from "../../lib/theme";

const RESERVED = new Set(["api", "auth", "games", "profile", "account"]);
const RECENT_PAGE_SIZE = 5;

function activityRow(g: {
  id: string;
  gameType: string;
  status: string;
  updatedAt: Date | null;
  createdAt: Date | null;
}) {
  const ts = g.updatedAt ?? g.createdAt ?? new Date();
  return {
    id: g.id,
    gameType: g.gameType,
    status: g.status,
    updatedAt: new Date(ts).toISOString(),
  };
}

export const profilesRouter = new Hono()
  .get("/me", async (c) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);

    const profile = await profiles.getProfileByUserId(session.user.id);
    if (!profile) return c.json({ error: "Profile not found" }, 404);

    return c.json({
      profile: {
        userId: profile.userId,
        username: profile.username,
        stats: profile.stats ?? {},
        avatar: profile.avatar ?? seedAvatarConfig(profile.username),
        theme: profile.theme ?? DEFAULT_THEME,
        colorMode: profile.colorMode ?? DEFAULT_COLOR_MODE,
        createdAt: new Date(profile.createdAt).toISOString(),
      },
      user: {
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
      },
    });
  })
  .put("/me/appearance", async (c) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const raw = (body ?? {}) as { theme?: unknown; colorMode?: unknown };
    const patch: { theme?: ThemeId; colorMode?: ColorMode } = {};

    if (raw.theme !== undefined) {
      if (!isValidTheme(raw.theme))
        return c.json({ error: "Invalid theme" }, 400);
      patch.theme = raw.theme;
    }
    if (raw.colorMode !== undefined) {
      if (!isValidColorMode(raw.colorMode))
        return c.json({ error: "Invalid colorMode" }, 400);
      patch.colorMode = raw.colorMode;
    }
    if (patch.theme === undefined && patch.colorMode === undefined)
      return c.json({ error: "Nothing to update" }, 400);

    await profiles.updateAppearance(session.user.id, patch);
    return c.json(patch);
  })
  .put("/me/avatar", async (c) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const avatar = validateAvatarConfig(body);
    if (!avatar) return c.json({ error: "Invalid avatar" }, 400);

    await profiles.updateAvatar(session.user.id, avatar);
    return c.json({ avatar });
  })
  .get("/:username/recent-games", async (c) => {
    const username = c.req.param("username");
    if (RESERVED.has(username.toLowerCase()))
      return c.json({ error: "Not found" }, 404);

    const rawOffset = Number.parseInt(c.req.query("offset") ?? "0", 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const rawLimit = Number.parseInt(
      c.req.query("limit") ?? String(RECENT_PAGE_SIZE),
      10,
    );
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(50, rawLimit)
        : RECENT_PAGE_SIZE;

    const profile = await profiles.getProfileByUsername(username);
    if (!profile) return c.json({ error: "Not found" }, 404);

    const rows = await games.gamesForUser(profile.userId, {
      offset,
      limit: limit + 1,
    });
    const hasMore = rows.length > limit;
    return c.json({
      games: rows.slice(0, limit).map(activityRow),
      hasMore,
    });
  })
  .get("/:username", async (c) => {
    const username = c.req.param("username");
    if (RESERVED.has(username.toLowerCase()))
      return c.json({ error: "Not found" }, 404);

    const profile = await profiles.getProfileByUsername(username);
    if (!profile) return c.json({ error: "Not found" }, 404);

    const [rows, displayName] = await Promise.all([
      games.gamesForUser(profile.userId, { limit: 20 }),
      profiles.getDisplayName(profile.userId),
    ]);
    return c.json({
      profile: {
        userId: profile.userId,
        username: profile.username,
        displayName,
        stats: profile.stats ?? {},
        avatar: profile.avatar ?? seedAvatarConfig(profile.username),
        createdAt: new Date(profile.createdAt).toISOString(),
      },
      games: rows.map(activityRow),
    });
  });
