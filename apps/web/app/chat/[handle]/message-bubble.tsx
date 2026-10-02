"use client";

import "photoswipe/style.css";
import type {
  GameCardMeta,
  GifMeta,
  MessageMetadata,
  SystemMeta,
} from "@kyzen/shared/types";
import type { ReactNode } from "react";
import { PresenceAvatar } from "@/components/ui/avatar-stack";
import { ProfilePopupTrigger } from "@/components/ui/profile-popup";
import type { ChatMessage } from "@/lib/chat/atoms";
import { timeOfDay } from "@/lib/chat/format";
import { openImageLightbox } from "@/lib/chat/lightbox";
import { cn } from "@/lib/utils";
import { BlurImage } from "./blur-image";
import { GameCardMessage } from "./game-card-message";

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

function GifMessage({
  gif,
  pending,
  stamp,
}: {
  gif: GifMeta;
  pending?: boolean;
  stamp: string;
}) {
  const width = Math.min(320, gif.width > 0 ? gif.width : 320);
  const ratio =
    gif.width && gif.height ? `${gif.width} / ${gif.height}` : "1 / 1";
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void openImageLightbox({
            src: gif.fullUrl,
            width: gif.width,
            height: gif.height,
            alt: gif.title,
          })
        }
        aria-label={gif.title ? `Open GIF: ${gif.title}` : "Open GIF"}
        className={cn(
          "block max-w-full overflow-hidden rounded-xl outline-none transition hover:opacity-90",
          pending && "opacity-60",
        )}
        style={{ width }}
      >
        <BlurImage
          src={gif.fullUrl}
          blurPreview={gif.blurPreview}
          alt={gif.title ?? "GIF"}
          aspectRatio={ratio}
        />
      </button>
      <span className="px-1 pb-1.5 text-[10px] text-muted-foreground">
        {stamp}
      </span>
    </>
  );
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

function linkify(text: string, own: boolean): ReactNode {
  const seen = new Map<string, number>();
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    const trailing = part.match(/[.,!?)]+$/)?.[0] ?? "";
    const href = trailing ? part.slice(0, -trailing.length) : part;
    const occurrence = seen.get(part) ?? 0;
    seen.set(part, occurrence + 1);
    return (
      <span key={`${part}#${occurrence}`}>
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

  return (
    <div
      className={cn(
        "mb-1 flex items-end gap-2",
        own ? "justify-end" : "justify-start",
      )}
    >
      {own ? null : <MessageAvatar message={message} showAvatar={showAvatar} />}
      <div
        className={cn(
          "flex max-w-[min(42rem,85%)] flex-col gap-0.5",
          own ? "items-end" : "items-start",
        )}
      >
        <MessageContent message={message} userId={userId} own={own} />
      </div>
    </div>
  );
}

function MessageAvatar({
  message,
  showAvatar,
}: {
  message: ChatMessage;
  showAvatar: boolean;
}) {
  if (!showAvatar) return <span className="w-7 shrink-0" />;
  if (!message.sender)
    return <PresenceAvatar config={null} seed="?" size={28} />;
  return (
    <ProfilePopupTrigger user={message.sender} className="shrink-0">
      <PresenceAvatar
        config={message.sender.avatar}
        seed={message.sender.username}
        size={28}
      />
    </ProfilePopupTrigger>
  );
}

function MessageContent({
  message,
  userId,
  own,
}: {
  message: ChatMessage;
  userId: string;
  own: boolean;
}) {
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

  if (message.deletedAt)
    return (
      <div className={bubbleClass}>
        <em className="opacity-70">Message deleted</em>
      </div>
    );
  if (message.kind === "game_card" && message.gameId)
    return (
      <GameCardMessage
        gameId={message.gameId}
        meta={message.metadata as GameCardMeta}
        userId={userId}
      />
    );
  if (gif)
    return <GifMessage gif={gif} pending={message.pending} stamp={stamp} />;
  return (
    <div className={bubbleClass}>
      <span className="wrap-break-word whitespace-pre-wrap">
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
  );
}
