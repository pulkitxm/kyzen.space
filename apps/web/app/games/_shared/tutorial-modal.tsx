"use client";

import "plyr/dist/plyr.css";
import { AnimatePresence, m } from "motion/react";
import type PlyrType from "plyr";
import { useEffect, useRef } from "react";
import { FaXmark } from "react-icons/fa6";

export function TutorialModal({
  src,
  title,
  open,
  onClose,
}: {
  src: string;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<PlyrType | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void import("plyr").then((mod) => {
      if (cancelled || !videoRef.current) return;
      playerRef.current = new mod.default(videoRef.current, {
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "mute",
          "volume",
          "fullscreen",
        ],
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={onClose}
        >
          <m.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-surface-raised shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-border border-b px-4 py-3">
              <span className="font-medium text-card-foreground text-sm">
                {title} tutorial
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close tutorial"
                className="rounded-lg p-1.5 text-muted-foreground outline-none transition hover:bg-surface-overlay"
              >
                <FaXmark size={18} aria-hidden="true" />
              </button>
            </div>
            {/* biome-ignore lint/a11y/useMediaCaption: gameplay tutorial has no spoken dialogue track */}
            <video
              ref={videoRef}
              aria-label={`${title} tutorial video`}
              className="w-full"
              playsInline
              controls
            >
              <source src={src} type="video/mp4" />
            </video>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
