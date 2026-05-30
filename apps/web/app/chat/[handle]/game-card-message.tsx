"use client";

import type { GameCardMeta } from "@gamelobby/chat-core";
import Link from "next/link";
import { FaGamepad } from "react-icons/fa";
import { useGameSummary } from "@/lib/chat/use-game-summary";
import { GAMES } from "@/lib/games";
import { cn } from "@/lib/utils";

function gameName(gameType: string): string {
  return GAMES.find((g) => g.id === gameType)?.name ?? gameType;
}

/**
 * In-chat game card. Live status (waiting/active/completed + winner) comes from
 * the shared game-summary atom; the action adapts to the viewer (Join/Accept/
 * Open/Spectate) and links to the side-by-side /play view.
 */
export function GameCardMessage({
  gameId,
  meta,
  userId,
}: {
  gameId: string;
  meta: GameCardMeta;
  userId: string;
}) {
  const summary = useGameSummary(gameId);
  const status = summary?.status ?? "waiting";
  const players = summary?.players ?? [];
  const isPlayer = players.some((p) => p.userId === userId);
  const isChallenged = meta.challengedUserId === userId;

  let action = "Open";
  if (status === "completed") action = "View";
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
  } else if (status === "completed") {
    tone = "bg-surface-overlay text-muted-foreground";
    statusText =
      summary?.winner === "draw"
        ? "Draw"
        : summary?.winner
          ? `${players.find((p) => p.userId === summary.winner)?.username ?? "Someone"} won`
          : "Finished";
  }

  const href =
    action === "Spectate" ? `/play/${gameId}?spectate=1` : `/play/${gameId}`;

  return (
    <div className="w-[min(20rem,85vw)] rounded-2xl border border-border bg-surface-raised p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FaGamepad className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">
            {gameName(meta.gameType)}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            Started by {meta.creatorUsername}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px]", tone)}>
          {statusText}
        </span>
        <Link
          href={href}
          className="rounded-lg bg-primary px-3.5 py-1.5 font-medium text-primary-foreground text-xs outline-none transition hover:bg-primary-hover"
        >
          {action}
        </Link>
      </div>
    </div>
  );
}
