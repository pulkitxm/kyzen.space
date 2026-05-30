import type { PresenceInfo } from "./atoms";
import { relativeTime } from "./format";

/** "last seen just now" / "last seen 5m ago" / "last seen Jan 4". */
export function lastSeenLabel(lastSeen: string | null | undefined): string {
  if (!lastSeen) return "Offline";
  const rt = relativeTime(lastSeen);
  if (rt === "now") return "last seen just now";
  if (/^\d+[mhd]$/.test(rt)) return `last seen ${rt} ago`;
  return `last seen ${rt}`;
}

/** Subtitle for a DM / friend: "Online" when online, else last-seen. */
export function presenceLabel(p: PresenceInfo | undefined): string {
  if (p?.online) return "Online";
  return lastSeenLabel(p?.lastSeen ?? null);
}

/** Count how many of these users are currently online (the viewer counts as online). */
export function onlineCount(
  presence: Map<string, PresenceInfo>,
  userIds: string[],
  viewerId: string,
): number {
  return userIds.filter((id) => id === viewerId || presence.get(id)?.online)
    .length;
}
