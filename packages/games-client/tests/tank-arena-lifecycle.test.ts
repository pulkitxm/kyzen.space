import { describe, expect, test } from "bun:test";
import {
  type ArenaMount,
  type ArenaStatus,
  createArenaLifecycle,
  RESTORE_TIMEOUT_MS,
} from "../src/games/tank-arena/arena-lifecycle";
import type { ArenaHandle } from "../src/games/tank-arena/view";

type Events = Parameters<ArenaMount>[0];

function harness(results: ("ok" | "fail")[] = ["ok", "ok", "ok"]) {
  const reports: { status: ArenaStatus; handle: ArenaHandle | null }[] = [];
  const handles: { id: number; disposed: number }[] = [];
  const events: Events[] = [];
  let timer: { callback: () => void; ms: number } | null = null;
  const lifecycle = createArenaLifecycle(
    (status, handle) => reports.push({ status, handle }),
    {
      set: (callback, ms) => {
        timer = { callback, ms };
        return 1;
      },
      clear: () => {
        timer = null;
      },
    },
  );
  const mount: ArenaMount = (next) => {
    events.push(next);
    if (results[events.length - 1] === "fail") return null;
    const record = { id: events.length, disposed: 0 };
    handles.push(record);
    return {
      dispose: () => {
        record.disposed += 1;
      },
    } as unknown as ArenaHandle;
  };
  return {
    lifecycle,
    mount,
    reports,
    handles,
    events,
    timer: () => timer,
    latest: () => events[events.length - 1],
  };
}

describe("arena lifecycle", () => {
  test("a lost context restores into a rebuilt scene", () => {
    const h = harness();
    h.lifecycle.start(h.mount);
    expect(h.reports.map((r) => r.status)).toEqual(["ready"]);
    h.latest()?.onContextLost();
    expect(h.reports.at(-1)).toEqual({ status: "restoring", handle: null });
    expect(h.timer()?.ms).toBe(RESTORE_TIMEOUT_MS);
    h.latest()?.onContextRestored();
    expect(h.handles[0]?.disposed).toBe(1);
    expect(h.events.length).toBe(2);
    expect(h.timer()).toBeNull();
    const last = h.reports.at(-1);
    expect(last?.status).toBe("ready");
    expect(last?.handle).not.toBeNull();
    expect(last?.handle).not.toBe(h.reports[0]?.handle);
  });

  test("a context that never comes back is rebuilt after a timeout", () => {
    const h = harness();
    h.lifecycle.start(h.mount);
    h.latest()?.onContextLost();
    h.timer()?.callback();
    expect(h.events.length).toBe(2);
    expect(h.reports.map((r) => r.status)).toEqual([
      "ready",
      "restoring",
      "ready",
    ]);
  });

  test("only failing to create a context is fatal", () => {
    const first = harness(["fail"]);
    first.lifecycle.start(first.mount);
    expect(first.reports).toEqual([{ status: "failed", handle: null }]);

    const later = harness(["ok", "fail"]);
    later.lifecycle.start(later.mount);
    later.latest()?.onContextLost();
    expect(later.reports.at(-1)?.status).toBe("restoring");
    later.latest()?.onContextRestored();
    expect(later.reports.at(-1)).toEqual({ status: "failed", handle: null });
  });

  test("disposing stops timers and ignores late context events", () => {
    const h = harness();
    h.lifecycle.start(h.mount);
    const events = h.latest();
    events?.onContextLost();
    h.lifecycle.dispose();
    expect(h.timer()).toBeNull();
    expect(h.handles[0]?.disposed).toBe(1);
    const count = h.reports.length;
    events?.onContextRestored();
    events?.onContextLost();
    expect(h.reports.length).toBe(count);
    expect(h.events.length).toBe(1);
  });
});
