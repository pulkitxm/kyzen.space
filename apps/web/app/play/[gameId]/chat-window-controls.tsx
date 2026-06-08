"use client";

import type { ReactNode } from "react";
import { FaCompress, FaExpand, FaMinus, FaXmark } from "react-icons/fa6";
import { cn } from "@/lib/utils";

function Light({
  color,
  label,
  onClick,
  children,
}: {
  color: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cn(
        "flex size-4 items-center justify-center rounded-full text-black/60 shadow-sm outline-none transition hover:text-black/85",
        color,
      )}
    >
      {children}
    </button>
  );
}

export function ChatWindowControls({
  isPopout,
  onClose,
  onMinimize,
  onZoom,
}: {
  isPopout: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onZoom: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Light
        color="bg-[#ff5f57]"
        label="Stash chat to the side"
        onClick={onClose}
      >
        <FaXmark className="size-2.5" />
      </Light>
      <Light color="bg-[#febc2e]" label="Minimize chat" onClick={onMinimize}>
        <FaMinus className="size-2.5" />
      </Light>
      <Light
        color="bg-[#28c840]"
        label={isPopout ? "Dock chat" : "Pop out chat"}
        onClick={onZoom}
      >
        {isPopout ? (
          <FaExpand className="size-2.5" />
        ) : (
          <FaCompress className="size-2.5" />
        )}
      </Light>
    </div>
  );
}
