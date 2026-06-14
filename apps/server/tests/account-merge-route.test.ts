import { beforeEach, describe, expect, it, mock } from "bun:test";

type MergeRow = {
  id: string;
  anonUserId: string;
  targetUserId: string;
  status: "pending" | "confirmed" | "discarded";
  createdAt: Date;
  resolvedAt: Date | null;
} | null;

let session: { user: { id: string; email?: string } } | null = null;
let pendingRow: MergeRow = null;
let byId: MergeRow = null;
const mergeCalls: Array<{ anonId: string; targetId: string }> = [];
const discardCalls: string[] = [];
const resolvedCalls: Array<{ id: string; status: string }> = [];

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: { getSession: async () => session },
  }),
}));

mock.module("@kyzen/database", () => ({
  accountMerge: {
    getPendingForTarget: async () => pendingRow,
    getById: async () => byId,
    summarizeAnonAccount: async () => ({
      games: 12,
      conversations: 3,
      friends: 2,
      statLines: 1,
    }),
    mergeAccounts: async (anonId: string, targetId: string) => {
      mergeCalls.push({ anonId, targetId });
    },
    deleteAnonUserData: async (anonId: string) => {
      discardCalls.push(anonId);
    },
    markResolved: async (id: string, status: string) => {
      resolvedCalls.push({ id, status });
      return { ...(byId as NonNullable<MergeRow>), status };
    },
  },
  conversations: {},
  friends: {},
  games: {},
  messages: {},
  notifications: {},
  profiles: {},
  db: {},
  schema: {},
  invites: {},
  generateInviteToken: () => "x".repeat(43),
  createDb: () => ({ db: {}, client: {} }),
}));

const { accountRouter } = await import("../src/api/routes/account");

function row(over: Partial<NonNullable<MergeRow>> = {}): NonNullable<MergeRow> {
  return {
    id: "merge-1",
    anonUserId: "anon-1",
    targetUserId: "target-1",
    status: "pending",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    resolvedAt: null,
    ...over,
  };
}

beforeEach(() => {
  session = null;
  pendingRow = null;
  byId = null;
  mergeCalls.length = 0;
  discardCalls.length = 0;
  resolvedCalls.length = 0;
});

describe("GET /api/account/merge/pending", () => {
  it("401 when unauthenticated", async () => {
    const res = await accountRouter.request("/merge/pending");
    expect(res.status).toBe(401);
  });

  it("returns null when there is no pending merge", async () => {
    session = { user: { id: "target-1" } };
    pendingRow = null;
    const res = await accountRouter.request("/merge/pending");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: null });
  });

  it("returns the row plus a counts-only summary and the target email, never the anon temp email or raw data", async () => {
    session = { user: { id: "target-1", email: "you@gmail.com" } };
    pendingRow = row();
    const res = await accountRouter.request("/merge/pending");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pending: {
        id: string;
        summary: {
          games: number;
          conversations: number;
          friends: number;
          statLines: number;
        };
      };
    };
    expect(body.pending.id).toBe("merge-1");
    expect(body.pending.summary).toEqual({
      games: 12,
      conversations: 3,
      friends: 2,
      statLines: 1,
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("anon-1");
    expect(raw).not.toContain("message");
  });
});

describe("POST /api/account/merge/:id/confirm", () => {
  it("403 when the caller is not the target user", async () => {
    session = { user: { id: "intruder" } };
    byId = row({ targetUserId: "target-1" });
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(mergeCalls).toHaveLength(0);
  });

  it("404 when the row does not exist", async () => {
    session = { user: { id: "target-1" } };
    byId = null;
    const res = await accountRouter.request("/merge/missing/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("409 when the row is already resolved (idempotent guard)", async () => {
    session = { user: { id: "target-1" } };
    byId = row({ status: "confirmed" });
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(409);
    expect(mergeCalls).toHaveLength(0);
  });

  it("merges then marks confirmed for the owning target", async () => {
    session = { user: { id: "target-1" } };
    byId = row();
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(mergeCalls).toEqual([{ anonId: "anon-1", targetId: "target-1" }]);
    expect(resolvedCalls).toEqual([{ id: "merge-1", status: "confirmed" }]);
  });
});

describe("POST /api/account/merge/:id/discard", () => {
  it("403 when the caller is not the target user", async () => {
    session = { user: { id: "intruder" } };
    byId = row();
    const res = await accountRouter.request("/merge/merge-1/discard", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(discardCalls).toHaveLength(0);
  });

  it("deletes anon data then marks discarded for the owning target", async () => {
    session = { user: { id: "target-1" } };
    byId = row();
    const res = await accountRouter.request("/merge/merge-1/discard", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(discardCalls).toEqual(["anon-1"]);
    expect(resolvedCalls).toEqual([{ id: "merge-1", status: "discarded" }]);
  });

  it("404 when the row does not exist", async () => {
    session = { user: { id: "target-1" } };
    byId = null;
    const res = await accountRouter.request("/merge/missing/discard", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(discardCalls).toHaveLength(0);
  });

  it("409 when the row is already resolved and never deletes a second time", async () => {
    session = { user: { id: "target-1" } };
    byId = row({ status: "discarded" });
    const res = await accountRouter.request("/merge/merge-1/discard", {
      method: "POST",
    });
    expect(res.status).toBe(409);
    expect(discardCalls).toHaveLength(0);
    expect(resolvedCalls).toHaveLength(0);
  });
});

describe("merge ownership and status ordering", () => {
  it("confirm checks ownership before status so a non-target on a resolved row gets 403 not 409", async () => {
    session = { user: { id: "intruder" } };
    byId = row({ status: "confirmed", targetUserId: "target-1" });
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(mergeCalls).toHaveLength(0);
    expect(resolvedCalls).toHaveLength(0);
  });

  it("discard checks ownership before status so a non-target on a resolved row gets 403 not 409", async () => {
    session = { user: { id: "intruder" } };
    byId = row({ status: "discarded", targetUserId: "target-1" });
    const res = await accountRouter.request("/merge/merge-1/discard", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(discardCalls).toHaveLength(0);
    expect(resolvedCalls).toHaveLength(0);
  });

  it("confirm reports the resolved status returned by markResolved", async () => {
    session = { user: { id: "target-1" } };
    byId = row();
    const res = await accountRouter.request("/merge/merge-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "confirmed" });
  });
});
