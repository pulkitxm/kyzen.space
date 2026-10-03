import { describe, expect, test } from "bun:test";
import { lockedGameCount, withGameLock } from "../src/realtime/game-lock";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withGameLock", () => {
  test("serializes transitions for the same game in arrival order", async () => {
    const log: string[] = [];
    const step = (name: string, ms: number) =>
      withGameLock("g1", async () => {
        log.push(`${name}:start`);
        await delay(ms);
        log.push(`${name}:end`);
        return name;
      });
    const results = await Promise.all([
      step("a", 15),
      step("b", 1),
      step("c", 5),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual([
      "a:start",
      "a:end",
      "b:start",
      "b:end",
      "c:start",
      "c:end",
    ]);
  });

  test("different games run concurrently", async () => {
    const log: string[] = [];
    await Promise.all([
      withGameLock("slow", async () => {
        log.push("slow:start");
        await delay(15);
        log.push("slow:end");
      }),
      withGameLock("fast", async () => {
        log.push("fast:start");
        log.push("fast:end");
      }),
    ]);
    expect(log.indexOf("fast:end")).toBeLessThan(log.indexOf("slow:end"));
  });

  test("a failed transition rejects its caller without blocking the next one", async () => {
    const failing = withGameLock("g2", async () => {
      throw new Error("boom");
    });
    const next = withGameLock("g2", async () => "after");
    await expect(failing).rejects.toThrow("boom");
    expect(await next).toBe("after");
  });

  test("idle games release their queue entry", async () => {
    await withGameLock("g3", async () => delay(1));
    await delay(0);
    expect(lockedGameCount()).toBe(0);
  });
});
