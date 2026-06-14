import type { ConversationJson, MessageJson } from "@kyzen/shared/types";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ConversationView } from "@/app/chat/[handle]/conversation-view";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  return { title: decodeURIComponent(name) };
}

export default async function GroupConversationPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  const { name } = await params;

  const conv = await serverFetchJson<{ conversation: ConversationJson }>(
    `/api/conversations/group/${encodeURIComponent(name)}`,
  );
  if (!conv) notFound();

  const msgs = await serverFetchJson<{
    messages: MessageJson[];
    nextCursor: string | null;
  }>(`/api/conversations/${conv.conversation.id}/messages?limit=20`);

  return (
    <ConversationView
      key={conv.conversation.id}
      userId={session.user.id}
      initialConversation={conv.conversation}
      initialMessages={msgs?.messages ?? []}
      initialNextCursor={msgs?.nextCursor ?? null}
    />
  );
}
