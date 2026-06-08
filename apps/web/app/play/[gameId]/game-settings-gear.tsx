"use client";

import { motion } from "motion/react";
import { FaGear } from "react-icons/fa6";
import { useLayeredPopup } from "@/lib/popups/use-layered-popup";
import { GameSettingsPanel } from "./game-settings-panel";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function GameSettingsGear({
  docked,
  offset,
}: {
  docked: boolean;
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
    <motion.div
      className="absolute top-3 right-3 z-20"
      initial={false}
      animate={{ x: docked ? -offset : 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
    >
      <button
        type="button"
        aria-label="Game settings"
        onClick={open}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition hover:bg-surface-overlay hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FaGear size={16} aria-hidden="true" />
      </button>
    </motion.div>
  );
}
