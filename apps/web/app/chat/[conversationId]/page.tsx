import type { ConversationJson, MessageJson } from "@gamelobby/chat-core";
import { notFound, redirect } from "next/navigation";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";
import { ConversationView } from "./conversation-view";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  const { conversationId } = await params;

  const [conv, msgs] = await Promise.all([
    serverFetchJson<{ conversation: ConversationJson }>(
      `/api/conversations/${conversationId}`,
    ),
    serverFetchJson<{ messages: MessageJson[]; nextCursor: string | null }>(
      `/api/conversations/${conversationId}/messages?limit=30`,
    ),
  ]);
  if (!conv) notFound();

  return (
    <ConversationView
      userId={session.user.id}
      initialConversation={conv.conversation}
      initialMessages={msgs?.messages ?? []}
    />
  );
}
