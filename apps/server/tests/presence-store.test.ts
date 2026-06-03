import { describe, expect, it } from "bun:test";
import { InMemoryPresenceStore } from "../src/realtime/presence-store";

describe("InMemoryPresenceStore", () => {
  it("reports a user online after markOnline and offline after the last markOffline", async () => {
    const store = new InMemoryPresenceStore();

    const first = await store.markOnline("u1", "s1");
    expect(first.wasOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(true);

    const second = await store.markOnline("u1", "s2");
    expect(second.wasOnline).toBe(true);

    const offA = await store.markOffline("u1", "s1");
    expect(offA.stillOnline).toBe(true);
    expect(await store.isOnline("u1")).toBe(true);

    const offB = await store.markOffline("u1", "s2");
    expect(offB.stillOnline).toBe(false);
    expect(await store.isOnline("u1")).toBe(false);
  });

  it("onlineAmong returns only the online subset", async () => {
    const store = new InMemoryPresenceStore();
    await store.markOnline("a", "s1");
    await store.markOnline("c", "s2");

    const online = await store.onlineAmong(["a", "b", "c"]);
    expect([...online].sort()).toEqual(["a", "c"]);
  });
});
