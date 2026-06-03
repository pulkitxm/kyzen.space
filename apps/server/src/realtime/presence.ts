import { CHAT_EVENTS, type PresenceStatus } from "@gamelobby/chat-core";
import type { Server as IOServer, Socket } from "socket.io";
import { conversations, friends, profiles } from "../db";
import { childLogger } from "../logger";
import { presenceStore } from "./presence-store";
import { emitToUser } from "./rooms";

const log = childLogger({ mod: "realtime:presence" });

type PresenceEntry = {
  userId: string;
  status: PresenceStatus;
  lastSeen: string | null;
};

export function isOnline(userId: string): Promise<boolean> {
  return presenceStore.isOnline(userId);
}

async function audienceFor(userId: string): Promise<string[]> {
  const audience = new Set<string>();
  const [friendIds, convIds] = await Promise.all([
    friends.acceptedFriendIds(userId),
    conversations.getConversationIdsForUser(userId),
  ]);
  for (const id of friendIds) audience.add(id);
  for (const cid of convIds) {
    const ids = await conversations.getMemberIds(cid);
    for (const id of ids) audience.add(id);
  }
  audience.delete(userId);
  return [...audience];
}

export async function handlePresenceConnect(
  io: IOServer,
  socket: Socket,
): Promise<void> {
  const userId = socket.data.userId;
  const { wasOnline } = await presenceStore.markOnline(userId, socket.id);
  const audience = await audienceFor(userId);

  const onlineSet = await presenceStore.onlineAmong(audience);
  const offlineIds = audience.filter((id) => !onlineSet.has(id));
  const lastSeen = await profiles.getLastSeen(offlineIds);
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
): Promise<void> {
  const userId = socket.data.userId;
  const { stillOnline } = await presenceStore.markOffline(userId, socket.id);
  if (stillOnline) return;

  const now = new Date();
  try {
    await profiles.touchLastSeen([userId], now);
  } catch (err) {
    log.error({ err, userId }, "touchLastSeen failed");
  }

  const audience = await audienceFor(userId);
  const mine: PresenceEntry = {
    userId,
    status: "offline",
    lastSeen: now.toISOString(),
  };
  for (const uid of audience) {
    emitToUser(io, uid, CHAT_EVENTS.presenceUpdate, mine);
  }
}
