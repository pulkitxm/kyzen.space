export const GUEST_SEEN_KEY = "gl:guest-seen";
export const GUEST_SNOOZE_KEY = "gl:guest-nudge-snooze";
export const GUEST_SNOOZE_MS = 24 * 60 * 60 * 1000;

export function decideGuestNudge(input: {
  isAnonymous: boolean;
  seen: string | null;
  snoozedUntil: number;
  now: number;
}): { show: boolean; markSeen: boolean } {
  if (!input.isAnonymous) return { show: false, markSeen: false };
  if (!input.seen) return { show: false, markSeen: true };
  if (input.now < input.snoozedUntil) return { show: false, markSeen: false };
  return { show: true, markSeen: false };
}

export function guestNudgeAllowedOn(pathname: string | null): boolean {
  return !pathname || !/^\/play(\/|$)/.test(pathname);
}
