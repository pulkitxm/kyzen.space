"use client";

import { useState } from "react";
import { FaPlay } from "react-icons/fa6";
import { TutorialModal } from "./tutorial-modal";

export function TutorialButton({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-primary/70 px-4 py-3 font-semibold text-primary text-sm outline-none ring-1 ring-primary/30 ring-offset-2 ring-offset-surface-raised transition hover:bg-primary/10"
      >
        <FaPlay size={12} aria-hidden="true" />
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
