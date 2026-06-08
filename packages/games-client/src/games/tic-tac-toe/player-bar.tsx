"use client";

import type { AvatarConfig, Mark } from "@gamelobby/shared/types";
import { Character } from "../../ui/character";
import { TttMark } from "./marks";

type BarPlayer = {
  userId: string;
  username: string;
  role: string;
  avatar?: AvatarConfig | null;
};

function asMark(role: string): Mark | null {
  return role === "X" || role === "O" ? role : null;
}

export function PlayerBar({
  players,
  currentTurn,
  myUserId,
  active,
  onViewProfile,
}: {
  players: BarPlayer[];
  currentTurn: Mark;
  myUserId: string | null;
  active: boolean;
  onViewProfile?: (user: {
    username: string;
    avatar?: AvatarConfig | null;
  }) => void;
}) {
  return (
    <div className="mb-5 flex items-stretch gap-3">
      {players.map((p) => {
        const mark = asMark(p.role);
        const isTurn = active && mark !== null && mark === currentTurn;
        const isMe = p.userId === myUserId;
        return (
          <div
            key={p.userId}
            className={[
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 transition",
              isTurn
                ? "border-primary/60 bg-surface-overlay shadow-sm"
                : "border-border bg-surface-raised",
            ].join(" ")}
          >
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
                {mark ? (
                  <TttMark mark={mark} className="size-4 shrink-0" />
                ) : null}
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
