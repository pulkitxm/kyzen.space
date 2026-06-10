import { beforeEach, describe, expect, mock, test } from "bun:test";

type ProviderArgs = {
  limit: number;
  offset: number;
  customerId: string;
  q?: string;
};

const trendingCalls: ProviderArgs[] = [];
const searchCalls: ProviderArgs[] = [];

let trendingResult: { gifs: unknown[]; hasNext: boolean } | "throw" = {
  gifs: [],
  hasNext: false,
};
let searchResult: { gifs: unknown[]; hasNext: boolean } | "throw" = {
  gifs: [],
  hasNext: false,
};

mock.module("../src/services/gif-provider", () => ({
  trendingGifs: async (opts: ProviderArgs) => {
    trendingCalls.push(opts);
    if (trendingResult === "throw") throw new Error("klipy down");
    return trendingResult;
  },
  searchGifs: async (opts: ProviderArgs) => {
    searchCalls.push(opts);
    if (searchResult === "throw") throw new Error("klipy down");
    return searchResult;
  },
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

const { gifsRouter } = await import("../src/api/routes/gifs");

beforeEach(() => {
  trendingCalls.length = 0;
  searchCalls.length = 0;
  trendingResult = { gifs: [], hasNext: false };
  searchResult = { gifs: [], hasNext: false };
});

describe("GET /api/gifs/trending - limit clamp", () => {
  test("defaults to 24 when no limit is given", async () => {
    await gifsRouter.request("/trending");
    expect(trendingCalls[0]?.limit).toBe(24);
  });

  test("clamps a limit below 1 up to 1", async () => {
    await gifsRouter.request("/trending?limit=0");
    expect(trendingCalls[0]?.limit).toBe(1);
  });

  test("clamps a negative limit up to 1", async () => {
    await gifsRouter.request("/trending?limit=-5");
    expect(trendingCalls[0]?.limit).toBe(1);
  });

  test("accepts the lower bound 1 unchanged", async () => {
    await gifsRouter.request("/trending?limit=1");
    expect(trendingCalls[0]?.limit).toBe(1);
  });

  test("accepts the upper bound 50 unchanged", async () => {
    await gifsRouter.request("/trending?limit=50");
    expect(trendingCalls[0]?.limit).toBe(50);
  });

  test("clamps a limit above 50 down to 50", async () => {
    await gifsRouter.request("/trending?limit=51");
    expect(trendingCalls[0]?.limit).toBe(50);
  });

  test("clamps a very large limit down to 50", async () => {
    await gifsRouter.request("/trending?limit=100000");
    expect(trendingCalls[0]?.limit).toBe(50);
  });

  test("falls back to 24 for a non-numeric limit", async () => {
    await gifsRouter.request("/trending?limit=abc");
    expect(trendingCalls[0]?.limit).toBe(24);
  });
});

describe("GET /api/gifs/trending - offset floor", () => {
  test("defaults to offset 0", async () => {
    await gifsRouter.request("/trending");
    expect(trendingCalls[0]?.offset).toBe(0);
  });

  test("floors a negative offset to 0", async () => {
    await gifsRouter.request("/trending?offset=-3");
    expect(trendingCalls[0]?.offset).toBe(0);
  });

  test("floors a non-numeric offset to 0", async () => {
    await gifsRouter.request("/trending?offset=abc");
    expect(trendingCalls[0]?.offset).toBe(0);
  });

  test("passes a valid positive offset through", async () => {
    await gifsRouter.request("/trending?offset=48");
    expect(trendingCalls[0]?.offset).toBe(48);
  });
});

describe("GET /api/gifs/trending - response shape", () => {
  test("forwards the authenticated user id as customerId", async () => {
    await gifsRouter.request("/trending");
    expect(trendingCalls[0]?.customerId).toBe("viewer-1");
  });

  test("computes nextOffset as offset + limit when hasNext is true", async () => {
    trendingResult = { gifs: [{ id: "g1" }], hasNext: true };
    const res = await gifsRouter.request("/trending?limit=24&offset=24");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nextOffset: number | null };
    expect(body.nextOffset).toBe(48);
  });

  test("nextOffset is null when hasNext is false", async () => {
    trendingResult = { gifs: [], hasNext: false };
    const res = await gifsRouter.request("/trending");
    const body = (await res.json()) as { nextOffset: number | null };
    expect(body.nextOffset).toBeNull();
  });

  test("returns 502 GIF service unavailable when the provider throws", async () => {
    trendingResult = "throw";
    const res = await gifsRouter.request("/trending");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "GIF service unavailable" });
  });
});

describe("GET /api/gifs/search", () => {
  test("short-circuits an empty query to an empty page with no provider call", async () => {
    const res = await gifsRouter.request("/search?q=");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gifs: [], nextOffset: null });
    expect(searchCalls).toHaveLength(0);
  });

  test("short-circuits a whitespace-only query (trimmed) with no provider call", async () => {
    const res = await gifsRouter.request("/search?q=%20%20%20");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gifs: [], nextOffset: null });
    expect(searchCalls).toHaveLength(0);
  });

  test("short-circuits a missing query with no provider call", async () => {
    const res = await gifsRouter.request("/search");
    expect(res.status).toBe(200);
    expect(searchCalls).toHaveLength(0);
  });

  test("trims the query before forwarding it to the provider", async () => {
    await gifsRouter.request("/search?q=%20cats%20");
    expect(searchCalls[0]?.q).toBe("cats");
  });

  test("applies the same limit clamp on search", async () => {
    await gifsRouter.request("/search?q=cats&limit=999");
    expect(searchCalls[0]?.limit).toBe(50);
  });

  test("returns 502 when the search provider throws", async () => {
    searchResult = "throw";
    const res = await gifsRouter.request("/search?q=cats");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "GIF service unavailable" });
  });

  test("computes nextOffset on a search page with hasNext", async () => {
    searchResult = { gifs: [{ id: "s1" }], hasNext: true };
    const res = await gifsRouter.request("/search?q=cats&limit=10&offset=20");
    const body = (await res.json()) as { nextOffset: number | null };
    expect(body.nextOffset).toBe(30);
  });
});
