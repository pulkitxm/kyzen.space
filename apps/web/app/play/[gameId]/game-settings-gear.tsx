"use client";

import type { CSSProperties } from "react";
import { FaGear } from "react-icons/fa6";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import { GameSettingsPanel } from "./game-settings-panel";

export function GameSettingsGear({
  shifted,
  offset,
}: {
  shifted: boolean;
  offset: number;
}) {
  const { openLayer } = useLayeredPopup();

  const open = () =>
    openLayer({
      title: "Game settings",
      size: "sm",
      content: <GameSettingsPanel />,
    });

  return (
    <div
      style={
        { "--gear-shift": shifted ? `-${offset}px` : "0px" } as CSSProperties
      }
      className="md:gear-shift absolute top-3 right-3 z-20 transition-transform duration-300 ease-out"
    >
      <button
        type="button"
        aria-label="Game settings"
        onClick={open}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-surface-overlay hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FaGear size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
