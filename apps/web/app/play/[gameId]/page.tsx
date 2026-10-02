import {
  type ConversationJson,
  type GameJson,
  isGameCode,
  type MessageJson,
  type MoveJson,
  normalizeGameCode,
} from "@kyzen/shared/types";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Play",
  description: "Play a live multiplayer game with chat, side-by-side.",
};

export const dynamic = "force-dynamic";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!isGameCode(gameId)) notFound();
  const code = normalizeGameCode(gameId);
  if (code !== gameId) redirect(`/play/${code}`);

  const session = await getServerSession();
  if (!session?.user) redirect("/auth");

  const data = await serverFetchJson<{ game: GameJson; moves: MoveJson[] }>(
    `/api/games/${code}`,
  );
  if (!data) notFound();

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
      key={code}
      gameId={code}
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
