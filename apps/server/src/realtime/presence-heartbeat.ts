import * as db from "@gamelobby/database";
import type { Server as IOServer } from "socket.io";
import { env } from "../env";
import { childLogger } from "../logger";
import type { PresenceStore } from "./presence-store";
import { presenceStore } from "./presence-store-instance";

const log = childLogger({ mod: "realtime:presence-heartbeat" });

export type HeartbeatDeps = {
  store: Pick<PresenceStore, "refresh">;
  touchLastSeen: (userIds: string[], when: Date) => Promise<void>;
};

function defaultDeps(): HeartbeatDeps {
  return {
    store: presenceStore,
    touchLastSeen: (userIds, when) => db.profiles.touchLastSeen(userIds, when),
  };
}

function localUserSockets(io: IOServer): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [, socket] of io.sockets.sockets) {
    const userId = socket.data.userId as string | undefined;
    if (userId) pairs.push([userId, socket.id]);
  }
  return pairs;
}

export async function refreshPresence(
  io: IOServer,
  deps: HeartbeatDeps = defaultDeps(),
): Promise<void> {
  const pairs = localUserSockets(io);
  await Promise.allSettled(
    pairs.map(([userId, socketId]) => deps.store.refresh(userId, socketId)),
  );
}

export async function persistLastSeen(
  io: IOServer,
  deps: HeartbeatDeps = defaultDeps(),
): Promise<void> {
  const userIds = new Set<string>();
  for (const [userId] of localUserSockets(io)) userIds.add(userId);
  if (userIds.size === 0) return;
  await deps.touchLastSeen([...userIds], new Date());
}

export function startPresenceHeartbeats(io: IOServer): () => void {
  const deps = defaultDeps();

  const refreshTimer = setInterval(() => {
    refreshPresence(io, deps).catch((err) =>
      log.error({ err }, "presence refresh tick failed"),
    );
  }, env.presenceHeartbeatMs);

  const persistTimer = setInterval(() => {
    persistLastSeen(io, deps).catch((err) =>
      log.error({ err }, "last-seen persist tick failed"),
    );
  }, env.presenceLastSeenPersistMs);

  refreshTimer.unref?.();
  persistTimer.unref?.();

  return () => {
    clearInterval(refreshTimer);
    clearInterval(persistTimer);
  };
}
