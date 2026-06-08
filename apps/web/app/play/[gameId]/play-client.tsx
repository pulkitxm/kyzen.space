"use client";

import {
  type GameClientProps,
  getGameClient,
  getGameSkeleton,
} from "@gamelobby/games-client";
import type {
  ConversationJson,
  GameJson,
  GameType,
  MessageJson,
} from "@gamelobby/shared/types";
import { Suspense } from "react";
import { ConversationView } from "@/app/chat/[handle]/conversation-view";
import { useProfilePopup } from "@/components/ui";
import { gameMusicSource } from "@/lib/audio/music-sources";
import { useGameAudioBridge } from "@/lib/audio/use-audio-bridge";
import type { ChatLayout } from "@/lib/chat-layout";
import { useSocket } from "@/lib/socket/socket-context";
import { GameChatSplit } from "./game-chat-split";
import { GameOverOverlay } from "./game-over-overlay";
import { GameSettingsGear } from "./game-settings-gear";

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
  initialGame: GameJson;
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
  const openProfile = useProfilePopup();

  useGameAudioBridge(gameMusicSource(gameType));

  const gameNode = GameClient ? (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">
      <Suspense fallback={<GameSkeleton />}>
        <GameClient
          gameId={gameId}
          userId={userId}
          socket={socket}
          connected={status === "connected"}
          initialGame={initialGame}
          initialMoves={initialMoves}
          onViewProfile={openProfile}
        />
      </Suspense>
    </div>
  ) : (
    <div className="p-6 text-center text-muted-foreground text-sm">
      This game type isn't supported here.
    </div>
  );

  const overlay = (
    <GameOverOverlay
      gameId={gameId}
      userId={userId}
      initialGame={initialGame}
    />
  );

  if (!conversation) {
    return (
      <div className="relative h-full min-h-0">
        {gameNode}
        <GameSettingsGear shifted={false} offset={0} />
        {overlay}
      </div>
    );
  }

  return (
    <>
      <GameChatSplit
        conversationId={conversation.id}
        initialLayout={initialLayout}
        layoutTrusted={layoutTrusted}
        game={gameNode}
        chat={(visible) => (
          <ConversationView
            key={conversation.id}
            userId={userId}
            visible={visible}
            initialConversation={conversation}
            initialMessages={initialMessages}
            initialNextCursor={initialNextCursor}
          />
        )}
      />
      {overlay}
    </>
  );
}
