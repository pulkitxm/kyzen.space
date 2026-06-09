import type { AvatarConfig } from "@gamelobby/avatar";
import type { z } from "zod";
import type {
  gameCardMetaSchema,
  gifMetaSchema,
  notificationPayloadSchema,
} from "./schemas";

export type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: AvatarConfig | null;
};

export type FriendStatus = "pending" | "accepted" | "declined";

export type FriendshipJson = {
  id: string;
  status: FriendStatus;
  direction: "incoming" | "outgoing";
  user: PublicUser;
  createdAt: string | null;
};

export type FriendState = "none" | "friends" | "incoming" | "outgoing" | "self";

export type SearchUserJson = PublicUser & {
  friendState: FriendState;
};

export type ConversationKind = "dm" | "group";

export type MemberRole = "owner" | "admin" | "member";

export type MemberJson = PublicUser & {
  role: MemberRole;
};

export type MessageKind = "text" | "gif" | "game_card" | "system";

export type GifMeta = z.infer<typeof gifMetaSchema>;

export type GameCardMeta = z.infer<typeof gameCardMetaSchema>;

export type SystemEvent =
  | "member_added"
  | "member_removed"
  | "member_left"
  | "group_renamed"
  | "group_created";

export type SystemMeta = {
  event: SystemEvent;
  actorId?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
};

export type MessageMetadata = GifMeta | GameCardMeta | SystemMeta;

export type MessageJson = {
  id: string;
  conversationId: string;
  sender: PublicUser | null;
  kind: MessageKind;
  body: string | null;
  metadata: MessageMetadata | null;
  gameId: string | null;
  createdAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
};

export type ConversationJson = {
  id: string;
  kind: ConversationKind;
  name: string | null;
  avatarUrl: string | null;
  members: MemberJson[];
  lastMessage: MessageJson | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string | null;
};

export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "game_started"
  | "game_challenge";

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export type NotificationJson = {
  id: string;
  type: NotificationType;
  actor: PublicUser | null;
  payload: NotificationPayload;
  read: boolean;
  createdAt: string | null;
};

export type GifJson = {
  id: string;
  previewUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  title?: string;
  blurPreview?: string;
};

export type TypingUser = {
  userId: string;
  username: string;
  avatar: AvatarConfig | null;
};

export type PresenceStatus = "online" | "offline";
