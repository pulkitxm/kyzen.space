import type { ConversationJson } from "@gamelobby/chat-core";
import { redirect } from "next/navigation";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";
import { ChatListClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  const data = await serverFetchJson<{ conversations: ConversationJson[] }>(
    "/api/conversations",
  );
  return (
    <ChatListClient
      userId={session.user.id}
      initialConversations={data?.conversations ?? []}
    />
  );
}
