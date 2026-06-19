"use client";

import type { Mark } from "@kyzen/shared/types";
import { FaEye, FaRegFaceSmile } from "react-icons/fa6";
import { Character } from "../../ui/character";
import { TttMark } from "./marks";
import { REACTION_EMOJIS } from "./mock-arena";

export function PanelHeading({ children }: { children: string }) {
  return (
    <h3 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wider">
      {children}
    </h3>
  );
}

export function Spectators({
  count,
  watchers,
}: {
  count: number;
  watchers: string[];
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-muted-foreground text-sm">
        <FaEye size={14} aria-hidden="true" />
        <span className="font-medium text-card-foreground tabular-nums">
          {count}
        </span>
        watching
      </span>
      <div className="flex items-center">
        {watchers.slice(0, 4).map((seed, i) => (
          <span
            key={seed}
            className="-ml-2 rounded-full ring-2 ring-surface-raised first:ml-0"
            style={{ zIndex: watchers.length - i }}
          >
            <Character
              config={null}
              fallbackSeed={seed}
              alt=""
              size={24}
              className="size-6 rounded-full bg-surface-overlay"
            />
          </span>
        ))}
      </div>
    </div>
  );
}


export function ReactionsBar({
  onReact,
  disabled,
}: {
  onReact: (emoji: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <PanelHeading>Quick reactions</PanelHeading>
      <div className="flex flex-wrap gap-1.5">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            onClick={() => onReact(emoji)}
            aria-label={`React ${emoji}`}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-lg outline-none transition hover:scale-110 hover:border-primary/40 hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-40"
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>
      <span className="inline-flex items-center gap-1.5 px-1 text-[0.7rem] text-muted-foreground">
        <FaRegFaceSmile size={11} aria-hidden="true" />
        Tap to send a reaction
      </span>
    </div>
  );
}
