"use client";

import type {
  GifMeta,
  MessageMetadata,
  SystemMeta,
} from "@gamelobby/chat-core";
import type { ReactNode } from "react";
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

// Split on http(s) URLs; the capture group lands matches on odd indices.
const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Render plaintext, turning bare URLs into clickable links. */
function linkify(text: string, own: boolean): ReactNode {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    // Trim trailing punctuation that's almost never part of the URL.
    const trailing = part.match(/[.,!?)]+$/)?.[0] ?? "";
    const href = trailing ? part.slice(0, -trailing.length) : part;
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: split output is positional and stable
      <span key={i}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "break-all underline underline-offset-2 hover:opacity-80",
            own ? "text-primary-foreground" : "text-primary",
          )}
        >
          {href}
        </a>
        {trailing}
      </span>
    );
  });
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
  const stamp = message.pending ? "Sending…" : timeOfDay(message.createdAt);

  const bubbleClass = cn(
    "rounded-2xl px-3.5 py-2 text-sm",
    own
      ? "bg-primary text-primary-foreground"
      : "bg-surface-overlay text-card-foreground",
    message.pending && "opacity-60",
  );

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
          "flex max-w-[min(42rem,85%)] flex-col gap-0.5",
          own ? "items-end" : "items-start",
        )}
      >
        {message.deletedAt ? (
          <div className={bubbleClass}>
            <em className="opacity-70">Message deleted</em>
          </div>
        ) : gif ? (
          // GIFs render edge-to-edge — no bubble background or padding.
          <>
            {/* biome-ignore lint/a11y/useAltText: alt provided via title */}
            <img
              src={gif.fullUrl}
              alt={gif.title ?? "GIF"}
              className={cn(
                "block h-auto w-full rounded-xl",
                message.pending && "opacity-60",
              )}
              style={{ maxWidth: 320 }}
            />
            <span className="px-1 text-[10px] text-muted-foreground">
              {stamp}
            </span>
          </>
        ) : (
          <div className={bubbleClass}>
            <span className="whitespace-pre-wrap break-words">
              {linkify(message.body ?? "", own)}
            </span>
            <div
              className={cn(
                "mt-0.5 text-[10px]",
                own ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {stamp}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
