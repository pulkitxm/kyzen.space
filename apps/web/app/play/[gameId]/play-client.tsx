"use client";

import {
  type GameClientProps,
  getGameClient,
  getGameSkeleton,
  useGameSession,
} from "@kyzen/games-client";
import { getDefinition, hasEngine } from "@kyzen/games-core";
import {
  type ConversationJson,
  type GameJson,
  type GameType,
  isBotId,
  type MessageJson,
  type MoveJson,
} from "@kyzen/shared/types";
import { useAtomValue } from "jotai";
import { Suspense, useCallback, useMemo } from "react";
import { ConversationView } from "@/app/chat/[handle]/conversation-view";
import { useProfilePopup } from "@/components/ui";
import { gameMusicSource } from "@/lib/audio/music-sources";
import { useGameAudioBridge } from "@/lib/audio/use-audio-bridge";
import type { ChatLayout } from "@/lib/chat-layout";
import { chatPanelMode } from "@/lib/games/match-chat";
import { resultDelayMs } from "@/lib/games/outcome";
import { socketStatusAtom, useSocket } from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";
import { GameChatSplit } from "./game-chat-split";
import { GameOverOverlay } from "./game-over-overlay";
import { GameSettingsGear } from "./game-settings-gear";
import type { LobbySettings } from "./lobby-panel";
import { MatchChatPanel } from "./match-chat-panel";
import { WaitingForOpponentOverlay } from "./waiting-overlay";

type ProfileUser = Parameters<NonNullable<GameClientProps["onViewProfile"]>>[0];

function lobbySettings(gameType: GameType): LobbySettings | null {
  if (!hasEngine(gameType)) return null;
  const { engine } = getDefinition(gameType);
  return engine.lobby
    ? {
        ...engine.lobby,
        minPlayers: engine.minPlayers,
        maxPlayers: engine.maxPlayers,
      }
    : null;
}

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
  const wide = hasEngine(gameType) && getDefinition(gameType).layout === "wide";
  const { socket } = useSocket();
  const status = useAtomValue(socketStatusAtom);
  const openProfile = useProfilePopup();
  const { game, moves, error, makeMove } = useGameSession({
    socket,
    userId,
    initialGame,
    initialMoves,
  });
  const viewerId = game.viewerId ?? userId;
  const players = game.players;

  useGameAudioBridge(gameMusicSource(gameType));

  const viewProfile = useCallback(
    (user: ProfileUser) => {
      if (
        players.some(
          (player) =>
            isBotId(player.userId) && player.username === user.username,
        )
      )
        return;
      openProfile(user);
    },
    [players, openProfile],
  );
  const onViewProfile = game.publicMatch ? undefined : viewProfile;

  const connected = status === "connected";
  const board = useMemo(
    () =>
      GameClient ? (
        <div
          className={cn(
            "flex h-full min-h-0 w-full flex-col",
            wide ? "p-2 md:p-3" : "mx-auto max-w-2xl p-4",
          )}
        >
          {game.gameState == null ? (
            <GameSkeleton />
          ) : (
            <Suspense fallback={<GameSkeleton />}>
              <GameClient
                userId={viewerId}
                connected={connected}
                game={game}
                moves={moves}
                makeMove={makeMove}
                onViewProfile={onViewProfile}
              />
            </Suspense>
          )}
        </div>
      ) : (
        <div className="p-6 text-center text-muted-foreground text-sm">
          This game type isn't supported here.
        </div>
      ),
    [
      GameClient,
      GameSkeleton,
      wide,
      viewerId,
      connected,
      game,
      moves,
      makeMove,
      onViewProfile,
    ],
  );

  const gameNode = (
    <div className="relative h-full min-h-0 w-full">
      {board}
      <WaitingForOpponentOverlay
        gameId={gameId}
        game={game}
        userId={viewerId}
        lobby={lobbySettings(gameType)}
      />
    </div>
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
      <GameOverOverlay
        gameId={gameId}
        userId={viewerId}
        game={game}
        conversation={conversation}
        resultDelayMs={resultDelayMs(game)}
      />
    </>
  );

  const chatMode = chatPanelMode(game, Boolean(conversation), viewerId);

  if (chatMode === "match") {
    return (
      <>
        <GameChatSplit
          conversationId={game.id}
          initialLayout={initialLayout}
          layoutTrusted={layoutTrusted}
          game={gameNode}
          chat={() => (
            <MatchChatPanel
              game={game}
              userId={viewerId}
              onViewProfile={onViewProfile}
            />
          )}
        />
        {overlay}
      </>
    );
  }

  if (chatMode === "none" || !conversation) {
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
