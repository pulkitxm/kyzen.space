import { describe, expect, it } from "bun:test";
import { withTimeout } from "../src/lib/with-timeout";

describe("withTimeout", () => {
  it("resolves with the promise value when it settles before the deadline", async () => {
    await expect(withTimeout(Promise.resolve("fast"), 50)).resolves.toBe(
      "fast",
    );
  });

  it("propagates a rejection from the wrapped promise", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 50),
    ).rejects.toThrow("boom");
  });

  it("rejects once the deadline passes", async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 10)).rejects.toThrow("timed out after");
  });
});
