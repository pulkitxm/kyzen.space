"use client";

import { listGameMeta } from "@kyzen/games-core";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  type GameCardMeta,
  type GameType,
  gameResultLabel,
  isGameOver,
} from "@kyzen/shared/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaGamepad } from "react-icons/fa6";
import { SeriesDetailModal } from "@/components/games/series-detail-modal";
import { SeriesScoreboard } from "@/components/games/series-scoreboard";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";

function gameName(gameType: GameType): string {
  return listGameMeta().find((m) => m.type === gameType)?.name ?? gameType;
}

function gameCardPresentation(
  gameId: string,
  meta: GameCardMeta,
  userId: string,
) {
  const status = meta.status ?? "waiting";
  const isPlayer = (meta.players ?? []).some(
    (player) => player.userId === userId,
  );
  const isChallenged = meta.challengedUserId === userId;
  let action = "Open";
  if (isGameOver(status)) action = "View";
  else if (isPlayer) action = "Open";
  else if (status === "active") action = "Spectate";
  else if (meta.seatingMode === "challenge")
    action = isChallenged ? "Accept" : "Spectate";
  else action = "Join";

  let statusText = "Waiting for a player";
  let tone = "bg-amber-500/15 text-amber-600";
  if (status === "active") {
    statusText = "In progress";
    tone = "bg-emerald-500/15 text-emerald-600";
  }

  const href =
    action === "Spectate" ? `/play/${gameId}?spectate=1` : `/play/${gameId}`;

  return { action, statusText, tone, href };
}

export function GameCardMessage({
  gameId,
  meta,
  userId,
}: {
  gameId: string;
  meta: GameCardMeta;
  userId: string;
}) {
  const { socket } = useSocket();
  const { openLayer } = useLayeredPopup();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);

  const status = meta.status ?? "waiting";
  const players = meta.players ?? [];
  const isPlayer = players.some((p) => p.userId === userId);
  const seriesScore = meta.seriesScore;
  const showSeries = (seriesScore?.totalGames ?? 0) >= 2;

  const canRematch = status === "completed" && isPlayer;
  const result = gameResultLabel(meta);
  const { action, statusText, tone, href } = gameCardPresentation(
    gameId,
    meta,
    userId,
  );

  async function onRematch() {
    setBusy(true);
    setRematchError(null);
    try {
      const res = await emitAck<{ gameId: string }>(
        socket,
        CHAT_EVENTS.rematch,
        { gameId },
      );
      router.push(`/play/${res.gameId}`);
    } catch (e) {
      setBusy(false);
      setRematchError(
        e instanceof Error ? e.message : "Couldn't start the rematch",
      );
    }
  }

  return (
    <div className="w-80 max-w-full rounded-2xl border border-border bg-surface-raised p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FaGamepad className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">
            {gameName(meta.gameType)}
          </div>
          {result ? (
            <div
              className="truncate text-muted-foreground text-xs"
              title={result}
            >
              {result}
            </div>
          ) : null}
        </div>
        {result ? null : (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px]", tone)}>
            {statusText}
          </span>
        )}
        <Link
          href={href}
          className="shrink-0 rounded-lg bg-primary px-3.5 py-1.5 font-medium text-primary-foreground text-xs outline-none transition hover:bg-primary-hover"
        >
          {action}
        </Link>
      </div>
      {showSeries && seriesScore ? (
        <div className="mt-3 flex flex-col gap-3 border-border border-t pt-3">
          <SeriesScoreboard score={seriesScore} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                openLayer({
                  title: "Series",
                  content: <SeriesDetailModal gameId={gameId} />,
                  size: "md",
                })
              }
              className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-overlay"
            >
              View series
            </button>
            {canRematch ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRematch}
                className="flex-1 rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs transition hover:bg-primary-hover disabled:opacity-50"
              >
                Rematch
              </button>
            ) : null}
          </div>
          {rematchError ? (
            <p className="text-danger text-xs">{rematchError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
