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
} from "@gamelobby/chat-core";
import { useStore } from "jotai";
import { useEffect } from "react";
import { clientFetchJson } from "@/lib/api-client";
import {
  activeConversationIdAtom,
  conversationsAtom,
  friendsAtom,
  incomingRequestsAtom,
  messagesAtomFamily,
  notificationsAtom,
  outgoingRequestsAtom,
  unreadNotificationsAtom,
  upsertConversation,
  upsertMessage,
} from "@/lib/chat/atoms";
import { useSocketEvent } from "@/lib/socket/socket-context";

/**
 * Bridges global socket events into Jotai atoms (and seeds those atoms on mount).
 * Mounted once inside the app shell so sidebar badges + lists stay live everywhere.
 */
export function ChatSocketBridge({ userId }: { userId: string }) {
  const store = useStore();

  useEffect(() => {
    let active = true;
    void (async () => {
      const [convs, fr, reqs, notifs] = await Promise.all([
        clientFetchJson<{ conversations: ConversationJson[] }>(
          "/api/conversations",
        ).catch(() => null),
        clientFetchJson<{ friends: FriendshipJson[] }>("/api/friends").catch(
          () => null,
        ),
        clientFetchJson<{
          incoming: FriendshipJson[];
          outgoing: FriendshipJson[];
        }>("/api/friends/requests").catch(() => null),
        clientFetchJson<{ count: number }>(
          "/api/notifications/unread-count",
        ).catch(() => null),
      ]);
      if (!active) return;
      if (convs) store.set(conversationsAtom, convs.conversations);
      if (fr) store.set(friendsAtom, fr.friends);
      if (reqs) {
        store.set(incomingRequestsAtom, reqs.incoming);
        store.set(outgoingRequestsAtom, reqs.outgoing);
      }
      if (notifs) store.set(unreadNotificationsAtom, notifs.count);
    })();
    return () => {
      active = false;
    };
  }, [store]);

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

  return null;
}
