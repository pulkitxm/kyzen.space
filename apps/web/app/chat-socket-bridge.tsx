"use client";

import {
  CHAT_EVENTS,
  type ConversationJson,
  type FriendshipJson,
  type ServerConversationNew,
  type ServerConversationUpdated,
  type ServerFriendAccepted,
  type ServerFriendDeclined,
  type ServerFriendRemoved,
  type ServerFriendRequest,
  type ServerMessageDeleted,
  type ServerMessageNew,
  type ServerMessageUpdated,
  type ServerNotificationNew,
  type ServerNotificationRead,
  type ServerPresenceSnapshot,
  type ServerPresenceUpdate,
  type ServerTypingUpdate,
} from "@gamelobby/chat-core";
import { useStore } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import {
  activeConversationIdAtom,
  conversationsAtom,
  friendsAtom,
  incomingRequestsAtom,
  messagesAtomFamily,
  notificationsAtom,
  outgoingRequestsAtom,
  presenceAtom,
  typingAtomFamily,
  unreadNotificationsAtom,
  upsertConversation,
  upsertMessage,
} from "@/lib/chat/atoms";
import { useSocketEvent } from "@/lib/socket/socket-context";

/**
 * Bridges global socket events into Jotai atoms (and seeds those atoms on mount).
 * Mounted once inside the app shell so sidebar badges + lists stay live everywhere.
 */
export function ChatSocketBridge({
  userId,
  initialConversations,
  initialFriends,
  initialIncoming,
  initialOutgoing,
  initialUnreadNotifications,
}: {
  userId: string;
  initialConversations: ConversationJson[];
  initialFriends: FriendshipJson[];
  initialIncoming: FriendshipJson[];
  initialOutgoing: FriendshipJson[];
  initialUnreadNotifications: number;
}) {
  const store = useStore();

  // Hydrate server-seeded chat state synchronously (no client fetch on load);
  // socket events keep these atoms live afterward.
  useHydrateAtoms(
    new Map<
      | typeof conversationsAtom
      | typeof friendsAtom
      | typeof incomingRequestsAtom
      | typeof outgoingRequestsAtom
      | typeof unreadNotificationsAtom,
      ConversationJson[] | FriendshipJson[] | number
    >([
      [conversationsAtom, initialConversations],
      [friendsAtom, initialFriends],
      [incomingRequestsAtom, initialIncoming],
      [outgoingRequestsAtom, initialOutgoing],
      [unreadNotificationsAtom, initialUnreadNotifications],
    ]),
  );

  useSocketEvent<ServerMessageNew>(
    CHAT_EVENTS.messageNew,
    ({ message, clientId }) => {
      const msg = clientId ? { ...message, clientId } : message;
      store.set(messagesAtomFamily(message.conversationId), (prev) =>
        upsertMessage(prev, msg),
      );
      const activeId = store.get(activeConversationIdAtom);
      store.set(conversationsAtom, (prev) => {
        const idx = prev.findIndex((c) => c.id === message.conversationId);
        if (idx < 0) return prev;
        const cur = prev[idx]!;
        const fromMe = message.sender?.id === userId;
        const isActive = activeId === message.conversationId;
        const updated: ConversationJson = {
          ...cur,
          lastMessage: message,
          lastMessageAt: message.createdAt,
          unreadCount:
            fromMe || isActive ? cur.unreadCount : cur.unreadCount + 1,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    },
  );

  useSocketEvent<ServerMessageUpdated>(
    CHAT_EVENTS.messageUpdated,
    ({ message }) => {
      store.set(messagesAtomFamily(message.conversationId), (prev) =>
        upsertMessage(prev, message),
      );
    },
  );

  useSocketEvent<ServerMessageDeleted>(
    CHAT_EVENTS.messageDeleted,
    ({ conversationId, messageId }) => {
      store.set(messagesAtomFamily(conversationId), (prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                body: null,
                metadata: null,
                deletedAt: new Date().toISOString(),
              }
            : m,
        ),
      );
    },
  );

  useSocketEvent<ServerConversationNew>(
    CHAT_EVENTS.conversationNew,
    ({ conversation }) => {
      store.set(conversationsAtom, (prev) =>
        upsertConversation(prev, conversation),
      );
    },
  );

  useSocketEvent<ServerConversationUpdated>(
    CHAT_EVENTS.conversationUpdated,
    ({ conversation }) => {
      // If I'm no longer a member (I left or was removed), drop it from my list.
      if (!conversation.members.some((m) => m.id === userId)) {
        store.set(conversationsAtom, (prev) =>
          prev.filter((c) => c.id !== conversation.id),
        );
        return;
      }
      store.set(conversationsAtom, (prev) =>
        upsertConversation(prev, conversation),
      );
    },
  );

  useSocketEvent<ServerFriendRequest>(
    CHAT_EVENTS.friendRequestNew,
    ({ friendship }) => {
      store.set(incomingRequestsAtom, (prev) => [
        friendship,
        ...prev.filter((f) => f.id !== friendship.id),
      ]);
    },
  );

  useSocketEvent<ServerFriendAccepted>(
    CHAT_EVENTS.friendAccepted,
    ({ friendship }) => {
      store.set(friendsAtom, (prev) => [
        friendship,
        ...prev.filter((f) => f.user.id !== friendship.user.id),
      ]);
      store.set(incomingRequestsAtom, (prev) =>
        prev.filter((f) => f.user.id !== friendship.user.id),
      );
      store.set(outgoingRequestsAtom, (prev) =>
        prev.filter((f) => f.user.id !== friendship.user.id),
      );
    },
  );

  useSocketEvent<ServerFriendDeclined>(CHAT_EVENTS.friendDeclined, ({ id }) => {
    store.set(outgoingRequestsAtom, (prev) => prev.filter((f) => f.id !== id));
  });

  useSocketEvent<ServerFriendRemoved>(
    CHAT_EVENTS.friendRemoved,
    ({ userId: removedId }) => {
      store.set(friendsAtom, (prev) =>
        prev.filter((f) => f.user.id !== removedId),
      );
    },
  );

  useSocketEvent<ServerNotificationNew>(
    CHAT_EVENTS.notificationNew,
    ({ notification }) => {
      store.set(notificationsAtom, (prev) =>
        [notification, ...prev].slice(0, 50),
      );
      store.set(unreadNotificationsAtom, (n) => n + 1);
    },
  );

  useSocketEvent<ServerNotificationRead>(
    CHAT_EVENTS.notificationReadEvent,
    ({ id, all }) => {
      if (all) {
        store.set(unreadNotificationsAtom, 0);
        store.set(notificationsAtom, (prev) =>
          prev.map((n) => ({ ...n, read: true })),
        );
        return;
      }
      if (id) {
        store.set(notificationsAtom, (prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
        );
        store.set(unreadNotificationsAtom, (n) => Math.max(0, n - 1));
      }
    },
  );

  useSocketEvent<ServerPresenceSnapshot>(
    CHAT_EVENTS.presenceSnapshot,
    ({ entries }) => {
      store.set(presenceAtom, (prev) => {
        const next = new Map(prev);
        for (const e of entries) {
          next.set(e.userId, {
            online: e.status === "online",
            lastSeen: e.lastSeen ?? null,
          });
        }
        return next;
      });
    },
  );

  useSocketEvent<ServerPresenceUpdate>(CHAT_EVENTS.presenceUpdate, (e) => {
    store.set(presenceAtom, (prev) => {
      const next = new Map(prev);
      next.set(e.userId, {
        online: e.status === "online",
        lastSeen: e.lastSeen ?? null,
      });
      return next;
    });
  });

  useSocketEvent<ServerTypingUpdate>(
    CHAT_EVENTS.typingUpdate,
    ({ conversationId, typers }) => {
      store.set(typingAtomFamily(conversationId), typers);
    },
  );

  return null;
}
