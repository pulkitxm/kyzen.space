import { randomAvatarConfig } from "@gamelobby/avatar";
import { profiles } from "@gamelobby/database";
import {
  isReservedUsername,
  isValidUsernameFormat,
  normalizeUsername,
} from "@gamelobby/shared/types";
import { env } from "./env";
import { predictAvatarStyle } from "./services/gender-detection";
import {
  buildUsernameCandidates,
  randomUsernameSuffix,
  selectSuggestions,
  slugifyBase,
} from "./username-rules";

const CANDIDATE_COUNT = 20;
const BATCH_SIZE = 5;
const SUGGESTION_POOL = 30;

export function isUsernameBlocked(normalized: string): boolean {
  return (
    isReservedUsername(normalized) ||
    env.notAllowedUsernames.includes(normalized)
  );
}

export async function suggestUsernames(
  base: string,
  count = 5,
): Promise<string[]> {
  const candidates = buildUsernameCandidates(
    slugifyBase(base),
    SUGGESTION_POOL,
  ).filter((candidate) => {
    const normalized = normalizeUsername(candidate);
    return isValidUsernameFormat(normalized) && !isUsernameBlocked(normalized);
  });
  const taken = await profiles.getTakenUsernames(candidates);
  return selectSuggestions(candidates, taken, count);
}

export async function ensureUsernameForUser(
  userId: string,
  displayName: string | null | undefined,
): Promise<string> {
  const existing = await profiles.getProfileByUserId(userId);
  if (existing) return existing.username;

  const style = await predictAvatarStyle(displayName);
  const avatar = randomAvatarConfig(userId, style);
  const base = slugifyBase(displayName ?? "player");
  const candidates = buildUsernameCandidates(base, CANDIDATE_COUNT).filter(
    (candidate) => !isUsernameBlocked(normalizeUsername(candidate)),
  );

  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    const taken = await profiles.getTakenUsernames(batch);
    for (const candidate of batch) {
      if (taken.has(candidate.toLowerCase())) continue;
      try {
        const profile = await profiles.createProfile({
          userId,
          username: candidate,
          avatar,
        });
        return profile.username;
      } catch {}
    }
  }

  const fallback = `player_${randomUsernameSuffix()}`;
  const profile = await profiles.createProfile({
    userId,
    username: fallback,
    avatar,
  });
  return profile.username;
}
