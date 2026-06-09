import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { db, profiles, schema } from "@gamelobby/database";
import { eq } from "drizzle-orm";
import { generateGuestName } from "../src/guest-name";
import { ensureUsernameForUser } from "../src/username";
import { DB_UP } from "./harness";

const PREFIX = "gie";
const createdUserIds: string[] = [];

async function insertGuestUser(name: string): Promise<string> {
  const id = `${PREFIX}_${crypto.randomUUID()}`;
  await db.insert(schema.user).values({
    id,
    name,
    email: `temp@${id}.com`,
    isAnonymous: true,
  });
  createdUserIds.push(id);
  return id;
}

async function insertPlainUser(name: string): Promise<string> {
  const id = `${PREFIX}_${crypto.randomUUID()}`;
  await db.insert(schema.user).values({
    id,
    name,
    email: `${id}@itest.local`,
  });
  createdUserIds.push(id);
  return id;
}

const realFetch = globalThis.fetch;
let networkCalled = false;

beforeEach(() => {
  networkCalled = false;
  globalThis.fetch = (async () => {
    networkCalled = true;
    throw new Error("guest provisioning must not hit the network");
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(async () => {
  if (!DB_UP) return;
  for (const id of createdUserIds) {
    await db
      .delete(schema.user)
      .where(eq(schema.user.id, id))
      .catch(() => {});
  }
});

describe.skipIf(!DB_UP)("guest identity provisioning", () => {
  it("defaults a freshly inserted user row to is_anonymous = false", async () => {
    const id = await insertPlainUser("Plain Person");
    const [row] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, id));
    expect(row?.isAnonymous).toBe(false);
  });

  it("persists is_anonymous = true for an anonymous guest row", async () => {
    const id = await insertGuestUser(generateGuestName());
    const [row] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, id));
    expect(row?.isAnonymous).toBe(true);
  });

  it("provisions a guest profile with an 'any'-style avatar and no network call", async () => {
    const name = generateGuestName();
    const id = await insertGuestUser(name);

    const username = await ensureUsernameForUser(id, name, {
      skipGenderDetection: true,
    });

    expect(networkCalled).toBe(false);
    expect(username.length).toBeGreaterThan(0);

    const profile = await profiles.getProfileByUserId(id);
    expect(profile).not.toBeNull();
    expect(profile?.username).toBe(username);
    expect(profile?.avatar).not.toBeNull();
    expect(profile?.avatar?.style).toBe("any");
  });

  it("slugifies the Guest- display name into the provisioned username", async () => {
    const name = "Guest-zxqw12";
    const id = await insertGuestUser(name);
    const username = await ensureUsernameForUser(id, name, {
      skipGenderDetection: true,
    });
    expect(username.startsWith("guestzxqw12")).toBe(true);
    expect(username).toMatch(/^[a-z0-9_]+$/);
  });

  it("is idempotent: a second provisioning returns the same username without a new profile", async () => {
    const name = generateGuestName();
    const id = await insertGuestUser(name);
    const first = await ensureUsernameForUser(id, name, {
      skipGenderDetection: true,
    });
    const second = await ensureUsernameForUser(id, name, {
      skipGenderDetection: true,
    });
    expect(second).toBe(first);
  });

  it("exposes a guest through getPublicUser without leaking the throwaway email", async () => {
    const name = generateGuestName();
    const id = await insertGuestUser(name);
    const username = await ensureUsernameForUser(id, name, {
      skipGenderDetection: true,
    });

    const pub = await profiles.getPublicUser(id);
    expect(pub).not.toBeNull();
    expect(pub?.id).toBe(id);
    expect(pub?.username).toBe(username);
    expect(pub?.displayName).toBe(name);
    expect(Object.keys(pub ?? {})).not.toContain("email");
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain("temp@");
    expect(serialized).not.toContain("@itest.local");
  });

  it("never surfaces the email where a username or avatar is expected", async () => {
    const name = generateGuestName();
    const id = await insertGuestUser(name);
    const username = await ensureUsernameForUser(id, name, {
      skipGenderDetection: true,
    });

    const pub = await profiles.getPublicUser(id);
    expect(pub?.username).not.toContain("@");
    expect(pub?.username).not.toContain("temp");
    expect(JSON.stringify(pub?.avatar)).not.toContain("@");

    const batch = await profiles.getPublicUsers([id]);
    expect(batch).toHaveLength(1);
    expect(Object.keys(batch[0] ?? {})).not.toContain("email");
    expect(batch[0]?.username).toBe(username);
  });

  it("lets a guest be looked up by username like any normal user", async () => {
    const name = generateGuestName();
    const id = await insertGuestUser(name);
    const username = await ensureUsernameForUser(id, name, {
      skipGenderDetection: true,
    });

    const byName = await profiles.getProfileByUsername(username);
    expect(byName?.userId).toBe(id);
    expect(await profiles.isUsernameTaken(username)).toBe(true);
  });
});
