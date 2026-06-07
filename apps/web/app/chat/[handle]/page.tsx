import type { ConversationJson, MessageJson } from "@gamelobby/shared/types";
import { notFound, redirect } from "next/navigation";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";
import { ConversationView } from "./conversation-view";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  const { handle } = await params;

  const conv = UUID_RE.test(handle)
    ? await serverFetchJson<{ conversation: ConversationJson }>(
        `/api/conversations/${handle}`,
      )
    : await serverFetchJson<{ conversation: ConversationJson }>(
        `/api/conversations/with/${encodeURIComponent(handle)}`,
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
