"use client";

import type { GameJson } from "@kyzen/shared/types";
import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import { useEffect, useState } from "react";
import { FaCheck, FaRegCopy, FaUserCheck } from "react-icons/fa6";

export function WaitingForOpponentOverlay({
  gameId,
  game,
}: {
  gameId: string;
  game: GameJson;
}) {
  const [previousStatus, setPreviousStatus] = useState(game.status);
  const [justJoined, setJustJoined] = useState(false);

  if (previousStatus !== game.status) {
    setPreviousStatus(game.status);
    if (previousStatus === "waiting" && game.status === "active") {
      setJustJoined(true);
    }
  }

  useEffect(() => {
    if (!justJoined) return;
    const timer = setTimeout(() => setJustJoined(false), 1500);
    return () => clearTimeout(timer);
  }, [justJoined]);

  const waiting = game.status === "waiting";
  const open = waiting || justJoined;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-4">
      <LazyMotion features={domAnimation}>
        <AnimatePresence>
          {open ? (
            <m.div
              key={justJoined ? "joined" : "waiting"}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.2 }}
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-6 text-center shadow-xl"
            >
              {justJoined ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <FaUserCheck
                    size={32}
                    className="text-primary"
                    aria-hidden="true"
                  />
                  <p className="font-semibold text-foreground text-lg">
                    Game ready!
                  </p>
                </div>
              ) : (
                <WaitingRoomInvite gameId={gameId} />
              )}
            </m.div>
          ) : null}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}

function WaitingRoomInvite({ gameId }: { gameId: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copy = async (kind: "code" | "link") => {
    const value =
      kind === "code"
        ? gameId
        : typeof window !== "undefined"
          ? window.location.href
          : gameId;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {}
  };

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
      <div className="mt-4 rounded-xl border border-border bg-background py-3 font-mono text-3xl text-foreground tracking-[0.4em]">
        {gameId}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => copy("code")}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay"
        >
          {copied === "code" ? (
            <FaCheck size={14} aria-hidden="true" />
          ) : (
            <FaRegCopy size={14} aria-hidden="true" />
          )}
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button
          type="button"
          onClick={() => copy("link")}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay"
        >
          {copied === "link" ? (
            <FaCheck size={14} aria-hidden="true" />
          ) : (
            <FaRegCopy size={14} aria-hidden="true" />
          )}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>
    </>
  );
}
