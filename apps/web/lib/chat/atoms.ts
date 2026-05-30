import type {
  ConversationJson,
  FriendshipJson,
  MessageJson,
  NotificationJson,
  TypingUser,
} from "@gamelobby/chat-core";
import { atom } from "jotai";
import { atomFamily } from "jotai-family";

/** A message in the client store; optimistic sends carry `pending` + `clientId`. */
export type ChatMessage = MessageJson & {
  pending?: boolean;
  clientId?: string;
};

export const conversationsAtom = atom<ConversationJson[]>([]);

export const messagesAtomFamily = atomFamily((_conversationId: string) =>
  atom<ChatMessage[]>([]),
);

export const friendsAtom = atom<FriendshipJson[]>([]);
export const incomingRequestsAtom = atom<FriendshipJson[]>([]);
export const outgoingRequestsAtom = atom<FriendshipJson[]>([]);

export const notificationsAtom = atom<NotificationJson[]>([]);
export const unreadNotificationsAtom = atom<number>(0);

/** The conversation currently open on screen (so we don't badge it as unread). */
export const activeConversationIdAtom = atom<string | null>(null);

// Phase 2 (typing / presence).
export type PresenceInfo = { online: boolean; lastSeen: string | null };
export const presenceAtom = atom<Map<string, PresenceInfo>>(new Map());
export const typingAtomFamily = atomFamily((_conversationId: string) =>
  atom<TypingUser[]>([]),
);

// Derived badges for the sidebar.
export const totalUnreadAtom = atom((get) =>
  get(conversationsAtom).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
);
export const pendingRequestCountAtom = atom(
  (get) => get(incomingRequestsAtom).length,
);

/** Upsert a message: replace an optimistic entry by clientId, else by id, else append. */
export function upsertMessage(
  list: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (incoming.clientId) {
    const i = list.findIndex(
      (m) => m.clientId && m.clientId === incoming.clientId,
    );
    if (i >= 0) {
      const copy = [...list];
      copy[i] = incoming;
      return copy;
    }
  }
  const byId = list.findIndex((m) => m.id === incoming.id);
  if (byId >= 0) {
    const copy = [...list];
    copy[byId] = incoming;
    return copy;
  }
  return [...list, incoming];
}

/** Move a conversation to the top with an updated preview/unread. */
export function bumpConversation(
  list: ConversationJson[],
  conversationId: string,
  patch: Partial<ConversationJson>,
): ConversationJson[] {
  const idx = list.findIndex((c) => c.id === conversationId);
  if (idx < 0) return list;
  const updated = { ...list[idx]!, ...patch };
  return [updated, ...list.filter((_, i) => i !== idx)];
}

export function upsertConversation(
  list: ConversationJson[],
  conversation: ConversationJson,
): ConversationJson[] {
  const idx = list.findIndex((c) => c.id === conversation.id);
  if (idx >= 0) {
    const copy = [...list];
    copy[idx] = conversation;
    return copy;
  }
  return [conversation, ...list];
}
