import type { MessageJson } from "@gamelobby/chat-core";

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function messagePreview(msg: MessageJson | null): string {
  if (!msg) return "No messages yet";
  if (msg.deletedAt) return "Message deleted";
  switch (msg.kind) {
    case "gif":
      return "GIF";
    case "game_card":
      return "🎮 Game session";
    case "system":
      return "Updated the conversation";
    default:
      return msg.body ?? "";
  }
}
