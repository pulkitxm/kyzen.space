"use client";

import type { GameJson } from "@kyzen/shared/types";
import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { FaUserCheck } from "react-icons/fa6";
import { cn } from "@/lib/utils";
import { InviteCode } from "./invite-code";
import { LobbyPanel, type LobbySettings } from "./lobby-panel";

function useJustJoined(status: GameJson["status"]): boolean {
  const [previousStatus, setPreviousStatus] = useState(status);
  const [justJoined, setJustJoined] = useState(false);

  if (previousStatus !== status) {
    setPreviousStatus(status);
    if (previousStatus === "waiting" && status === "active") {
      setJustJoined(true);
    }
  }

  useEffect(() => {
    if (!justJoined) return;
    const timer = setTimeout(() => setJustJoined(false), 1500);
    return () => clearTimeout(timer);
  }, [justJoined]);

  return justJoined;
}

export function WaitingForOpponentOverlay({
  gameId,
  game,
  userId,
  lobby,
}: {
  gameId: string;
  game: GameJson;
  userId: string;
  lobby: LobbySettings | null;
}) {
  const justJoined = useJustJoined(game.status);
  const waiting = game.status === "waiting";

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {justJoined ? (
            <OverlayCard key="joined" wide={false}>
              <GameReady />
            </OverlayCard>
          ) : waiting ? (
            <OverlayCard key="waiting" wide={lobby !== null}>
              {lobby ? (
                <LobbyPanel
                  gameId={gameId}
                  game={game}
                  userId={userId}
                  lobby={lobby}
                />
              ) : (
                <WaitingRoomInvite gameId={gameId} />
              )}
            </OverlayCard>
          ) : null}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}

function OverlayCard({
  wide,
  children,
}: {
  wide: boolean;
  children: ReactNode;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
      className={cn(
        "pointer-events-auto w-full rounded-2xl border border-border bg-surface-raised text-center shadow-xl",
        wide ? "max-h-full max-w-md overflow-y-auto p-5" : "max-w-sm p-6",
      )}
    >
      {children}
    </m.div>
  );
}

function GameReady() {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <FaUserCheck size={32} className="text-primary" aria-hidden="true" />
      <p className="font-semibold text-foreground text-lg">Game ready!</p>
    </div>
  );
}

function WaitingRoomInvite({ gameId }: { gameId: string }) {
  return (
    <>
      <div className="mx-auto mb-4 flex size-14 items-center justify-center">
        <m.span
          className="absolute size-14 rounded-full border-4 border-primary/20"
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.6, 0.1, 0.6],
          }}
          transition={{
            duration: 1.6,
            repeat: Number.POSITIVE_INFINITY,
          }}
        />
        <m.span
          className="size-14 rounded-full border-4 border-transparent border-t-primary"
          animate={{ rotate: 360 }}
          transition={{
            duration: 1.1,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
        />
      </div>
      <h2 className="font-bold text-foreground text-xl">
        Waiting for players...
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        Share this code so a friend can join.
      </p>
      <InviteCode gameId={gameId} />
    </>
  );
}
