import { USERNAME_MAX_LENGTH } from "@kyzen/shared/constants";
import { normalizeUsername } from "@kyzen/shared/types";

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
