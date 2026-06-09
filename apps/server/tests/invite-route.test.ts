import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

type Session = { user: { id: string } } | null;

type InviteRow = {
  id: string;
  token: string;
  inviterUserId: string;
  gameType: string;
  config: unknown;
  seatingMode: "open" | "challenge" | null;
  expiresAt: Date;
  createdAt: Date;
} | null;

let session: Session = null;
let anonCalls = 0;
let anonMintsNoUser = false;

let invite: InviteRow = null;
// biome-ignore lint/suspicious/noExplicitAny: test capture
let createInviteInput: any = null;
let publicUser: {
  id: string;
  username: string;
  displayName: string | null;
  avatar: unknown;
} | null = null;
let dmCreated: { a: string; b: string } | null = null;
// biome-ignore lint/suspicious/noExplicitAny: test capture
let createGameInput: any = null;
const notifyCalls: Array<{ userId: string; type: string; payload: unknown }> =
  [];

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () => session,
      signInAnonymous: async () => {
        anonCalls += 1;
        const headers = new Headers();
        headers.append(
          "set-cookie",
          "better-auth.session_token=anon-token; Path=/; HttpOnly",
        );
        if (anonMintsNoUser) {
          return { headers, response: { user: undefined } };
        }
        session = { user: { id: "anon-99" } };
        return { headers, response: { user: { id: "anon-99" } } };
      },
    },
  }),
}));

mock.module("@gamelobby/database", () => ({
  generateInviteToken: () => "x".repeat(43),
  invites: {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    create: async (input: any) => {
      createInviteInput = input;
      return {
        id: "inv-1",
        token: input.token,
        inviterUserId: input.inviterUserId,
        gameType: input.gameType,
        config: input.config ?? null,
        seatingMode: input.seatingMode ?? null,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      };
    },
    getByToken: async () => invite,
  },
  conversations: {
    getOrCreateDm: async (a: string, b: string) => {
      dmCreated = { a, b };
      return { conversation: { id: "conv-1" }, created: true };
    },
    getById: async () => ({ id: "conv-1", kind: "dm", name: null }),
    isMember: async () => true,
    getMemberIds: async () => ["inviter-1", "accepter-9"],
  },
  profiles: {
    getPublicUser: async () => publicUser,
    getProfileByUserId: async () => ({ username: "alice" }),
  },
  games: {
    findLiveGameInConversation: async () => null,
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    createGame: async (input: any) => {
      createGameInput = input;
      return {
        id: "game-1",
        code: "GAMECD",
        gameType: input.gameType,
        status: input.status ?? "waiting",
        players: input.players,
        winner: null,
        gameState: input.gameState,
        config: input.config ?? null,
        conversationId: input.conversationId ?? null,
        creatorUserId: input.creatorUserId ?? null,
        seatingMode: input.seatingMode ?? null,
        challengedUserId: input.challengedUserId ?? null,
        seriesId: input.seriesId ?? null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  },
  accountMerge: {},
  friends: {},
  messages: {},
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

mock.module("../src/chat/messages-service", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  sendMessage: async (input: any) => ({
    ok: true,
    value: { id: "msg-1", ...input },
  }),
  sendSystemMessage: async () => ({ id: "msg-sys" }),
  deleteMessage: async () => ({ ok: true, value: { id: "msg-1" } }),
  markRead: async () => ({ ok: true, value: null }),
}));

mock.module("../src/realtime/notify", () => ({
  notify: async (
    userId: string,
    type: string,
    opts?: { payload?: unknown },
  ) => {
    notifyCalls.push({ userId, type, payload: opts?.payload });
  },
}));

const { inviteRouter } = await import("../src/api/routes/invite");

function future(): Date {
  return new Date(Date.now() + 60_000);
}
function past(): Date {
  return new Date(Date.now() - 60_000);
}
function inviteRow(
  over: Partial<NonNullable<InviteRow>> = {},
): NonNullable<InviteRow> {
  return {
    id: "inv-1",
    token: "x".repeat(43),
    inviterUserId: "inviter-1",
    gameType: TIC_TAC_TOE,
    config: null,
    seatingMode: null,
    expiresAt: future(),
    createdAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  session = null;
  anonCalls = 0;
  anonMintsNoUser = false;
  invite = null;
  createInviteInput = null;
  publicUser = {
    id: "inviter-1",
    username: "alice",
    displayName: "Alice",
    avatar: { seed: "x" },
  };
  dmCreated = null;
  createGameInput = null;
  notifyCalls.length = 0;
});

describe("POST /api/invite", () => {
  test("401 without a session", async () => {
    const res = await inviteRouter.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameType: TIC_TAC_TOE }),
    });
    expect(res.status).toBe(401);
    expect(createInviteInput).toBeNull();
  });

  test("creates a token + url for the authed inviter", async () => {
    session = { user: { id: "inviter-1" } };
    const res = await inviteRouter.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameType: TIC_TAC_TOE }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; url: string };
    expect(body.token.length).toBeGreaterThanOrEqual(43);
    expect(body.url).toContain(`/invite/${body.token}`);
    expect(createInviteInput.inviterUserId).toBe("inviter-1");
    expect(createInviteInput.gameType).toBe(TIC_TAC_TOE);
    expect(createInviteInput.expiresAt instanceof Date).toBe(true);
  });

  test("threads the config through into the persisted invite", async () => {
    session = { user: { id: "inviter-1" } };
    const res = await inviteRouter.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameType: TIC_TAC_TOE, config: {} }),
    });
    expect(res.status).toBe(200);
    expect(createInviteInput.config).toEqual({});
  });

  test("400 for an unknown game type", async () => {
    session = { user: { id: "inviter-1" } };
    const res = await inviteRouter.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameType: "chess" }),
    });
    expect(res.status).toBe(400);
    expect(createInviteInput).toBeNull();
  });
});

describe("GET /api/invite/:token (public peek)", () => {
  test("returns gameType + inviter, never email, without a session", async () => {
    invite = inviteRow({ seatingMode: "challenge", expiresAt: future() });
    const res = await inviteRouter.request(`/${"x".repeat(43)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      gameType: TIC_TAC_TOE,
      inviter: { username: "alice", avatar: { seed: "x" } },
      expired: false,
    });
    expect(JSON.stringify(body)).not.toContain("email");
  });

  test("unknown and expired tokens return the same expired shape (no oracle)", async () => {
    invite = null;
    const unknownRes = await inviteRouter.request("/nope");
    const unknownBody = await unknownRes.json();

    invite = inviteRow({ expiresAt: past() });
    const expiredRes = await inviteRouter.request(`/${"x".repeat(43)}`);
    const expiredBody = await expiredRes.json();

    expect(unknownBody).toEqual({
      gameType: null,
      inviter: null,
      expired: true,
    });
    expect(JSON.stringify(unknownBody)).toBe(JSON.stringify(expiredBody));
  });

  test("expiresAt exactly now is treated as expired", async () => {
    const fixed = 1_700_000_000_000;
    const realNow = Date.now;
    Date.now = () => fixed;
    try {
      invite = inviteRow({ expiresAt: new Date(fixed) });
      const res = await inviteRouter.request(`/${"x".repeat(43)}`);
      expect(await res.json()).toEqual({
        gameType: null,
        inviter: null,
        expired: true,
      });
    } finally {
      Date.now = realNow;
    }
  });

  test("expiresAt 1ms in the future is still valid", async () => {
    const fixed = 1_700_000_000_000;
    const realNow = Date.now;
    Date.now = () => fixed;
    try {
      invite = inviteRow({ expiresAt: new Date(fixed + 1) });
      const res = await inviteRouter.request(`/${"x".repeat(43)}`);
      expect(await res.json()).toEqual({
        gameType: TIC_TAC_TOE,
        inviter: { username: "alice", avatar: { seed: "x" } },
        expired: false,
      });
    } finally {
      Date.now = realNow;
    }
  });

  test("never leaks an email key for a valid invite", async () => {
    publicUser = {
      id: "inviter-1",
      username: "alice",
      displayName: "Alice",
      avatar: { seed: "x" },
      // biome-ignore lint/suspicious/noExplicitAny: probing leakage of a field the DTO must drop
    } as any;
    // biome-ignore lint/suspicious/noExplicitAny: inject a forbidden field onto the stubbed public user
    (publicUser as any).email = "alice@temp.local";
    invite = inviteRow({ expiresAt: future() });
    const res = await inviteRouter.request(`/${"x".repeat(43)}`);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("email");
    expect(raw).not.toContain("@temp.local");
  });
});

describe("POST /api/invite/:token/accept (public)", () => {
  test("mints an anon session and sets the cookie when logged out", async () => {
    session = null;
    invite = inviteRow({ inviterUserId: "inviter-1", expiresAt: future() });
    const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(anonCalls).toBe(1);
    expect(res.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );
    expect(dmCreated).toEqual({ a: "inviter-1", b: "anon-99" });
    expect(await res.json()).toEqual({
      gameId: "GAMECD",
      selfInvite: false,
      inviter: { username: "alice", avatar: { seed: "x" } },
    });
  });

  test("does not mint when already signed in and creates the DM + game", async () => {
    session = { user: { id: "accepter-9" } };
    invite = inviteRow({
      inviterUserId: "inviter-1",
      config: {},
      expiresAt: future(),
    });
    const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(anonCalls).toBe(0);
    expect(dmCreated).toEqual({ a: "inviter-1", b: "accepter-9" });
    expect(createGameInput.creatorUserId).toBe("inviter-1");
    expect(createGameInput.seatingMode).toBe("open");
    expect(createGameInput.challengedUserId).toBeNull();
    expect(await res.json()).toEqual({
      gameId: "GAMECD",
      selfInvite: false,
      inviter: { username: "alice", avatar: { seed: "x" } },
    });
  });

  test("notifies the inviter with game_invite carrying the game id", async () => {
    session = { user: { id: "accepter-9" } };
    invite = inviteRow({ inviterUserId: "inviter-1", expiresAt: future() });
    const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(
      notifyCalls.some(
        (n) =>
          n.userId === "inviter-1" &&
          n.type === "game_invite" &&
          (n.payload as { gameId?: string })?.gameId === "GAMECD",
      ),
    ).toBe(true);
  });

  test("threads the invite config through into the created game", async () => {
    session = { user: { id: "accepter-9" } };
    invite = inviteRow({
      inviterUserId: "inviter-1",
      config: {},
      expiresAt: future(),
    });
    const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(createGameInput).not.toBeNull();
    expect(createGameInput.config).toEqual({});
  });

  test("opening your own link is a no-op (selfInvite, no game, no notify)", async () => {
    session = { user: { id: "inviter-1" } };
    invite = inviteRow({ inviterUserId: "inviter-1", expiresAt: future() });
    const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      gameId: null,
      selfInvite: true,
      inviter: { username: "alice", avatar: { seed: "x" } },
    });
    expect(createGameInput).toBeNull();
    expect(dmCreated).toBeNull();
    expect(notifyCalls.length).toBe(0);
  });

  test("404 for a missing token with no email and an error-only body", async () => {
    session = { user: { id: "accepter-9" } };
    invite = null;
    const res = await inviteRouter.request("/nope/accept", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Invite not found or expired" });
    expect(JSON.stringify(body)).not.toContain("email");
    expect(createGameInput).toBeNull();
  });

  test("unknown and expired accepts produce the same 404 shape (no oracle)", async () => {
    session = { user: { id: "accepter-9" } };
    invite = null;
    const unknownRes = await inviteRouter.request("/nope/accept", {
      method: "POST",
    });
    const unknownBody = await unknownRes.json();

    invite = inviteRow({ expiresAt: past() });
    const expiredRes = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    const expiredBody = await expiredRes.json();

    expect(unknownRes.status).toBe(404);
    expect(expiredRes.status).toBe(404);
    expect(JSON.stringify(unknownBody)).toBe(JSON.stringify(expiredBody));
    expect(createGameInput).toBeNull();
  });

  test("expiresAt exactly now is rejected with 404 and creates no game", async () => {
    const fixed = 1_700_000_000_000;
    const realNow = Date.now;
    Date.now = () => fixed;
    try {
      session = { user: { id: "accepter-9" } };
      invite = inviteRow({ expiresAt: new Date(fixed) });
      const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
        method: "POST",
      });
      expect(res.status).toBe(404);
      expect(createGameInput).toBeNull();
      expect(dmCreated).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  test("a successful accept response carries no email key", async () => {
    publicUser = {
      id: "inviter-1",
      username: "alice",
      displayName: "Alice",
      avatar: { seed: "x" },
      // biome-ignore lint/suspicious/noExplicitAny: probing leakage of a field the DTO must drop
    } as any;
    // biome-ignore lint/suspicious/noExplicitAny: inject a forbidden field onto the stubbed public user
    (publicUser as any).email = "alice@temp.local";
    session = { user: { id: "accepter-9" } };
    invite = inviteRow({ inviterUserId: "inviter-1", expiresAt: future() });
    const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("email");
    expect(raw).not.toContain("@temp.local");
  });

  test("500 when anon minting yields no user id", async () => {
    session = null;
    anonMintsNoUser = true;
    invite = inviteRow({ expiresAt: future() });
    const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(500);
    expect(anonCalls).toBe(1);
    expect(createGameInput).toBeNull();
  });

  test("allows 20 accepts per inviter in a window but 409s the 21st", async () => {
    session = { user: { id: "accepter-rl" } };
    invite = inviteRow({ inviterUserId: "rl-inviter-a", expiresAt: future() });
    for (let i = 0; i < 20; i++) {
      session = { user: { id: `accepter-${i}` } };
      const res = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
    }
    session = { user: { id: "accepter-over" } };
    const overflow = await inviteRouter.request(`/${"x".repeat(43)}/accept`, {
      method: "POST",
    });
    expect(overflow.status).toBe(409);
  });
});
