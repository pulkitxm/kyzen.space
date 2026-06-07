"use client";

import {
  type GameClientProps,
  getGameClient,
  getGameSkeleton,
} from "@gamelobby/games-client";
import { MONOPOLY } from "@gamelobby/shared/constants";
import type {
  ConversationJson,
  GameType,
  MessageJson,
} from "@gamelobby/shared/types";
import { Suspense } from "react";
import { ConversationView } from "@/app/chat/[handle]/conversation-view";
import type { ChatLayout } from "@/lib/chat-layout";
import { useSocket } from "@/lib/socket/socket-context";
import { GameChatSplit } from "./game-chat-split";

export function PlayClient({
  gameId,
  userId,
  gameType,
  initialGame,
  initialMoves,
  conversation,
  initialMessages,
  initialNextCursor,
  initialLayout,
  layoutTrusted,
}: {
  gameId: string;
  userId: string;
  gameType: GameType;
  initialGame: GameClientProps["initialGame"];
  initialMoves: GameClientProps["initialMoves"];
  conversation: ConversationJson | null;
  initialMessages: MessageJson[];
  initialNextCursor: string | null;
  initialLayout: ChatLayout;
  layoutTrusted: boolean;
}) {
  const GameClient = getGameClient(gameType);
  const GameSkeleton = getGameSkeleton(gameType);
  const { socket, status } = useSocket();

  const gameNode = GameClient ? (
    <div
      className={`mx-auto flex h-full w-full flex-col p-4 ${gameType === MONOPOLY ? "max-w-6xl" : "max-w-2xl"}`}
    >
      <Suspense fallback={<GameSkeleton />}>
        <GameClient
          gameId={gameId}
          userId={userId}
          socket={socket}
          connected={status === "connected"}
          initialGame={initialGame}
          initialMoves={initialMoves}
        />
      </Suspense>
    </div>
  ) : (
    <div className="p-6 text-center text-muted-foreground text-sm">
      This game type isn't supported here.
    </div>
  );

  if (!conversation) {
    return <div className="h-full min-h-0">{gameNode}</div>;
  }

  return (
    <GameChatSplit
      conversationId={conversation.id}
      initialLayout={initialLayout}
      layoutTrusted={layoutTrusted}
      game={gameNode}
      chat={
        <ConversationView
          key={conversation.id}
          userId={userId}
          initialConversation={conversation}
          initialMessages={initialMessages}
          initialNextCursor={initialNextCursor}
        />
      }
    />
  );
}
