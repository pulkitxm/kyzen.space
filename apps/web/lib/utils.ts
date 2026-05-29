/** Join conditional class names (filters falsy). Shared by all UI primitives. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatTs(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function shortenId(id: string) {
  return id.slice(0, 8);
}

export function displayName(user: {
  name?: string | null;
  email?: string | null;
}): string | null {
  if (typeof user.name === "string" && user.name.trim()) return user.name.trim();
  if (typeof user.email === "string" && user.email.trim())
    return user.email.trim();
  return null;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function pluralUnit(n: number, unit: "second" | "minute" | "hour" | "day"): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * Elapsed time as a single human-readable amount (largest unit that fits: days → hours → minutes → seconds).
 */
/** "Member for" label from an ISO timestamp to now. Reads the clock here (not
 * in a component) so it stays out of React's render-purity analysis. */
export function memberForLabel(createdAtIso: string): string {
  return formatElapsedAsLargestUnit(Date.now() - new Date(createdAtIso).getTime());
}

export function formatElapsedAsLargestUnit(elapsedMs: number): string {
  const ms = Math.max(0, Math.floor(elapsedMs));
  if (ms >= MS_PER_DAY) {
    return pluralUnit(Math.floor(ms / MS_PER_DAY), "day");
  }
  if (ms >= MS_PER_HOUR) {
    return pluralUnit(Math.floor(ms / MS_PER_HOUR), "hour");
  }
  if (ms >= MS_PER_MINUTE) {
    return pluralUnit(Math.floor(ms / MS_PER_MINUTE), "minute");
  }
  return pluralUnit(Math.floor(ms / MS_PER_SECOND), "second");
}
