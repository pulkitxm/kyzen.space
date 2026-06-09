import { clientFetchJson } from "@/lib/api-client";

type InviteLink = { token: string; url: string };

export async function createInviteLink(
  gameType: string,
  config?: Record<string, unknown>,
): Promise<InviteLink> {
  return clientFetchJson<InviteLink>("/api/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameType, config }),
  });
}
