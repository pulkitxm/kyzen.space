import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { AvatarConfig } from "@gamelobby/avatar";

const mockEnv = { genderizeApiKey: "test-key", nodeEnv: "development" };
mock.module("../src/env", () => ({ env: mockEnv }));

let detectedGender = "unknown";
mock.module("gender-detection-from-name", () => ({
  getGender: () => detectedGender,
}));

let createdAvatar: AvatarConfig | null = null;
let existingProfile: { username: string } | null = null;
mock.module("../src/db/repositories/profiles", () => ({
  getProfileByUserId: async () => existingProfile,
  getTakenUsernames: async () => new Set<string>(),
  createProfile: async (input: { username: string; avatar: AvatarConfig }) => {
    createdAvatar = input.avatar;
    return { username: input.username };
  },
}));

const { detectedToStyle, firstNameOf, genderToStyle, predictAvatarStyle } =
  await import("../src/services/gender-detection");
const { ensureUsernameForUser } = await import("../src/username");

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
  detectedGender = "unknown";
  createdAvatar = null;
  existingProfile = null;
  fetchCalled = false;
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

describe("ensureUsernameForUser — avatar style", () => {
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
});
