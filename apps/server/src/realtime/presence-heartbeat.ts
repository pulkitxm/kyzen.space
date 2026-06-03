import type { Server as IOServer } from "socket.io";
import { profiles } from "../db";
import { env } from "../env";
import { childLogger } from "../logger";
import { presenceStore } from "./presence-store";

const log = childLogger({ mod: "realtime:presence-heartbeat" });

function localUserSockets(io: IOServer): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const [, socket] of io.sockets.sockets) {
    const userId = socket.data.userId as string | undefined;
    if (userId) pairs.push([userId, socket.id]);
  }
  return pairs;
}

export async function refreshPresence(io: IOServer): Promise<void> {
  const pairs = localUserSockets(io);
  await Promise.allSettled(
    pairs.map(([userId, socketId]) => presenceStore.refresh(userId, socketId)),
  );
}

export async function persistLastSeen(io: IOServer): Promise<void> {
  const userIds = new Set<string>();
  for (const [userId] of localUserSockets(io)) userIds.add(userId);
  if (userIds.size === 0) return;
  await profiles.touchLastSeen([...userIds], new Date());
}

export function startPresenceHeartbeats(io: IOServer): () => void {
  const refreshTimer = setInterval(() => {
    refreshPresence(io).catch((err) =>
      log.error({ err }, "presence refresh tick failed"),
    );
  }, env.presenceHeartbeatMs);

  const persistTimer = setInterval(() => {
    persistLastSeen(io).catch((err) =>
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
