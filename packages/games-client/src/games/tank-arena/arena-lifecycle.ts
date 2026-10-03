import type { ArenaHandle, ArenaMountOptions } from "./view";

export type ArenaStatus = "loading" | "ready" | "restoring" | "failed";

export type ArenaMount = (
  events: Pick<ArenaMountOptions, "onContextLost" | "onContextRestored">,
) => ArenaHandle | null;

type Timers = {
  set: (callback: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
};

export const RESTORE_TIMEOUT_MS = 5000;

const browserTimers: Timers = {
  set: (callback, ms) => globalThis.setTimeout(callback, ms),
  clear: (id) => globalThis.clearTimeout(id as number),
};

export function createArenaLifecycle(
  report: (status: ArenaStatus, handle: ArenaHandle | null) => void,
  timers: Timers = browserTimers,
) {
  let mount: ArenaMount | null = null;
  let handle: ArenaHandle | null = null;
  let timer: unknown = null;
  let closed = false;

  const stopTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  const open = () => {
    if (closed || !mount) return;
    handle = mount({ onContextLost: lose, onContextRestored: rebuild });
    if (handle) report("ready", handle);
    else report("failed", null);
  };

  function lose() {
    if (closed) return;
    stopTimer();
    report("restoring", null);
    timer = timers.set(rebuild, RESTORE_TIMEOUT_MS);
  }

  function rebuild() {
    if (closed) return;
    stopTimer();
    handle?.dispose();
    handle = null;
    open();
  }

  return {
    start: (next: ArenaMount) => {
      mount = next;
      open();
    },
    fail: () => {
      if (!closed) report("failed", null);
    },
    dispose: () => {
      closed = true;
      stopTimer();
      handle?.dispose();
      handle = null;
    },
  };
}
