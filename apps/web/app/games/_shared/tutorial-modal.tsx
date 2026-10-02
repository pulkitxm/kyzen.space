"use client";

import "plyr/dist/plyr.css";
import { AnimatePresence, m } from "motion/react";
import type PlyrType from "plyr";
import { useEffect, useEffectEvent, useRef } from "react";
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
  const closeTutorial = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let player: PlyrType | null = null;
    void import("plyr").then((mod) => {
      if (cancelled || !videoRef.current) return;
      player = new mod.default(videoRef.current, {
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "volume",
          "fullscreen",
        ],
      });
    });
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTutorial();
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={onClose}
        >
          <m.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tutorial"
              className="absolute -top-12 right-0 rounded-full p-2 text-white/70 outline-none transition hover:bg-white/10 hover:text-white"
            >
              <FaXmark size={20} aria-hidden="true" />
            </button>
            <div className="overflow-hidden rounded-2xl bg-black shadow-2xl">
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
            </div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
