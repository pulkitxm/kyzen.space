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

  it("includes the deadline in the timeout error message", async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 7)).rejects.toThrow("timed out after 7ms");
  });

  it("resolves with an already-settled promise even at a 0ms deadline", async () => {
    await expect(withTimeout(Promise.resolve("instant"), 0)).resolves.toBe(
      "instant",
    );
  });

  it("clears the timer after a fast resolve so no late rejection fires", async () => {
    let lateError: string | null = null;
    const wrapped = withTimeout(Promise.resolve("ok"), 5);
    wrapped.catch((e: unknown) => {
      lateError = e instanceof Error ? e.message : "error";
    });
    const value = await wrapped;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(value).toBe("ok");
    expect(lateError).toBeNull();
  });
});
