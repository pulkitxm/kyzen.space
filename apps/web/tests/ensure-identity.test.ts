import { beforeEach, describe, expect, it, mock } from "bun:test";

type SessionData = { session: unknown } | null | undefined;

let getSessionResult: { data: SessionData } = { data: null };
let anonCalls = 0;
const callOrder: string[] = [];
let anonShouldThrow = false;
let anonError = false;

mock.module("@/lib/auth-client", () => ({
  authClient: {
    getSession: async () => {
      callOrder.push("getSession");
      return getSessionResult;
    },
    signIn: {
      anonymous: async () => {
        callOrder.push("anonymous");
        anonCalls += 1;
        if (anonShouldThrow) throw new Error("anon failed");
        if (anonError) return { error: { message: "Guest unavailable" } };
        const session = { session: { id: "anon-session" } };
        getSessionResult = { data: session };
        return { data: session };
      },
    },
  },
}));

const { ensureIdentity } = await import("@/lib/auth/ensure-identity");

beforeEach(() => {
  getSessionResult = { data: null };
  anonCalls = 0;
  anonShouldThrow = false;
  anonError = false;
  callOrder.length = 0;
});

describe("ensureIdentity", () => {
  it("rejects a returned anonymous sign-in error", async () => {
    anonError = true;
    await expect(ensureIdentity()).rejects.toThrow("Guest unavailable");
  });
  it("mints an anonymous session when there is none", async () => {
    getSessionResult = { data: null };
    expect(await ensureIdentity()).toBe(true);
    expect(anonCalls).toBe(1);
  });

  it("does nothing when a session already exists", async () => {
    getSessionResult = { data: { session: { id: "existing" } } };
    expect(await ensureIdentity()).toBe(false);
    expect(anonCalls).toBe(0);
  });

  it("mints when getSession returns no data object at all", async () => {
    getSessionResult = { data: null };
    await ensureIdentity();
    expect(anonCalls).toBe(1);
  });

  it("mints when data is present but its session field is null", async () => {
    getSessionResult = { data: { session: null } };
    await ensureIdentity();
    expect(anonCalls).toBe(1);
  });

  it("mints when data is present but its session field is undefined", async () => {
    getSessionResult = { data: { session: undefined } };
    await ensureIdentity();
    expect(anonCalls).toBe(1);
  });

  it("treats data === undefined as no session and mints", async () => {
    getSessionResult = { data: undefined };
    await ensureIdentity();
    expect(anonCalls).toBe(1);
  });

  it("reads the session before deciding to mint", async () => {
    getSessionResult = { data: null };
    await ensureIdentity();
    expect(callOrder[0]).toBe("getSession");
    expect(callOrder).toContain("anonymous");
  });

  it("never calls anonymous sign-in when a session is present", async () => {
    getSessionResult = { data: { session: { id: "existing" } } };
    await ensureIdentity();
    expect(callOrder).toEqual(["getSession"]);
  });

  it("does not swallow a failing anonymous sign-in", async () => {
    getSessionResult = { data: null };
    anonShouldThrow = true;
    await expect(ensureIdentity()).rejects.toThrow("anon failed");
    expect(anonCalls).toBe(1);
  });
});
