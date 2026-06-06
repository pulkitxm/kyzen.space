import * as db from "@gamelobby/database";
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type { PresenceStatus } from "@gamelobby/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { childLogger } from "../logger";
import type { PresenceStore } from "./presence-store";
import { presenceStore } from "./presence-store-instance";
import { emitToUser } from "./rooms";

const log = childLogger({ mod: "realtime:presence" });

type PresenceEntry = {
  userId: string;
  status: PresenceStatus;
  lastSeen: string | null;
};

export type PresenceDeps = {
  store: PresenceStore;
  acceptedFriendIds: (userId: string) => Promise<string[]>;
  conversationIdsForUser: (userId: string) => Promise<string[]>;
  memberIds: (conversationId: string) => Promise<string[]>;
  getLastSeen: (userIds: string[]) => Promise<Map<string, Date | null>>;
  touchLastSeen: (userIds: string[], when: Date) => Promise<void>;
};

function defaultDeps(): PresenceDeps {
  return {
    store: presenceStore,
    acceptedFriendIds: (userId) => db.friends.acceptedFriendIds(userId),
    conversationIdsForUser: (userId) =>
      db.conversations.getConversationIdsForUser(userId),
    memberIds: (conversationId) =>
      db.conversations.getMemberIds(conversationId),
    getLastSeen: (userIds) => db.profiles.getLastSeen(userIds),
    touchLastSeen: (userIds, when) => db.profiles.touchLastSeen(userIds, when),
  };
}

export function isOnline(userId: string): Promise<boolean> {
  return presenceStore.isOnline(userId);
}

async function audienceFor(
  userId: string,
  deps: PresenceDeps,
): Promise<string[]> {
  const audience = new Set<string>();
  const [friendIds, convIds] = await Promise.all([
    deps.acceptedFriendIds(userId),
    deps.conversationIdsForUser(userId),
  ]);
  for (const id of friendIds) audience.add(id);
  for (const cid of convIds) {
    const ids = await deps.memberIds(cid);
    for (const id of ids) audience.add(id);
  }
  audience.delete(userId);
  return [...audience];
}

export async function handlePresenceConnect(
  io: IOServer,
  socket: Socket,
  deps: PresenceDeps = defaultDeps(),
): Promise<void> {
  const userId = socket.data.userId;
  const { wasOnline } = await deps.store.markOnline(userId, socket.id);
  const audience = await audienceFor(userId, deps);

  const onlineSet = await deps.store.onlineAmong(audience);
  const offlineIds = audience.filter((id) => !onlineSet.has(id));
  const lastSeen = await deps.getLastSeen(offlineIds);
  const entries: PresenceEntry[] = audience.map(
    (id): PresenceEntry =>
      onlineSet.has(id)
        ? { userId: id, status: "online", lastSeen: null }
        : {
            userId: id,
            status: "offline",
            lastSeen: lastSeen.get(id)?.toISOString() ?? null,
          },
  );
  socket.emit(CHAT_EVENTS.presenceSnapshot, { entries });

  if (!wasOnline) {
    const mine: PresenceEntry = { userId, status: "online", lastSeen: null };
    for (const uid of audience) {
      emitToUser(io, uid, CHAT_EVENTS.presenceUpdate, mine);
    }
  }
}

export async function handlePresenceDisconnect(
  io: IOServer,
  socket: Socket,
  deps: PresenceDeps = defaultDeps(),
): Promise<void> {
  const userId = socket.data.userId;
  const { stillOnline } = await deps.store.markOffline(userId, socket.id);
  if (stillOnline) return;

  const now = new Date();
  try {
    await deps.touchLastSeen([userId], now);
  } catch (err) {
    log.error({ err, userId }, "touchLastSeen failed");
  }

  const audience = await audienceFor(userId, deps);
  const mine: PresenceEntry = {
    userId,
    status: "offline",
    lastSeen: now.toISOString(),
  };
  for (const uid of audience) {
    emitToUser(io, uid, CHAT_EVENTS.presenceUpdate, mine);
  }
}
