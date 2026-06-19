"use client";

import type { AvatarConfig, Mark, ProfileStats } from "@kyzen/shared/types";
import { FaCircleDot } from "react-icons/fa6";
import { Character } from "../../ui/character";
import { CountdownRing } from "../../ui/countdown-ring";
import { TttMark } from "./marks";

export type CardPlayer = {
  userId: string;
  username: string;
  role: string;
  avatar?: AvatarConfig | null;
  stats?: ProfileStats | null;
};

function asMark(role: string): Mark | null {
  return role === "X" || role === "O" ? role : null;
}

function Avatar({
  player,
  isMe,
  size,
  onViewProfile,
}: {
  player: CardPlayer;
  isMe: boolean;
  size: number;
  onViewProfile?: (user: {
    username: string;
    avatar?: AvatarConfig | null;
  }) => void;
}) {
  if (!isMe && onViewProfile) {
    return (
      <button
        type="button"
        aria-label={`View ${player.username}'s profile`}
        onClick={() =>
          onViewProfile({ username: player.username, avatar: player.avatar })
        }
        className="rounded-full outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Character
          config={player.avatar ?? null}
          fallbackSeed={player.username}
          alt={player.username}
          size={size}
          className="rounded-full"
        />
      </button>
    );
  }
  return (
    <Character
      config={player.avatar ?? null}
      fallbackSeed={player.username}
      alt={player.username}
      size={size}
      className="rounded-full"
    />
  );
}

export function PlayerCard({
  player,
  variant,
  isTurn,
  isMe,
  isWinner,
  online,
  turnDeadline = null,
  onViewProfile,
}: {
  player: CardPlayer;
  variant: "rail" | "strip";
  isTurn: boolean;
  isMe: boolean;
  isWinner: boolean;
  online: boolean;
  turnDeadline?: number | null;
  onViewProfile?: (user: {
    username: string;
    avatar?: AvatarConfig | null;
  }) => void;
}) {
  const mark = asMark(player.role);
  const tttStats = player.stats?.["tic-tac-toe"] ?? { played: 0, won: 0, lost: 0, drawn: 0 };
  const wins = tttStats.won;
  const winRate = tttStats.played > 0 ? Math.round((tttStats.won / tttStats.played) * 100) : 0;

  const frame = [
    "rounded-2xl border transition-colors",
    isTurn
      ? "border-primary/60 bg-surface-overlay shadow-[0_0_28px_-12px_var(--color-primary)]"
      : "border-border bg-surface-raised",
    isWinner ? "ring-2 ring-warning/70" : "",
  ].join(" ");

  if (variant === "strip") {
    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 ${frame}`}
      >
        <CountdownRing deadline={turnDeadline} active={isTurn} size={42}>
          <Avatar
            player={player}
            isMe={isMe}
            size={34}
            onViewProfile={onViewProfile}
          />
        </CountdownRing>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {mark ? <TttMark mark={mark} className="size-4 shrink-0" /> : null}
            <span className="truncate font-medium text-card-foreground text-sm">
              {player.username}
              {isMe ? " (you)" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span className="tabular-nums">{wins} {wins === 1 ? "win" : "wins"}</span>
            <span className="tabular-nums ml-2">{winRate}%</span>
          </div>
        </div>
        {isTurn ? (
          <span className="shrink-0 font-medium text-primary text-xs">
            {isMe ? "Your turn" : "Playing"}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 px-4 py-5 text-center ${frame}`}
    >
      <div className="relative">
        <CountdownRing
          deadline={turnDeadline}
          active={isTurn}
          size={84}
          stroke={4}
        >
          <Avatar
            player={player}
            isMe={isMe}
            size={68}
            onViewProfile={onViewProfile}
          />
        </CountdownRing>
        {mark ? (
          <span className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border border-border bg-surface-raised">
            <TttMark mark={mark} className="size-4" />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="max-w-48 truncate font-semibold text-card-foreground">
          {player.username}
          {isMe ? " (you)" : ""}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
          <FaCircleDot
            size={9}
            className={online ? "text-success" : "text-muted-foreground/50"}
            aria-hidden="true"
          />
          {online ? "Online" : "Offline"}
        </span>
      </div>

     <div className="w-full pt-1">
  <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2">
    <div className="text-center">
      <div className="font-semibold text-sm text-card-foreground tabular-nums">
        {wins}
      </div>
      <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        Wins
      </div>
    </div>

    <div className="h-8 w-px bg-border/70" />

    <div className="text-center">
      <div className="font-semibold text-sm text-card-foreground tabular-nums">
        {winRate}%
      </div>
      <div className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        Win %
      </div>
    </div>
  </div>
</div>
      {isTurn ? (
        <span className="font-medium text-primary text-xs">
          {isMe ? "Your move" : "Thinking…"}
        </span>
      ) : null}
    </div>
  );
}
