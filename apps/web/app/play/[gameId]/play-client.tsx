"use client";

import {
  getGameClient,
  getGameSkeleton,
  useGameSession,
} from "@kyzen/games-client";
import type {
  ConversationJson,
  GameJson,
  GameType,
  MessageJson,
  MoveJson,
} from "@kyzen/shared/types";
import { useAtomValue } from "jotai";
import { Suspense, useMemo } from "react";
import { ConversationView } from "@/app/chat/[handle]/conversation-view";
import { useProfilePopup } from "@/components/ui";
import { gameMusicSource } from "@/lib/audio/music-sources";
import { useGameAudioBridge } from "@/lib/audio/use-audio-bridge";
import type { ChatLayout } from "@/lib/chat-layout";
import { socketStatusAtom, useSocket } from "@/lib/socket/socket-context";
import { GameChatSplit } from "./game-chat-split";
import { GameOverOverlay } from "./game-over-overlay";
import { GameSettingsGear } from "./game-settings-gear";
import { PublicMatchPanel } from "./public-match-panel";
import { WaitingForOpponentOverlay } from "./waiting-overlay";

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
  initialMoves: MoveJson[];
  conversation: ConversationJson | null;
  initialMessages: MessageJson[];
  initialNextCursor: string | null;
  initialLayout: ChatLayout;
  layoutTrusted: boolean;
}) {
  const GameClient = getGameClient(gameType);
  const GameSkeleton = getGameSkeleton(gameType);
  const { socket } = useSocket();
  const status = useAtomValue(socketStatusAtom);
  const openProfile = useProfilePopup();
  const { game, moves, error, makeMove } = useGameSession({
    socket,
    userId,
    initialGame,
    initialMoves,
  });

  useGameAudioBridge(gameMusicSource(gameType));

  const connected = status === "connected";
  const gameNode = useMemo(
    () =>
      GameClient ? (
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">
          <Suspense fallback={<GameSkeleton />}>
            <GameClient
              userId={userId}
              connected={connected}
              game={game}
              moves={moves}
              makeMove={makeMove}
              onViewProfile={game.publicMatch ? undefined : openProfile}
            />
          </Suspense>
        </div>
      ) : (
        <div className="p-6 text-center text-muted-foreground text-sm">
          This game type isn't supported here.
        </div>
      ),
    [
      GameClient,
      GameSkeleton,
      userId,
      connected,
      game,
      moves,
      makeMove,
      openProfile,
    ],
  );

  const overlay = (
    <>
      {error ? (
        <p
          role="alert"
          className="absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-card p-3 text-danger text-sm"
        >
          {error}
        </p>
      ) : null}
      <WaitingForOpponentOverlay gameId={gameId} game={game} />
      <GameOverOverlay
        gameId={gameId}
        userId={userId}
        game={game}
        conversation={conversation}
      />
    </>
  );

  if (game.publicMatch) {
    return (
      <>
        <GameChatSplit
          conversationId={game.id}
          initialLayout={initialLayout}
          layoutTrusted={layoutTrusted}
          game={gameNode}
          chat={() => <PublicMatchPanel game={game} userId={userId} />}
        />
        {overlay}
      </>
    );
  }

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
