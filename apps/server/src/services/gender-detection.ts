import type { AvatarStyle } from "@gamelobby/avatar";
import { getGender } from "gender-detection-from-name";
import { env } from "../env";

const PROBABILITY_THRESHOLD = 0.7;
const REQUEST_TIMEOUT_MS = 2000;
const GENDERIZE_API_URL = "https://api.genderize.io/";

type GenderizeResponse = {
  gender?: "male" | "female" | null;
  probability?: number;
};

export function firstNameOf(
  displayName: string | null | undefined,
): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first.toLowerCase() : null;
}

export function genderToStyle(
  gender: string | null | undefined,
  probability: number,
): AvatarStyle | null {
  if (probability < PROBABILITY_THRESHOLD) return null;
  if (gender === "male") return "masculine";
  if (gender === "female") return "feminine";
  return null;
}

export function detectedToStyle(detected: string): AvatarStyle | null {
  if (detected === "male") return "masculine";
  if (detected === "female") return "feminine";
  return null;
}

async function genderizeStyle(firstName: string): Promise<AvatarStyle | null> {
  const apiKey = env.genderizeApiKey;
  if (!apiKey || env.nodeEnv === "test") return null;
  const url = new URL(GENDERIZE_API_URL);
  url.searchParams.set("name", firstName);
  url.searchParams.set("apikey", apiKey);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as GenderizeResponse;
  return genderToStyle(data.gender ?? null, data.probability ?? 0);
}

async function safeGenderizeStyle(
  firstName: string,
): Promise<AvatarStyle | null> {
  try {
    return await genderizeStyle(firstName);
  } catch {
    return null;
  }
}

export async function predictAvatarStyle(
  displayName: string | null | undefined,
): Promise<AvatarStyle> {
  const firstName = firstNameOf(displayName);
  if (!firstName) return "any";
  const fromApi = await safeGenderizeStyle(firstName);
  if (fromApi) return fromApi;
  return detectedToStyle(getGender(firstName)) ?? "any";
}
