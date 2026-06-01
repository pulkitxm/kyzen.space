"use client";

import type { ConversationJson, MessageJson } from "@gamelobby/chat-core";
import { ConversationView } from "@/app/chat/[handle]/conversation-view";
import type { ChatLayout } from "@/lib/chat-layout";
import { type GameClientProps, getGameClient } from "@/lib/game-clients";
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
  gameType: string;
  initialGame: GameClientProps["initialGame"];
  initialMoves: GameClientProps["initialMoves"];
  conversation: ConversationJson | null;
  initialMessages: MessageJson[];
  initialNextCursor: string | null;
  initialLayout: ChatLayout;
  layoutTrusted: boolean;
}) {
  const GameClient = getGameClient(gameType);

  const gameNode = GameClient ? (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">
      <GameClient
        gameId={gameId}
        userId={userId}
        initialGame={initialGame}
        initialMoves={initialMoves}
      />
    </div>
  ) : (
    <div className="p-6 text-center text-muted-foreground text-sm">
      This game type isn't supported here.
    </div>
  );

  // Legacy game with no conversation (or viewer can't see it) → game only.
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
