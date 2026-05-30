"use client";

import type {
  GifMeta,
  MessageMetadata,
  SystemMeta,
} from "@gamelobby/chat-core";
import { PresenceAvatar } from "@/components/ui/avatar-stack";
import type { ChatMessage } from "@/lib/chat/atoms";
import { timeOfDay } from "@/lib/chat/format";
import { cn } from "@/lib/utils";

function systemText(
  meta: MessageMetadata | null,
  nameOf: (id?: string | null) => string,
): string {
  if (!meta || !("event" in meta)) return "Updated the conversation";
  const s = meta as SystemMeta;
  switch (s.event) {
    case "group_created":
      return `${nameOf(s.actorId)} created the group`;
    case "member_added":
      return `${nameOf(s.actorId)} added ${nameOf(s.targetId)}`;
    case "member_removed":
      return `${nameOf(s.actorId)} removed ${nameOf(s.targetId)}`;
    case "member_left":
      return `${nameOf(s.actorId)} left`;
    case "group_renamed":
      return `${nameOf(s.actorId)} renamed the group`;
    default:
      return "Updated the conversation";
  }
}

export function MessageBubble({
  message,
  userId,
  showAvatar,
  nameOf,
}: {
  message: ChatMessage;
  userId: string;
  showAvatar: boolean;
  nameOf: (id?: string | null) => string;
}) {
  if (message.kind === "system") {
    return (
      <div className="my-2 text-center text-muted-foreground text-xs">
        {systemText(message.metadata, nameOf)}
      </div>
    );
  }

  const own = message.sender?.id === userId;
  const gif =
    message.kind === "gif" ? (message.metadata as GifMeta | null) : null;

  return (
    <div
      className={cn(
        "mb-1 flex items-end gap-2",
        own ? "justify-end" : "justify-start",
      )}
    >
      {!own ? (
        showAvatar ? (
          <PresenceAvatar
            config={message.sender?.avatar ?? null}
            seed={message.sender?.username ?? "?"}
            size={28}
          />
        ) : (
          <span className="w-7 shrink-0" />
        )
      ) : null}
      <div
        className={cn(
          "max-w-[min(42rem,85%)] rounded-2xl px-3.5 py-2 text-sm",
          own
            ? "bg-primary text-primary-foreground"
            : "bg-surface-overlay text-card-foreground",
          message.pending && "opacity-60",
        )}
      >
        {message.deletedAt ? (
          <em className="opacity-70">Message deleted</em>
        ) : gif ? (
          // biome-ignore lint/a11y/useAltText: alt provided via title
          <img
            src={gif.previewUrl}
            alt={gif.title ?? "GIF"}
            className="rounded-lg"
            style={{ maxWidth: 220 }}
          />
        ) : (
          <span className="whitespace-pre-wrap break-words">
            {message.body}
          </span>
        )}
        <div
          className={cn(
            "mt-0.5 text-[10px]",
            own ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {message.pending ? "Sending…" : timeOfDay(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
