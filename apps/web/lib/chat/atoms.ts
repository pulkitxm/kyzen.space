import type {
  ConversationJson,
  FriendshipJson,
  GifJson,
  MessageJson,
  NotificationJson,
  TypingUser,
} from "@gamelobby/shared/types";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { atomFamily } from "jotai-family";

export const recentEmojisAtom = atomWithStorage<string[]>(
  "gl-recent-emojis",
  [],
);

export type GifCacheEntry = { gifs: GifJson[]; nextOffset: number | null };
export const gifCacheAtom = atom<Map<string, GifCacheEntry>>(new Map());

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

export const activeConversationIdAtom = atom<string | null>(null);

export type PresenceInfo = { online: boolean; lastSeen: string | null };
export const presenceAtom = atom<Map<string, PresenceInfo>>(new Map());
export const typingAtomFamily = atomFamily((_conversationId: string) =>
  atom<TypingUser[]>([]),
);

export const totalUnreadAtom = atom((get) =>
  get(conversationsAtom).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
);
export const conversationUnreadAtomFamily = atomFamily(
  (conversationId: string) =>
    atom(
      (get) =>
        get(conversationsAtom).find((c) => c.id === conversationId)
          ?.unreadCount ?? 0,
    ),
);
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

export function upsertFriend(
  list: FriendshipJson[],
  friendship: FriendshipJson,
): FriendshipJson[] {
  return [friendship, ...list.filter((f) => f.user.id !== friendship.user.id)];
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
