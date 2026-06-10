import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { Server as IOServer } from "socket.io";
import { env } from "../src/env";
import { runHealthProbe } from "../src/realtime/health";

const SETUP_HELP = [
  "Health-probe Redis integration tests need a reachable Redis and could not connect.",
  "Checklist:",
  "(1) REDIS_URL must be set (run via `bun --env-file=../../.env`);",
  "(2) Redis must be running and reachable at that URL;",
  "(3) `new Redis(REDIS_URL).ping()` must return PONG.",
].join(" ");

let pub: Redis;
let sub: Redis;
let io: IOServer;

beforeAll(async () => {
  if (!env.redisUrl) throw new Error(SETUP_HELP);
  pub = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 });
  sub = pub.duplicate();
  pub.on("error", () => {});
  sub.on("error", () => {});
  try {
    const pong = await pub.ping();
    if (pong !== "PONG") throw new Error("ping not PONG");
  } catch (err) {
    pub.disconnect();
    sub.disconnect();
    throw new Error(`${SETUP_HELP} (underlying error: ${String(err)})`);
  }
  io = new IOServer();
  io.adapter(createAdapter(pub, sub));
});

afterAll(async () => {
  await pub?.quit();
  await sub?.quit();
});

describe("health probe over real Redis", () => {
  it("returns ok when the broadcast publish is observed on redis", async () => {
    await expect(runHealthProbe(2000, { io, pub })).resolves.toBe("ok");
  });

  it("returns off when no redis pub client is configured", async () => {
    await expect(runHealthProbe(2000, { io, pub: null })).resolves.toBe("off");
  });

  it("returns error when the broadcast never reaches redis", async () => {
    const memoryIo = new IOServer();
    await expect(runHealthProbe(300, { io: memoryIo, pub })).resolves.toBe(
      "error",
    );
  });

  it("returns error when io is not attached", async () => {
    await expect(runHealthProbe(300, { io: null, pub })).resolves.toBe("error");
  });
});
