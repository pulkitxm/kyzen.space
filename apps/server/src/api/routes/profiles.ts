import { seedAvatarConfig, validateAvatarConfig } from "@kyzen/avatar";
import { games, profiles } from "@kyzen/database";
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_GLASS_MODE,
  DEFAULT_PATTERN,
  DEFAULT_THEME,
  DISPLAY_NAME_MAX_LENGTH,
} from "@kyzen/shared/constants";
import {
  type ColorMode,
  type GlassMode,
  isReservedUsername,
  isValidColorMode,
  isValidGlassMode,
  isValidPattern,
  isValidTheme,
  isValidUsernameFormat,
  normalizeUsername,
  type PatternId,
  type ThemeId,
  validateChatModePref,
} from "@kyzen/shared/types";
import { Hono } from "hono";
import { env } from "../../env";
import {
  ensureUsernameForUser,
  isUsernameBlocked,
  suggestUsernames,
} from "../../username";
import { usernameEditableAt } from "../../username-rules";
import { readJson } from "../auth-context";
import { type AuthEnv, requireAuth } from "../middleware/auth";

const RECENT_PAGE_SIZE = 5;

type UnavailableReason = "format" | "reserved" | "taken";

async function usernameUnavailableReason(
  normalized: string,
): Promise<UnavailableReason | null> {
  if (!isValidUsernameFormat(normalized)) return "format";
  if (isUsernameBlocked(normalized)) return "reserved";
  if (await profiles.isUsernameTaken(normalized)) return "taken";
  return null;
}

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

    let profile = await profiles.getProfileByUserId(user.id);
    if (!profile) {
      const isAnon = (user as { isAnonymous?: boolean }).isAnonymous === true;
      await ensureUsernameForUser(user.id, user.name, {
        skipGenderDetection: isAnon,
      });
      profile = await profiles.getProfileByUserId(user.id);
    }
    if (!profile) return c.json({ error: "Profile not found" }, 404);

    const editableAt = usernameEditableAt(
      profile.usernameChangedAt ?? null,
      env.usernameChangeCooldownDays,
      new Date(),
    );

    return c.json({
      profile: {
        userId: profile.userId,
        username: profile.username,
        stats: profile.stats ?? {},
        avatar: profile.avatar ?? seedAvatarConfig(profile.username),
        theme: profile.theme ?? DEFAULT_THEME,
        colorMode: profile.colorMode ?? DEFAULT_COLOR_MODE,
        pattern: profile.pattern ?? DEFAULT_PATTERN,
        glass: profile.glass ?? DEFAULT_GLASS_MODE,
        chatLayout: profile.chatLayout ?? null,
        usernameEditableAt: editableAt ? editableAt.toISOString() : null,
        usernameChangeCooldownDays: env.usernameChangeCooldownDays,
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
      glass?: unknown;
    };
    const patch: {
      theme?: ThemeId;
      colorMode?: ColorMode;
      pattern?: PatternId;
      glass?: GlassMode;
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
    if (raw.glass !== undefined) {
      if (!isValidGlassMode(raw.glass))
        return c.json({ error: "Invalid glass" }, 400);
      patch.glass = raw.glass;
    }
    if (
      patch.theme === undefined &&
      patch.colorMode === undefined &&
      patch.pattern === undefined &&
      patch.glass === undefined
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

  .put("/me/name", requireAuth, async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const raw = (body ?? {}) as { name?: unknown };
    if (typeof raw.name !== "string")
      return c.json({ error: "Invalid name" }, 400);
    const name = raw.name.trim();
    if (name.length < 1 || name.length > DISPLAY_NAME_MAX_LENGTH)
      return c.json({ error: "Invalid name" }, 400);

    await profiles.setDisplayName(userId, name);
    return c.json({ name });
  })

  .get("/me/username-available", requireAuth, async (c) => {
    const userId = c.get("userId");
    const normalized = normalizeUsername(c.req.query("u") ?? "");
    const profile = await profiles.getProfileByUserId(userId);

    if (profile && normalized === profile.username.toLowerCase())
      return c.json({ available: true });

    const reason = await usernameUnavailableReason(normalized);
    if (!reason) return c.json({ available: true });

    const suggestions = await suggestUsernames(normalized || "player");
    return c.json({ available: false, reason, suggestions });
  })

  .put("/me/username", requireAuth, async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const raw = (body ?? {}) as { username?: unknown };
    if (typeof raw.username !== "string")
      return c.json({ error: "Invalid username" }, 400);
    const normalized = normalizeUsername(raw.username);

    const profile = await profiles.getProfileByUserId(userId);
    if (!profile) return c.json({ error: "Profile not found" }, 404);
    if (normalized === profile.username.toLowerCase())
      return c.json({ username: profile.username });

    if (!isValidUsernameFormat(normalized))
      return c.json({ error: "Invalid username" }, 400);
    if (isUsernameBlocked(normalized))
      return c.json({ error: "Username not available" }, 400);

    const editableAt = usernameEditableAt(
      profile.usernameChangedAt ?? null,
      env.usernameChangeCooldownDays,
      new Date(),
    );
    if (editableAt)
      return c.json(
        {
          error: "Username changed too recently",
          nextChangeAt: editableAt.toISOString(),
        },
        429,
      );

    if (await profiles.isUsernameTaken(normalized))
      return c.json({ error: "Username taken" }, 409);

    await profiles.updateUsername(userId, normalized);
    return c.json({ username: normalized });
  })

  .get("/:username/recent-games", async (c) => {
    const username = c.req.param("username");
    if (isReservedUsername(username.toLowerCase()))
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
    if (isReservedUsername(username.toLowerCase()))
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
