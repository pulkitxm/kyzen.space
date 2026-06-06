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

export type AckResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type Ack<T = Record<string, never>> = (res: AckResult<T>) => void;

export type ClientSendMessage = {
  conversationId: string;
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

export type ServerPresenceSnapshot = {
  entries: ServerPresenceUpdate[];
};
