import type { ConversationJson, MessageJson } from "@gamelobby/chat-core";
import type { GameJson, MoveJson } from "@gamelobby/games-core";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { serverFetchJson } from "@/lib/api-server";
import {
  CHAT_LAYOUT_COOKIE,
  type ChatLayout,
  normalizeChatLayout,
  parseChatLayoutCookie,
} from "@/lib/chat-layout";
import { getServerSession } from "@/lib/get-server-session";
import { PlayClient } from "./play-client";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PlayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!UUID_RE.test(gameId)) notFound();

  const session = await getServerSession();
  if (!session?.user) redirect("/auth");

  const data = await serverFetchJson<{ game: GameJson; moves: MoveJson[] }>(
    `/api/games/${gameId}`,
  );
  if (!data) notFound();

  // Pull in the linked conversation (if any, and if the viewer can see it).
  let conversation: ConversationJson | null = null;
  let messages: MessageJson[] = [];
  let nextCursor: string | null = null;
  if (data.game.conversationId) {
    const conv = await serverFetchJson<{ conversation: ConversationJson }>(
      `/api/conversations/${data.game.conversationId}`,
    );
    if (conv) {
      conversation = conv.conversation;
      const msgs = await serverFetchJson<{
        messages: MessageJson[];
        nextCursor: string | null;
      }>(`/api/conversations/${data.game.conversationId}/messages?limit=20`);
      messages = msgs?.messages ?? [];
      nextCursor = msgs?.nextCursor ?? null;
    }
  }

  // Resolve the initial chat layout for flash-free SSR. The cookie mirrors the
  // client's localStorage (written on every change + by the boot script), so
  // when present it's the trusted source. Only when it's absent (e.g. first
  // load on a new device) do we fall back to the DB (an extra fetch).
  const layoutCookie = (await cookies()).get(CHAT_LAYOUT_COOKIE)?.value;
  const layoutTrusted =
    typeof layoutCookie === "string" && layoutCookie.length > 0;
  let initialLayout = parseChatLayoutCookie(layoutCookie);
  if (!layoutTrusted) {
    const me = await serverFetchJson<{
      profile: { chatLayout: ChatLayout | null };
    }>("/api/profiles/me");
    if (me?.profile?.chatLayout)
      initialLayout = normalizeChatLayout(me.profile.chatLayout);
  }

  return (
    <PlayClient
      gameId={gameId}
      userId={session.user.id}
      gameType={data.game.gameType}
      initialGame={data.game}
      initialMoves={data.moves}
      conversation={conversation}
      initialMessages={messages}
      initialNextCursor={nextCursor}
      initialLayout={initialLayout}
      layoutTrusted={layoutTrusted}
    />
  );
}
