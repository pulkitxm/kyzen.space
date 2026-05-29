import {
  createProfile,
  getProfileByUserId,
  isUsernameTaken,
} from "./db/repositories/profiles";

function slugifyBase(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 30) || "player"
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Ensure a user has a profile with a unique username. Idempotent: returns the
 * existing username if a profile already exists. Used by the Better Auth
 * user-create hook so first sign-in provisions a profile without the frontend
 * ever touching the DB.
 */
export async function ensureUsernameForUser(
  userId: string,
  displayName: string | null | undefined,
): Promise<string> {
  const existing = await getProfileByUserId(userId);
  if (existing) return existing.username;

  const base = slugifyBase(displayName ?? "player");
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    if (!(await isUsernameTaken(candidate))) {
      try {
        const profile = await createProfile({ userId, username: candidate });
        return profile.username;
      } catch {
        // unique race — fall through and retry with a new suffix
      }
    }
    candidate = `${base}_${randomSuffix()}`;
  }
  candidate = `player_${randomSuffix()}`;
  const profile = await createProfile({ userId, username: candidate });
  return profile.username;
}
