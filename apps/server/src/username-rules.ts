export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "api",
  "auth",
  "account",
  "chat",
  "friends",
  "games",
  "play",
  "profile",
  "settings",
  "ui",
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsernameFormat(normalized: string): boolean {
  return USERNAME_PATTERN.test(normalized);
}

export function isReservedUsername(normalized: string): boolean {
  return RESERVED_USERNAMES.has(normalized);
}

export function parseUsernameCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => normalizeUsername(entry))
    .filter((entry) => entry.length > 0);
}

export function slugifyBase(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, USERNAME_MAX_LENGTH) || "player"
  );
}

export function randomUsernameSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function buildUsernameCandidates(base: string, count: number): string[] {
  const candidates = [base];
  while (candidates.length < count) {
    candidates.push(`${base}_${randomUsernameSuffix()}`);
  }
  return candidates.slice(0, Math.max(1, count));
}

export function selectSuggestions(
  candidates: string[],
  unavailable: Set<string>,
  count: number,
): string[] {
  const picked: string[] = [];
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    const normalized = normalizeUsername(candidate);
    if (unavailable.has(normalized) || picked.includes(candidate)) continue;
    picked.push(candidate);
  }
  return picked;
}

export function usernameEditableAt(
  changedAt: Date | null,
  cooldownDays: number,
  now: Date,
): Date | null {
  if (!changedAt || cooldownDays <= 0) return null;
  const next = new Date(
    changedAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000,
  );
  return next.getTime() > now.getTime() ? next : null;
}
