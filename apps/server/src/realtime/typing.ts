import { conversations, profiles } from "@gamelobby/database";
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import {
  clientConversationRefSchema,
  type TypingUser,
} from "@gamelobby/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { convRoom } from "./rooms";

type Entry = { user: TypingUser; timeout: ReturnType<typeof setTimeout> };
const typing = new Map<string, Map<string, Entry>>();
const TYPING_TTL_MS = 5000;

function convMap(conversationId: string): Map<string, Entry> {
  let m = typing.get(conversationId);
  if (!m) {
    m = new Map();
    typing.set(conversationId, m);
  }
  return m;
}

function broadcast(io: IOServer, conversationId: string): void {
  const m = typing.get(conversationId);
  const typers = m ? [...m.values()].map((e) => e.user) : [];
  io.to(convRoom(conversationId)).emit(CHAT_EVENTS.typingUpdate, {
    conversationId,
    typers,
  });
}

function clearTyper(conversationId: string, userId: string): boolean {
  const m = typing.get(conversationId);
  const e = m?.get(userId);
  if (!m || !e) return false;
  clearTimeout(e.timeout);
  m.delete(userId);
  if (m.size === 0) typing.delete(conversationId);
  return true;
}

export function attachTypingHandlers(io: IOServer, socket: Socket): void {
  const userId = socket.data.userId;
  const active = new Set<string>();

  socket.on(CHAT_EVENTS.typingStart, (payload: unknown) => {
    void (async () => {
      const parsed = clientConversationRefSchema.safeParse(payload);
      if (!parsed.success) return;
      const { conversationId } = parsed.data;
      if (!(await conversations.isMember(conversationId, userId))) return;
      const pub = await profiles.getPublicUser(userId);
      if (!pub) return;

      const m = convMap(conversationId);
      const existing = m.get(userId);
      if (existing) clearTimeout(existing.timeout);
      const timeout = setTimeout(() => {
        if (clearTyper(conversationId, userId)) broadcast(io, conversationId);
      }, TYPING_TTL_MS);
      m.set(userId, {
        user: { userId, username: pub.username, avatar: pub.avatar },
        timeout,
      });
      active.add(conversationId);
      broadcast(io, conversationId);
    })();
  });

  socket.on(CHAT_EVENTS.typingStop, (payload: unknown) => {
    const parsed = clientConversationRefSchema.safeParse(payload);
    if (!parsed.success) return;
    const { conversationId } = parsed.data;
    if (clearTyper(conversationId, userId)) {
      active.delete(conversationId);
      broadcast(io, conversationId);
    }
  });

  socket.on("disconnect", () => {
    for (const conversationId of active) {
      if (clearTyper(conversationId, userId)) broadcast(io, conversationId);
    }
    active.clear();
  });
}
