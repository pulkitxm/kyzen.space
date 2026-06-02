import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AvatarConfig } from "@gamelobby/avatar";
import { randomAvatarConfig, seedAvatarConfig } from "@gamelobby/avatar";

type Session = {
  user: { id: string; name: string | null; email: string | null };
} | null;
type Profile = {
  userId: string;
  username: string;
  stats: Record<string, unknown>;
  avatar: AvatarConfig | null;
  theme: string;
  colorMode: string;
  createdAt: Date;
} | null;

let currentSession: Session = null;
let storedProfile: Profile = null;
const updateAvatarCalls: Array<{ userId: string; avatar: AvatarConfig }> = [];
const updateAppearanceCalls: Array<{
  userId: string;
  patch: { theme?: string; colorMode?: string; pattern?: string };
}> = [];

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: { getSession: async () => currentSession },
  }),
}));

mock.module("../src/db", () => ({
  profiles: {
    getProfileByUserId: async () => storedProfile,
    getProfileByUsername: async () => storedProfile,
    getDisplayName: async () => "Display Name",
    updateAvatar: async (userId: string, avatar: AvatarConfig) => {
      updateAvatarCalls.push({ userId, avatar });
    },
    updateAppearance: async (
      userId: string,
      patch: { theme?: string; colorMode?: string; pattern?: string },
    ) => {
      updateAppearanceCalls.push({ userId, patch });
    },
  },
  games: {
    gamesForUser: async () => [],
  },
}));

const { profilesRouter } = await import("../src/api/routes/profiles");

const VALID_AVATAR = randomAvatarConfig("route-valid");

function makeProfile(
  over: Partial<NonNullable<Profile>> = {},
): NonNullable<Profile> {
  return {
    userId: "user-1",
    username: "tester",
    stats: {},
    avatar: VALID_AVATAR,
    theme: "sangria",
    colorMode: "dark",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...over,
  };
}

function put(body: string | object, contentType = "application/json") {
  return profilesRouter.request("/me/avatar", {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  currentSession = null;
  storedProfile = null;
  updateAvatarCalls.length = 0;
  updateAppearanceCalls.length = 0;
});

function putAppearance(body: string | object) {
  return profilesRouter.request("/me/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("PUT /me/appearance", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await putAppearance({ theme: "sangria" });
    expect(res.status).toBe(401);
    expect(updateAppearanceCalls).toHaveLength(0);
  });

  describe("when authenticated", () => {
    beforeEach(() => {
      currentSession = { user: { id: "user-9", name: "T", email: "t@e.com" } };
    });

    it("returns 400 on malformed JSON", async () => {
      const res = await putAppearance("{ not json");
      expect(res.status).toBe(400);
      expect(updateAppearanceCalls).toHaveLength(0);
    });

    it("rejects an invalid theme", async () => {
      const res = await putAppearance({ theme: "neon" });
      expect(res.status).toBe(400);
      expect(updateAppearanceCalls).toHaveLength(0);
    });

    it("rejects an invalid colorMode", async () => {
      const res = await putAppearance({ colorMode: "sepia" });
      expect(res.status).toBe(400);
      expect(updateAppearanceCalls).toHaveLength(0);
    });

    it("rejects an invalid pattern", async () => {
      const res = await putAppearance({ pattern: "scribbles" });
      expect(res.status).toBe(400);
      expect(updateAppearanceCalls).toHaveLength(0);
    });

    it("persists a valid pattern", async () => {
      const res = await putAppearance({ pattern: "games" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ pattern: "games" });
      expect(updateAppearanceCalls[0]?.patch).toEqual({ pattern: "games" });
    });

    it("returns 400 when nothing is provided", async () => {
      const res = await putAppearance({});
      expect(res.status).toBe(400);
      expect(updateAppearanceCalls).toHaveLength(0);
    });

    it("persists a valid theme with the session user id", async () => {
      const res = await putAppearance({ theme: "midnight-blue" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ theme: "midnight-blue" });
      expect(updateAppearanceCalls).toHaveLength(1);
      expect(updateAppearanceCalls[0]?.userId).toBe("user-9");
      expect(updateAppearanceCalls[0]?.patch).toEqual({
        theme: "midnight-blue",
      });
    });

    it("persists theme and colorMode together", async () => {
      const res = await putAppearance({
        theme: "royal-ember",
        colorMode: "light",
      });
      expect(res.status).toBe(200);
      expect(updateAppearanceCalls[0]?.patch).toEqual({
        theme: "royal-ember",
        colorMode: "light",
      });
    });

    it("ignores a client-supplied userId", async () => {
      await putAppearance({ theme: "sangria", userId: "attacker" });
      expect(updateAppearanceCalls[0]?.userId).toBe("user-9");
    });
  });
});

describe("PUT /me/avatar — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await put(VALID_AVATAR);
    expect(res.status).toBe(401);
    expect(updateAvatarCalls).toHaveLength(0);
  });
});

describe("PUT /me/avatar — payload validation", () => {
  beforeEach(() => {
    currentSession = { user: { id: "user-1", name: "T", email: "t@e.com" } };
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await put("{ not valid json");
    expect(res.status).toBe(400);
    expect(updateAvatarCalls).toHaveLength(0);
  });

  it("returns 400 on a structurally invalid avatar", async () => {
    const res = await put({ ...VALID_AVATAR, top: "mohawk" });
    expect(res.status).toBe(400);
    expect(updateAvatarCalls).toHaveLength(0);
  });

  it("returns 400 on an empty object", async () => {
    const res = await put({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when a color is #-prefixed", async () => {
    const res = await put({
      ...VALID_AVATAR,
      skinColor: `#${VALID_AVATAR.skinColor}`,
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /me/avatar — success", () => {
  beforeEach(() => {
    currentSession = { user: { id: "user-42", name: "T", email: "t@e.com" } };
  });

  it("persists and echoes the validated avatar", async () => {
    const res = await put(VALID_AVATAR);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { avatar: AvatarConfig };
    expect(json.avatar).toEqual(VALID_AVATAR);
  });

  it("calls updateAvatar with the session user id (not a client-supplied id)", async () => {
    await put({ ...VALID_AVATAR, userId: "attacker-controlled" });
    expect(updateAvatarCalls).toHaveLength(1);
    expect(updateAvatarCalls[0]?.userId).toBe("user-42");
  });

  it("strips unknown keys before persisting", async () => {
    await put({ ...VALID_AVATAR, injected: "x" });
    expect(updateAvatarCalls[0]?.avatar).toEqual(VALID_AVATAR);
    expect(updateAvatarCalls[0]?.avatar).not.toHaveProperty("injected");
  });

  it("accepts a valid style and persists it", async () => {
    await put({ ...VALID_AVATAR, style: "feminine" });
    expect(updateAvatarCalls[0]?.avatar.style).toBe("feminine");
  });

  it("coerces an invalid style to 'any'", async () => {
    await put({ ...VALID_AVATAR, style: "nonsense" });
    expect(updateAvatarCalls[0]?.avatar.style).toBe("any");
  });
});

describe("GET /me", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await profilesRouter.request("/me");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user has no profile", async () => {
    currentSession = { user: { id: "user-1", name: "T", email: "t@e.com" } };
    storedProfile = null;
    const res = await profilesRouter.request("/me");
    expect(res.status).toBe(404);
  });

  it("returns the stored avatar when present", async () => {
    currentSession = { user: { id: "user-1", name: "T", email: "t@e.com" } };
    storedProfile = makeProfile({ avatar: VALID_AVATAR });
    const res = await profilesRouter.request("/me");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { profile: { avatar: AvatarConfig } };
    expect(json.profile.avatar).toEqual(VALID_AVATAR);
  });

  it("falls back to a deterministic seed avatar when none is stored", async () => {
    currentSession = { user: { id: "user-1", name: "T", email: "t@e.com" } };
    storedProfile = makeProfile({ username: "lonely", avatar: null });
    const res = await profilesRouter.request("/me");
    const json = (await res.json()) as { profile: { avatar: AvatarConfig } };
    expect(json.profile.avatar).toEqual(seedAvatarConfig("lonely"));
  });
});

describe("GET /:username", () => {
  it("returns 404 for reserved names", async () => {
    for (const name of ["api", "auth", "games", "profile", "account"]) {
      const res = await profilesRouter.request(`/${name}`);
      expect(res.status).toBe(404);
    }
  });

  it("returns 404 when the profile does not exist", async () => {
    storedProfile = null;
    const res = await profilesRouter.request("/ghost");
    expect(res.status).toBe(404);
  });

  it("returns the stored avatar for an existing profile (no auth required)", async () => {
    storedProfile = makeProfile({
      username: "publicuser",
      avatar: VALID_AVATAR,
    });
    const res = await profilesRouter.request("/publicuser");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { profile: { avatar: AvatarConfig } };
    expect(json.profile.avatar).toEqual(VALID_AVATAR);
  });

  it("falls back to a seed avatar when the stored avatar is null", async () => {
    storedProfile = makeProfile({ username: "seeded", avatar: null });
    const res = await profilesRouter.request("/seeded");
    const json = (await res.json()) as { profile: { avatar: AvatarConfig } };
    expect(json.profile.avatar).toEqual(seedAvatarConfig("seeded"));
  });
});
