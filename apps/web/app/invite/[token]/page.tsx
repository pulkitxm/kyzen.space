import type { Metadata } from "next";
import { InviteFlow } from "./invite-flow";

export const metadata: Metadata = {
  title: "Join the game",
  description: "Accept your invite and start playing on GameLobby.",
};

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteFlow token={token} />;
}
