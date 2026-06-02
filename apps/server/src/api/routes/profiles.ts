import { seedAvatarConfig, validateAvatarConfig } from "@gamelobby/avatar";
import { Hono } from "hono";
import { games, profiles } from "../../db";
import { validateChatModePref } from "../../lib/chat-layout";
import {
  DEFAULT_PATTERN,
  isValidPattern,
  type PatternId,
} from "../../lib/pattern";
import {
  type ColorMode,
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME,
  isValidColorMode,
  isValidTheme,
  type ThemeId,
} from "../../lib/theme";
import { readJson } from "../auth-context";
import { type AuthEnv, requireAuth } from "../middleware/auth";

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

export const profilesRouter = new Hono<AuthEnv>()
  .get("/me", requireAuth, async (c) => {
    const user = c.get("user");

    const profile = await profiles.getProfileByUserId(user.id);
    if (!profile) return c.json({ error: "Profile not found" }, 404);

    return c.json({
      profile: {
        userId: profile.userId,
        username: profile.username,
        stats: profile.stats ?? {},
        avatar: profile.avatar ?? seedAvatarConfig(profile.username),
        theme: profile.theme ?? DEFAULT_THEME,
        colorMode: profile.colorMode ?? DEFAULT_COLOR_MODE,
        pattern: profile.pattern ?? DEFAULT_PATTERN,
        chatLayout: profile.chatLayout ?? null,
        createdAt: new Date(profile.createdAt).toISOString(),
      },
      user: {
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
      },
    });
  })

  .put("/me/appearance", requireAuth, async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const raw = (body ?? {}) as {
      theme?: unknown;
      colorMode?: unknown;
      pattern?: unknown;
    };
    const patch: {
      theme?: ThemeId;
      colorMode?: ColorMode;
      pattern?: PatternId;
    } = {};

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
    if (raw.pattern !== undefined) {
      if (!isValidPattern(raw.pattern))
        return c.json({ error: "Invalid pattern" }, 400);
      patch.pattern = raw.pattern;
    }
    if (
      patch.theme === undefined &&
      patch.colorMode === undefined &&
      patch.pattern === undefined
    )
      return c.json({ error: "Nothing to update" }, 400);

    await profiles.updateAppearance(userId, patch);
    return c.json(patch);
  })

  .put("/me/chat-layout", requireAuth, async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const pref = validateChatModePref(body);
    if (!pref) return c.json({ error: "Invalid layout" }, 400);

    await profiles.updateChatLayout(userId, pref);
    return c.json(pref);
  })

  .put("/me/avatar", requireAuth, async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const avatar = validateAvatarConfig(body);
    if (!avatar) return c.json({ error: "Invalid avatar" }, 400);

    await profiles.updateAvatar(userId, avatar);
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
