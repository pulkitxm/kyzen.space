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
  usernameChangedAt: Date | null;
  createdAt: Date;
} | null;

let currentSession: Session = null;
let storedProfile: Profile = null;
let usernameTaken = false;
let blockedUsernames = new Set<string>();
let suggestions: string[] = ["alt_1", "alt_2"];
let cooldownDays = 30;
let createProfileShouldThrow = false;
const updateAvatarCalls: Array<{ userId: string; avatar: AvatarConfig }> = [];
const updateAppearanceCalls: Array<{
  userId: string;
  patch: { theme?: string; colorMode?: string; pattern?: string };
}> = [];
const setDisplayNameCalls: Array<{ userId: string; name: string }> = [];
const updateUsernameCalls: Array<{ userId: string; username: string }> = [];

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: { getSession: async () => currentSession },
  }),
}));

mock.module("@gamelobby/database", () => ({
  profiles: {
    getProfileByUserId: async () => storedProfile,
    getProfileByUsername: async () => storedProfile,
    getDisplayName: async () => "Display Name",
    isUsernameTaken: async () => usernameTaken,
    getTakenUsernames: async (_usernames: string[]) => new Set<string>(),
    createProfile: async (input: {
      userId: string;
      username: string;
      avatar?: AvatarConfig | null;
    }) => {
      if (createProfileShouldThrow) {
        throw new Error("Failed to create profile");
      }
      storedProfile = makeProfile({
        userId: input.userId,
        username: input.username,
        avatar: input.avatar ?? null,
      });
      return storedProfile;
    },
    updateAvatar: async (userId: string, avatar: AvatarConfig) => {
      updateAvatarCalls.push({ userId, avatar });
    },
    updateAppearance: async (
      userId: string,
      patch: { theme?: string; colorMode?: string; pattern?: string },
    ) => {
      updateAppearanceCalls.push({ userId, patch });
    },
    setDisplayName: async (userId: string, name: string) => {
      setDisplayNameCalls.push({ userId, name });
    },
    updateUsername: async (userId: string, username: string) => {
      updateUsernameCalls.push({ userId, username });
    },
  },
  games: {
    gamesForUser: async () => [],
  },
}));

mock.module("../src/env", () => ({
  env: {
    get usernameChangeCooldownDays() {
      return cooldownDays;
    },
    notAllowedUsernames: [] as string[],
  },
}));

mock.module("../src/username", () => ({
  isUsernameBlocked: (normalized: string) => blockedUsernames.has(normalized),
  suggestUsernames: async () => suggestions,
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
    usernameChangedAt: null,
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
  usernameTaken = false;
  blockedUsernames = new Set<string>();
  suggestions = ["alt_1", "alt_2"];
  cooldownDays = 30;
  createProfileShouldThrow = false;
  updateAvatarCalls.length = 0;
  updateAppearanceCalls.length = 0;
  setDisplayNameCalls.length = 0;
  updateUsernameCalls.length = 0;
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

  it("returns 404 when the user has no profile and provisioning fails", async () => {
    currentSession = { user: { id: "user-1", name: "T", email: "t@e.com" } };
    storedProfile = null;
    createProfileShouldThrow = true;
    const res = await profilesRouter.request("/me");
    expect(res.status).toBe(404);
  });

  it("lazy-provisions a profile when the user has no profile and provisioning succeeds", async () => {
    currentSession = { user: { id: "user-1", name: "T", email: "t@e.com" } };
    storedProfile = null;
    const res = await profilesRouter.request("/me");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { profile: { username: string } };
    expect(json.profile.username).toBeDefined();
    expect(storedProfile).not.toBeNull();
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

function authed(userId = "user-1", over: Partial<NonNullable<Profile>> = {}) {
  currentSession = { user: { id: userId, name: "T", email: "t@e.com" } };
  storedProfile = makeProfile({ userId, ...over });
}

function getAvailable(u: string) {
  return profilesRouter.request(
    `/me/username-available?u=${encodeURIComponent(u)}`,
  );
}

function putUsername(body: object) {
  return profilesRouter.request("/me/username", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putName(body: object) {
  return profilesRouter.request("/me/name", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /me — usernameEditableAt", () => {
  it("is null when the username was never changed", async () => {
    authed("user-1", { usernameChangedAt: null });
    const res = await profilesRouter.request("/me");
    const json = (await res.json()) as {
      profile: { usernameEditableAt: string | null };
    };
    expect(json.profile.usernameEditableAt).toBeNull();
  });

  it("is a future ISO date while inside the cooldown", async () => {
    cooldownDays = 30;
    authed("user-1", { usernameChangedAt: new Date(Date.now() - 86_400_000) });
    const res = await profilesRouter.request("/me");
    const json = (await res.json()) as {
      profile: { usernameEditableAt: string | null };
    };
    expect(typeof json.profile.usernameEditableAt).toBe("string");
    expect(
      new Date(json.profile.usernameEditableAt as string).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it("exposes the configured cooldown window", async () => {
    cooldownDays = 14;
    authed();
    const res = await profilesRouter.request("/me");
    const json = (await res.json()) as {
      profile: { usernameChangeCooldownDays: number };
    };
    expect(json.profile.usernameChangeCooldownDays).toBe(14);
  });
});

describe("GET /me/username-available", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await getAvailable("freebie");
    expect(res.status).toBe(401);
  });

  it("reports an available name", async () => {
    authed();
    const res = await getAvailable("freebie");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true });
  });

  it("treats the caller's current username as available", async () => {
    authed("user-1", { username: "tester" });
    usernameTaken = true;
    const res = await getAvailable("TESTER");
    expect(await res.json()).toEqual({ available: true });
  });

  it("reports a format failure with suggestions", async () => {
    authed();
    const res = await getAvailable("ab");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      available: boolean;
      reason: string;
      suggestions: string[];
    };
    expect(json.available).toBe(false);
    expect(json.reason).toBe("format");
    expect(json.suggestions).toEqual(["alt_1", "alt_2"]);
  });

  it("reports a reserved/blocked name", async () => {
    authed();
    blockedUsernames = new Set(["blockedname"]);
    const res = await getAvailable("blockedname");
    const json = (await res.json()) as { available: boolean; reason: string };
    expect(json.available).toBe(false);
    expect(json.reason).toBe("reserved");
  });

  it("reports a taken name with suggestions", async () => {
    authed();
    usernameTaken = true;
    const res = await getAvailable("popular");
    const json = (await res.json()) as {
      available: boolean;
      reason: string;
      suggestions: string[];
    };
    expect(json.available).toBe(false);
    expect(json.reason).toBe("taken");
    expect(json.suggestions.length).toBeGreaterThan(0);
  });
});

describe("PUT /me/username", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await putUsername({ username: "newname" });
    expect(res.status).toBe(401);
    expect(updateUsernameCalls).toHaveLength(0);
  });

  it("rejects an invalid format with 400", async () => {
    authed();
    const res = await putUsername({ username: "ab" });
    expect(res.status).toBe(400);
    expect(updateUsernameCalls).toHaveLength(0);
  });

  it("rejects a blocked name with 400", async () => {
    authed();
    blockedUsernames = new Set(["blockedname"]);
    const res = await putUsername({ username: "blockedname" });
    expect(res.status).toBe(400);
    expect(updateUsernameCalls).toHaveLength(0);
  });

  it("rejects with 429 while inside the cooldown", async () => {
    cooldownDays = 30;
    authed("user-1", {
      username: "tester",
      usernameChangedAt: new Date(Date.now() - 86_400_000),
    });
    const res = await putUsername({ username: "freshname" });
    expect(res.status).toBe(429);
    const json = (await res.json()) as { nextChangeAt: string };
    expect(typeof json.nextChangeAt).toBe("string");
    expect(updateUsernameCalls).toHaveLength(0);
  });

  it("rejects a taken name with 409", async () => {
    authed();
    usernameTaken = true;
    const res = await putUsername({ username: "freshname" });
    expect(res.status).toBe(409);
    expect(updateUsernameCalls).toHaveLength(0);
  });

  it("persists a valid, free name lowercased with the session user id", async () => {
    authed("user-42", { username: "tester" });
    const res = await putUsername({ username: "NewName" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "newname" });
    expect(updateUsernameCalls).toHaveLength(1);
    expect(updateUsernameCalls[0]).toEqual({
      userId: "user-42",
      username: "newname",
    });
  });

  it("is a no-op when the name matches the current username", async () => {
    authed("user-1", { username: "tester" });
    const res = await putUsername({ username: "Tester" });
    expect(res.status).toBe(200);
    expect(updateUsernameCalls).toHaveLength(0);
  });
});

describe("PUT /me/name", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await putName({ name: "Alice" });
    expect(res.status).toBe(401);
    expect(setDisplayNameCalls).toHaveLength(0);
  });

  it("rejects an empty name with 400", async () => {
    authed();
    const res = await putName({ name: "   " });
    expect(res.status).toBe(400);
    expect(setDisplayNameCalls).toHaveLength(0);
  });

  it("rejects an over-long name with 400", async () => {
    authed();
    const res = await putName({ name: "x".repeat(51) });
    expect(res.status).toBe(400);
    expect(setDisplayNameCalls).toHaveLength(0);
  });

  it("trims and persists a valid name with the session user id", async () => {
    authed("user-7");
    const res = await putName({ name: "  Alice Doe  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Alice Doe" });
    expect(setDisplayNameCalls).toHaveLength(1);
    expect(setDisplayNameCalls[0]).toEqual({
      userId: "user-7",
      name: "Alice Doe",
    });
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
