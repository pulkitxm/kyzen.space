"use client";

import { useState } from "react";
import { FaCirclePlay } from "react-icons/fa6";
import { TutorialModal } from "./tutorial-modal";

export function TutorialButton({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 font-medium text-muted-foreground text-sm outline-none transition hover:bg-surface-overlay hover:text-card-foreground"
      >
        <FaCirclePlay size={16} aria-hidden="true" />
        Watch tutorial
      </button>
      <TutorialModal
        src={src}
        title={title}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
