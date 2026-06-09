import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { AvatarConfig } from "@gamelobby/avatar";

const mockEnv = {
  genderizeApiKey: "test-key",
  nodeEnv: "development",
  notAllowedUsernames: [] as string[],
  usernameChangeCooldownDays: 30,
};
mock.module("../src/env", () => ({ env: mockEnv }));

let detectedGender = "unknown";
mock.module("gender-detection-from-name", () => ({
  getGender: () => detectedGender,
}));

let createdAvatar: AvatarConfig | null = null;
let existingProfile: { username: string } | null = null;

type CreateProfileInput = { username: string; avatar: AvatarConfig };
const defaultGetTaken = async (_names: string[]): Promise<Set<string>> =>
  new Set<string>();
const defaultCreateProfile = async (input: CreateProfileInput) => {
  createdAvatar = input.avatar;
  return { username: input.username };
};
let getTakenImpl: (names: string[]) => Promise<Set<string>> = defaultGetTaken;
let createProfileImpl: (
  input: CreateProfileInput,
) => Promise<{ username: string }> = defaultCreateProfile;
let createProfileCalls = 0;

mock.module("@gamelobby/database", () => ({
  games: {},
  profiles: {
    getProfileByUserId: async () => existingProfile,
    getTakenUsernames: (names: string[]) => getTakenImpl(names),
    createProfile: (input: CreateProfileInput) => {
      createProfileCalls += 1;
      return createProfileImpl(input);
    },
  },
  accountMerge: {},
  conversations: {},
  friends: {},
  messages: {},
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

const { detectedToStyle, firstNameOf, genderToStyle, predictAvatarStyle } =
  await import("../src/services/gender-detection");
const { ensureUsernameForUser, isUsernameBlocked, suggestUsernames } =
  await import("../src/username");

const realFetch = globalThis.fetch;
let fetchCalled = false;

function setFetch(fn: () => Promise<Response>): void {
  globalThis.fetch = fn as unknown as typeof fetch;
}

function genderizeReturns(body: unknown, status = 200): void {
  setFetch(async () => new Response(JSON.stringify(body), { status }));
}

function genderizeThrows(): void {
  setFetch(async () => {
    throw new Error("network down");
  });
}

function genderizeFailsIfCalled(): void {
  setFetch(async () => {
    fetchCalled = true;
    throw new Error("genderize should not be called");
  });
}

beforeEach(() => {
  mockEnv.genderizeApiKey = "test-key";
  mockEnv.nodeEnv = "development";
  mockEnv.notAllowedUsernames = [];
  detectedGender = "unknown";
  createdAvatar = null;
  existingProfile = null;
  fetchCalled = false;
  getTakenImpl = defaultGetTaken;
  createProfileImpl = defaultCreateProfile;
  createProfileCalls = 0;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("firstNameOf", () => {
  it("takes the first whitespace-delimited token, lowercased", () => {
    expect(firstNameOf("Pulkit Sharma")).toBe("pulkit");
  });

  it("collapses surrounding and internal whitespace", () => {
    expect(firstNameOf("  John   Doe ")).toBe("john");
  });

  it("handles a single name", () => {
    expect(firstNameOf("Madonna")).toBe("madonna");
  });

  it("returns null for empty or missing names", () => {
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf(undefined)).toBeNull();
  });
});

describe("genderToStyle", () => {
  it("maps a confident male result to masculine", () => {
    expect(genderToStyle("male", 0.98)).toBe("masculine");
  });

  it("maps a confident female result to feminine", () => {
    expect(genderToStyle("female", 0.91)).toBe("feminine");
  });

  it("accepts results at the probability threshold", () => {
    expect(genderToStyle("male", 0.7)).toBe("masculine");
  });

  it("rejects low-confidence results", () => {
    expect(genderToStyle("male", 0.5)).toBeNull();
  });

  it("rejects a null gender", () => {
    expect(genderToStyle(null, 0)).toBeNull();
  });
});

describe("detectedToStyle", () => {
  it("maps the library's male and female to a style", () => {
    expect(detectedToStyle("male")).toBe("masculine");
    expect(detectedToStyle("female")).toBe("feminine");
  });

  it("maps unknown to null", () => {
    expect(detectedToStyle("unknown")).toBeNull();
  });
});

describe("predictAvatarStyle", () => {
  it("returns 'any' for an empty name without calling genderize", async () => {
    genderizeFailsIfCalled();
    expect(await predictAvatarStyle("")).toBe("any");
    expect(fetchCalled).toBe(false);
  });

  it("uses a confident genderize result", async () => {
    genderizeReturns({ gender: "female", probability: 0.97 });
    detectedGender = "unknown";
    expect(await predictAvatarStyle("Alice Walker")).toBe("feminine");
  });

  it("falls back to the local library when genderize throws", async () => {
    genderizeThrows();
    detectedGender = "male";
    expect(await predictAvatarStyle("Michael")).toBe("masculine");
  });

  it("falls back to the local library when genderize is inconclusive", async () => {
    genderizeReturns({ gender: null, probability: 0 });
    detectedGender = "female";
    expect(await predictAvatarStyle("Priya")).toBe("feminine");
  });

  it("skips genderize and uses the fallback when no api key is set", async () => {
    mockEnv.genderizeApiKey = "";
    genderizeFailsIfCalled();
    detectedGender = "male";
    expect(await predictAvatarStyle("Michael")).toBe("masculine");
    expect(fetchCalled).toBe(false);
  });

  it("skips genderize under the test environment to avoid burning quota", async () => {
    mockEnv.nodeEnv = "test";
    genderizeFailsIfCalled();
    detectedGender = "male";
    expect(await predictAvatarStyle("Michael")).toBe("masculine");
    expect(fetchCalled).toBe(false);
  });

  it("returns 'any' when neither source is conclusive", async () => {
    genderizeReturns({ gender: null, probability: 0 });
    detectedGender = "unknown";
    expect(await predictAvatarStyle("Xyzzy")).toBe("any");
  });
});

describe("ensureUsernameForUser: avatar style", () => {
  it("threads the name-predicted style into the seeded avatar", async () => {
    genderizeReturns({ gender: "female", probability: 0.97 });
    const username = await ensureUsernameForUser("user-1", "Alice");
    expect(username).toBe("alice");
    expect(createdAvatar?.style).toBe("feminine");
  });

  it("defaults to an 'any' avatar when the prediction is inconclusive", async () => {
    genderizeReturns({ gender: null, probability: 0 });
    detectedGender = "unknown";
    await ensureUsernameForUser("user-2", "Xyzzy");
    expect(createdAvatar?.style).toBe("any");
  });

  it("skips gender detection entirely for guest provisioning", async () => {
    genderizeFailsIfCalled();
    detectedGender = "male";
    const username = await ensureUsernameForUser("guest-1", "Alice", {
      skipGenderDetection: true,
    });
    expect(username).toBe("alice");
    expect(createdAvatar?.style).toBe("any");
    expect(fetchCalled).toBe(false);
  });
});

describe("ensureUsernameForUser: username selection", () => {
  it("returns the existing username without provisioning a new profile", async () => {
    existingProfile = { username: "already_here" };
    const username = await ensureUsernameForUser("user-x", "Some Name");
    expect(username).toBe("already_here");
    expect(createProfileCalls).toBe(0);
    expect(createdAvatar).toBeNull();
  });

  it("skips a taken base and falls through to a suffixed candidate", async () => {
    mockEnv.nodeEnv = "test";
    getTakenImpl = async (names) =>
      new Set(names.filter((n) => n === "alice").map((n) => n.toLowerCase()));
    const username = await ensureUsernameForUser("user-skip", "Alice");
    expect(username).not.toBe("alice");
    expect(username.startsWith("alice_")).toBe(true);
  });

  it("retries the next candidate when createProfile loses a unique-key race", async () => {
    mockEnv.nodeEnv = "test";
    createProfileImpl = async (input) => {
      if (createProfileCalls === 1) throw new Error("duplicate key value");
      createdAvatar = input.avatar;
      return { username: input.username };
    };
    const username = await ensureUsernameForUser("user-race", "Alice");
    expect(createProfileCalls).toBe(2);
    expect(username).not.toBe("alice");
    expect(username).toBeTruthy();
  });

  it("falls back to a player_ name when every candidate is taken", async () => {
    mockEnv.nodeEnv = "test";
    getTakenImpl = async (names) => new Set(names.map((n) => n.toLowerCase()));
    const username = await ensureUsernameForUser("user-fallback", "Alice");
    expect(username.startsWith("player_")).toBe(true);
  });

  it("never settles on a reserved name as the chosen username", async () => {
    mockEnv.nodeEnv = "test";
    const username = await ensureUsernameForUser("user-reserved", "games");
    expect(username).not.toBe("games");
    expect(username.startsWith("games_")).toBe(true);
  });
});

describe("suggestUsernames", () => {
  it("offers the bare base first when nothing is taken", async () => {
    const out = await suggestUsernames("Alice");
    expect(out).toHaveLength(5);
    expect(out[0]).toBe("alice");
    for (const s of out) expect(s.startsWith("alice")).toBe(true);
  });

  it("honors a custom count", async () => {
    expect(await suggestUsernames("Alice", 3)).toHaveLength(3);
  });

  it("excludes a taken base from the suggestions", async () => {
    getTakenImpl = async (names) =>
      new Set(names.filter((n) => n === "alice").map((n) => n.toLowerCase()));
    const out = await suggestUsernames("Alice");
    expect(out).not.toContain("alice");
    expect(out.length).toBeGreaterThan(0);
  });

  it("filters out a reserved base before suggesting", async () => {
    const out = await suggestUsernames("api");
    expect(out).not.toContain("api");
    for (const s of out) expect(s.startsWith("api_")).toBe(true);
  });
});

describe("isUsernameBlocked", () => {
  it("blocks reserved top-level route names", () => {
    expect(isUsernameBlocked("api")).toBe(true);
    expect(isUsernameBlocked("settings")).toBe(true);
  });

  it("allows an ordinary name", () => {
    expect(isUsernameBlocked("alice")).toBe(false);
  });

  it("blocks names configured in NOT_ALLOWED_USERNAMES", () => {
    mockEnv.notAllowedUsernames = ["nope"];
    expect(isUsernameBlocked("nope")).toBe(true);
    expect(isUsernameBlocked("fine")).toBe(false);
  });
});
