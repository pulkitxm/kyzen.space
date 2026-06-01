import type { AvatarConfig } from "@gamelobby/avatar";
import type { z } from "zod";
import type { gameCardMetaSchema, notificationPayloadSchema } from "./schemas";

/** A user as exposed to other users (no email/private fields). */
export type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: AvatarConfig | null;
};

export type FriendStatus = "pending" | "accepted" | "declined";

/** A friendship row, oriented from the viewer's perspective. */
export type FriendshipJson = {
  id: string;
  status: FriendStatus;
  /** Whether the pending request was sent to ("incoming") or by ("outgoing") the viewer. */
  direction: "incoming" | "outgoing";
  /** The other party (never the viewer). */
  user: PublicUser;
  createdAt: string | null;
};

export type FriendState = "none" | "friends" | "incoming" | "outgoing" | "self";

/** A user search hit, annotated with the viewer's relationship to them. */
export type SearchUserJson = PublicUser & {
  friendState: FriendState;
};

export type ConversationKind = "dm" | "group";

export type MemberRole = "owner" | "admin" | "member";

export type MemberJson = PublicUser & {
  role: MemberRole;
};

export type MessageKind = "text" | "gif" | "game_card" | "system";

/** Normalized GIF metadata stored on a `kind: "gif"` message. */
export type GifMeta = {
  provider: "klipy";
  providerId: string;
  previewUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  title?: string;
  blurPreview?: string;
};

/** Render snapshot stored on a `kind: "game_card"` message. The trailing fields
 *  are NOT persisted — the server resolves the game's live state onto the
 *  metadata when it assembles the message (and re-broadcasts on status change),
 *  so the card renders the correct status/winner on first paint with no client
 *  lookup. They are optional only for legacy/never-resolved messages.
 *  Shape + validation: see `gameCardMetaSchema`. */
export type GameCardMeta = z.infer<typeof gameCardMetaSchema>;

export type SystemEvent =
  | "member_added"
  | "member_removed"
  | "member_left"
  | "group_renamed"
  | "group_created";

/** Metadata stored on a `kind: "system"` message. */
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
  /** null for system messages. */
  sender: PublicUser | null;
  kind: MessageKind;
  /** Plaintext body for text/system messages; null otherwise. */
  body: string | null;
  metadata: MessageMetadata | null;
  /** Set when kind === "game_card". */
  gameId: string | null;
  createdAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
};

export type ConversationJson = {
  id: string;
  kind: ConversationKind;
  /** Group name, or — for DMs — the other member's display name/username. */
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
  /** The user who triggered the notification (null if system/unknown). */
  actor: PublicUser | null;
  payload: NotificationPayload;
  read: boolean;
  createdAt: string | null;
};

/** Provider-agnostic GIF returned by the backend GIF proxy. */
export type GifJson = {
  id: string;
  previewUrl: string;
  fullUrl: string;
  width: number;
  height: number;
  title?: string;
  blurPreview?: string;
};

/** A user actively typing in a conversation (carries avatar info for stacked avatars). */
export type TypingUser = {
  userId: string;
  username: string;
  avatar: AvatarConfig | null;
};

export type PresenceStatus = "online" | "offline";
