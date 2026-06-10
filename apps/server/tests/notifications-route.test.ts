import { beforeEach, describe, expect, mock, test } from "bun:test";

type ListOpts = { cursor?: string; unreadOnly?: boolean };

const listCalls: ListOpts[] = [];
const markReadCalls: Array<{ id: string; userId: string }> = [];
const markAllReadCalls: string[] = [];

let listResult = {
  notifications: [] as Array<Record<string, unknown>>,
  nextCursor: null as string | null,
};
let unreadCountResult = 0;

mock.module("@gamelobby/database", () => ({
  notifications: {
    listForUser: async (_userId: string, opts: ListOpts) => {
      listCalls.push(opts);
      return listResult;
    },
    unreadCount: async () => unreadCountResult,
    markRead: async (id: string, userId: string) => {
      markReadCalls.push({ id, userId });
      return null;
    },
    markAllRead: async (userId: string) => {
      markAllReadCalls.push(userId);
      return 0;
    },
  },
  profiles: { getPublicUser: async () => null },
  accountMerge: {},
  conversations: {},
  friends: {},
  messages: {},
  games: {},
  db: {},
  schema: {},
  invites: {},
  generateInviteToken: () => "x".repeat(43),
  createDb: () => ({ db: {}, client: {} }),
}));

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () => ({
        user: { id: "viewer-1", name: "V", email: "v@e.com" },
        session: { token: "t" },
      }),
    },
  }),
}));

const { notificationsRouter } = await import("../src/api/routes/notifications");

beforeEach(() => {
  listCalls.length = 0;
  markReadCalls.length = 0;
  markAllReadCalls.length = 0;
  listResult = { notifications: [], nextCursor: null };
  unreadCountResult = 0;
});

describe("GET /api/notifications - unreadOnly parsing", () => {
  test("defaults unreadOnly to false when the query is absent", async () => {
    await notificationsRouter.request("/");
    expect(listCalls[0]?.unreadOnly).toBe(false);
  });

  test("parses unreadOnly=1 as true", async () => {
    await notificationsRouter.request("/?unreadOnly=1");
    expect(listCalls[0]?.unreadOnly).toBe(true);
  });

  test("parses unreadOnly=true as true", async () => {
    await notificationsRouter.request("/?unreadOnly=true");
    expect(listCalls[0]?.unreadOnly).toBe(true);
  });

  test("treats unreadOnly=false as false (not in the whitelist)", async () => {
    await notificationsRouter.request("/?unreadOnly=false");
    expect(listCalls[0]?.unreadOnly).toBe(false);
  });

  test("treats an arbitrary unreadOnly value as false", async () => {
    await notificationsRouter.request("/?unreadOnly=yes");
    expect(listCalls[0]?.unreadOnly).toBe(false);
  });
});

describe("GET /api/notifications - cursor handling", () => {
  test("passes undefined cursor when the query is absent", async () => {
    await notificationsRouter.request("/");
    expect(listCalls[0]?.cursor).toBeUndefined();
  });

  test("coerces an empty cursor to undefined", async () => {
    await notificationsRouter.request("/?cursor=");
    expect(listCalls[0]?.cursor).toBeUndefined();
  });

  test("forwards a non-empty cursor", async () => {
    await notificationsRouter.request("/?cursor=abc123");
    expect(listCalls[0]?.cursor).toBe("abc123");
  });

  test("echoes the nextCursor from the repository", async () => {
    listResult = { notifications: [], nextCursor: "next-page" };
    const res = await notificationsRouter.request("/");
    const body = (await res.json()) as { nextCursor: string | null };
    expect(body.nextCursor).toBe("next-page");
  });
});

describe("GET /api/notifications/unread-count", () => {
  test("returns the repository unread count", async () => {
    unreadCountResult = 7;
    const res = await notificationsRouter.request("/unread-count");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 7 });
  });
});

describe("POST /api/notifications/:id/read", () => {
  test("forwards the id and authenticated user to markRead", async () => {
    const res = await notificationsRouter.request("/n-9/read", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(markReadCalls).toEqual([{ id: "n-9", userId: "viewer-1" }]);
  });
});

describe("POST /api/notifications/read-all", () => {
  test("forwards the authenticated user to markAllRead", async () => {
    const res = await notificationsRouter.request("/read-all", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(markAllReadCalls).toEqual(["viewer-1"]);
  });
});
