import type { z } from "zod";
import type {
  ConversationJson,
  FriendshipJson,
  MessageJson,
  MessageKind,
  MessageMetadata,
  NotificationJson,
  PresenceStatus,
  TypingUser,
} from "./dto";
import type { clientCreateGameInConversationSchema } from "./schemas";

/**
 * Canonical chat socket event names, shared by server and web so the two
 * can't drift. (Game events — join_room/make_move/game_state/... — stay in
 * games-core / the existing realtime layer.)
 */
export const CHAT_EVENTS = {
  // client -> server (mutations; each takes an ack callback)
  conversationJoin: "conversation:join",
  conversationLeave: "conversation:leave",
  sendMessage: "send_message",
  markRead: "conversation:read",
  createDm: "conversation:create_dm",
  createGroup: "conversation:create_group",
  addMembers: "conversation:add_members",
  removeMember: "conversation:remove_member",
  renameGroup: "conversation:rename",
  friendRequest: "friend:request",
  friendRespond: "friend:respond",
  friendRemove: "friend:remove",
  notificationRead: "notification:read",
  notificationReadAll: "notification:read_all",
  // phase 2
  typingStart: "typing_start",
  typingStop: "typing_stop",
  // phase 3 — create a game from inside a conversation (ack returns game+message)
  createGameInConversation: "game:create_in_conversation",

  // server -> client (broadcasts)
  messageNew: "message_new",
  messageUpdated: "message_updated",
  messageDeleted: "message_deleted",
  conversationNew: "conversation_new",
  conversationUpdated: "conversation_updated",
  friendRequestNew: "friend_request",
  friendAccepted: "friend_accepted",
  friendDeclined: "friend_declined",
  friendRemoved: "friend_removed",
  notificationNew: "notification_new",
  notificationReadEvent: "notification_read",
  readReceipt: "read_receipt",
  // phase 2
  typingUpdate: "typing_update",
  presenceUpdate: "presence_update",
  presenceSnapshot: "presence_snapshot",
} as const;

/** Ack callbacks resolve to a success payload or an error. */
export type AckResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type Ack<T = Record<string, never>> = (res: AckResult<T>) => void;

// ---- client -> server payloads ----

export type ClientSendMessage = {
  conversationId: string;
  /** Client-generated temp id, echoed back on message_new for optimistic reconcile. */
  clientId: string;
  kind?: MessageKind;
  body?: string;
  metadata?: MessageMetadata;
};

export type ClientConversationRef = { conversationId: string };

export type ClientMarkRead = { conversationId: string; messageId: string };

export type ClientCreateDm = { userId: string };

export type ClientCreateGroup = { name: string; memberIds: string[] };

export type ClientAddMembers = { conversationId: string; userIds: string[] };

export type ClientRemoveMember = { conversationId: string; userId: string };

export type ClientRenameGroup = { conversationId: string; name: string };

export type ClientFriendRequest = { username: string };

export type ClientFriendRespond = {
  requestId: string;
  action: "accept" | "decline";
};

export type ClientFriendRemove = { userId: string };

export type ClientNotificationRead = { id: string };

export type ClientCreateGameInConversation = z.infer<
  typeof clientCreateGameInConversationSchema
>;

// ---- server -> client payloads ----

export type ServerMessageNew = { message: MessageJson; clientId?: string };

export type ServerMessageUpdated = { message: MessageJson };

export type ServerMessageDeleted = {
  conversationId: string;
  messageId: string;
};

export type ServerConversationNew = { conversation: ConversationJson };

export type ServerConversationUpdated = { conversation: ConversationJson };

export type ServerFriendRequest = { friendship: FriendshipJson };

export type ServerFriendAccepted = { friendship: FriendshipJson };

export type ServerFriendDeclined = { id: string; userId: string };

export type ServerFriendRemoved = { userId: string };

export type ServerNotificationNew = { notification: NotificationJson };

export type ServerNotificationRead = { id?: string; all?: boolean };

export type ServerReadReceipt = {
  conversationId: string;
  userId: string;
  messageId: string;
};

export type ServerTypingUpdate = {
  conversationId: string;
  typers: TypingUser[];
};

export type ServerPresenceUpdate = {
  userId: string;
  status: PresenceStatus;
  lastSeen?: string | null;
};

/** Snapshot of the current presence of everyone the connecting user cares about
 * (their friends + conversation co-members), sent once on connect. */
export type ServerPresenceSnapshot = {
  entries: ServerPresenceUpdate[];
};
