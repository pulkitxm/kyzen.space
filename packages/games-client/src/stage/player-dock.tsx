"use client";

import type { AvatarConfig } from "@gamelobby/shared/types";
import { m, useReducedMotion } from "motion/react";
import { type ReactNode, useId } from "react";
import { Character } from "../ui/character";

export type StagePlayer = {
  userId: string;
  username: string;
  role: string;
  avatar?: AvatarConfig | null;
};

export function PlayerDock({
  players,
  activeRole,
  myUserId,
  onViewProfile,
  renderRoleBadge,
}: {
  players: StagePlayer[];
  activeRole: string | null;
  myUserId: string | null;
  onViewProfile?: (user: {
    username: string;
    avatar?: AvatarConfig | null;
  }) => void;
  renderRoleBadge?: (role: string) => ReactNode;
}) {
  const reduce = useReducedMotion();
  const ringId = useId();

  return (
    <div className="mb-5 flex items-stretch gap-3">
      {players.map((p) => {
        const isTurn = activeRole !== null && p.role === activeRole;
        const isMe = p.userId === myUserId;
        return (
          <div
            key={p.userId}
            className={[
              "relative flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors duration-300",
              isTurn
                ? "border-transparent bg-surface-overlay"
                : "border-border bg-surface-raised",
            ].join(" ")}
          >
            {isTurn ? (
              <m.span
                aria-hidden
                layoutId={ringId}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", duration: 0.5, bounce: 0.25 }
                }
                className="pointer-events-none absolute inset-0 rounded-xl shadow-sm ring-2 ring-primary/60"
              />
            ) : null}
            {!isMe && onViewProfile ? (
              <button
                type="button"
                aria-label={`View ${p.username}'s profile`}
                onClick={() =>
                  onViewProfile({ username: p.username, avatar: p.avatar })
                }
                className="shrink-0 rounded-full outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Character
                  config={p.avatar ?? null}
                  fallbackSeed={p.username}
                  alt={p.username}
                  size={36}
                  className="size-9 rounded-full"
                />
              </button>
            ) : (
              <Character
                config={p.avatar ?? null}
                fallbackSeed={p.username}
                alt={p.username}
                size={36}
                className="size-9 shrink-0 rounded-full"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {renderRoleBadge ? renderRoleBadge(p.role) : null}
                <span className="truncate font-medium text-card-foreground text-sm">
                  {p.username}
                  {isMe ? " (you)" : ""}
                </span>
              </div>
              {isTurn ? (
                <span className="text-muted-foreground text-xs">
                  {isMe ? "Your turn" : "Their turn"}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
