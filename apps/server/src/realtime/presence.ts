import { CHAT_EVENTS, type PresenceStatus } from "@gamelobby/chat-core";
import type { Server as IOServer, Socket } from "socket.io";
import { conversations, friends } from "../db";
import { emitToUser } from "./rooms";

type Presence = { sockets: Set<string>; lastSeen: number | null };

const presence = new Map<string, Presence>();

function entryFor(userId: string): Presence {
  let p = presence.get(userId);
  if (!p) {
    p = { sockets: new Set(), lastSeen: null };
    presence.set(userId, p);
  }
  return p;
}

export function isOnline(userId: string): boolean {
  return (presence.get(userId)?.sockets.size ?? 0) > 0;
}

function payloadFor(userId: string) {
  const online = isOnline(userId);
  const lastSeen = presence.get(userId)?.lastSeen ?? null;
  return {
    userId,
    status: (online ? "online" : "offline") as PresenceStatus,
    lastSeen: online || !lastSeen ? null : new Date(lastSeen).toISOString(),
  };
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
  const p = entryFor(userId);
  const wasOnline = p.sockets.size > 0;
  p.sockets.add(socket.id);

  const audience = await audienceFor(userId);

  socket.emit(CHAT_EVENTS.presenceSnapshot, {
    entries: audience.map(payloadFor),
  });

  if (!wasOnline) {
    const mine = payloadFor(userId);
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
  const p = presence.get(userId);
  if (!p) return;
  p.sockets.delete(socket.id);
  if (p.sockets.size > 0) return;

  p.lastSeen = Date.now();
  const audience = await audienceFor(userId);
  const mine = payloadFor(userId);
  for (const uid of audience) {
    emitToUser(io, uid, CHAT_EVENTS.presenceUpdate, mine);
  }
}
