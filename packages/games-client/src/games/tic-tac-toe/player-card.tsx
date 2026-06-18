"use client";

import type { AvatarConfig, Mark } from "@kyzen/shared/types";
import { FaCircleDot, FaFire, FaTrophy } from "react-icons/fa6";
import { Character } from "../../ui/character";
import { CountdownRing } from "../../ui/countdown-ring";
import { TttMark } from "./marks";
import { arenaStats } from "./mock-arena";

export type CardPlayer = {
  userId: string;
  username: string;
  role: string;
  avatar?: AvatarConfig | null;
};

function asMark(role: string): Mark | null {
  return role === "X" || role === "O" ? role : null;
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-semibold text-warning text-xs">
      <FaFire size={11} aria-hidden="true" />
      {streak}
    </span>
  );
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
  const stats = arenaStats(player.userId || player.username);

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
            <span className="tabular-nums">{stats.rating}</span>
            <span aria-hidden="true">·</span>
            <span>{stats.rank}</span>
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

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 font-semibold text-primary text-xs">
          <FaTrophy size={10} aria-hidden="true" />
          {stats.rank}
        </span>
        <StreakBadge streak={stats.streak} />
      </div>

      <div className="grid w-full grid-cols-2 gap-2 pt-1">
        <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-1.5">
          <div className="font-semibold text-card-foreground text-sm tabular-nums">
            {stats.rating}
          </div>
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">
            Rating
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/40 px-2 py-1.5">
          <div className="font-semibold text-card-foreground text-sm tabular-nums">
            {stats.winRate}%
          </div>
          <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">
            Win rate
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
