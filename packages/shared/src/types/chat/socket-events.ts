import type { z } from "zod";
import type {
  ConversationJson,
  FriendshipJson,
  MessageJson,
  NotificationJson,
  PresenceStatus,
  TypingUser,
} from "./dto";
import type {
  clientAddMembersSchema,
  clientConversationRefSchema,
  clientCreateDmSchema,
  clientCreateGameInConversationSchema,
  clientCreateGroupSchema,
  clientFriendRemoveSchema,
  clientFriendRequestSchema,
  clientFriendRespondSchema,
  clientMarkReadSchema,
  clientNotificationReadSchema,
  clientRematchSchema,
  clientRemoveMemberSchema,
  clientRenameGroupSchema,
  clientSendMessageSchema,
} from "./schemas";

export type AckResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type Ack<T = Record<string, never>> = (res: AckResult<T>) => void;

export type ClientSendMessage = z.infer<typeof clientSendMessageSchema>;

export type ClientConversationRef = z.infer<typeof clientConversationRefSchema>;

export type ClientMarkRead = z.infer<typeof clientMarkReadSchema>;

export type ClientCreateDm = z.infer<typeof clientCreateDmSchema>;

export type ClientCreateGroup = z.infer<typeof clientCreateGroupSchema>;

export type ClientAddMembers = z.infer<typeof clientAddMembersSchema>;

export type ClientRemoveMember = z.infer<typeof clientRemoveMemberSchema>;

export type ClientRenameGroup = z.infer<typeof clientRenameGroupSchema>;

export type ClientFriendRequest = z.infer<typeof clientFriendRequestSchema>;

export type ClientFriendRespond = z.infer<typeof clientFriendRespondSchema>;

export type ClientFriendRemove = z.infer<typeof clientFriendRemoveSchema>;

export type ClientNotificationRead = z.infer<
  typeof clientNotificationReadSchema
>;

export type ClientCreateGameInConversation = z.infer<
  typeof clientCreateGameInConversationSchema
>;

export type ClientRematch = z.infer<typeof clientRematchSchema>;

export type ServerRematchCreated = { newGameId: string };

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
