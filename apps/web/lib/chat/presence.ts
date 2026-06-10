import type { PresenceInfo } from "./atoms";
import { relativeTime } from "./format";

function lastSeenLabel(lastSeen: string | null | undefined): string | null {
  if (!lastSeen) return null;
  const rt = relativeTime(lastSeen);
  if (rt === "now") return "last seen just now";
  if (/^\d+[mhd]$/.test(rt)) return `last seen ${rt} ago`;
  return `last seen ${rt}`;
}

export function presenceLabel(p: PresenceInfo | undefined): string | null {
  if (p?.online) return "Online";
  return lastSeenLabel(p?.lastSeen ?? null);
}

export function onlineCount(
  presence: Map<string, PresenceInfo>,
  userIds: string[],
  viewerId: string,
): number {
  return userIds.filter((id) => id === viewerId || presence.get(id)?.online)
    .length;
}
