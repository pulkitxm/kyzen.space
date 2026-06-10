"use client";

import {
  FaBackwardStep,
  FaChevronLeft,
  FaChevronRight,
  FaForwardStep,
  FaPause,
  FaPlay,
} from "react-icons/fa6";

const BUTTON =
  "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card px-3 text-card-foreground shadow-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35";

export function ReplayDock({
  step,
  maxStep,
  isPlaying,
  onFirst,
  onPrev,
  onTogglePlay,
  onNext,
  onLast,
}: {
  step: number;
  maxStep: number;
  isPlaying: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  return (
    <>
      <div
        className="mt-6 flex max-w-[320px] flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface-overlay/60 p-2"
        role="toolbar"
        aria-label="Replay controls"
      >
        <button
          type="button"
          className={BUTTON}
          onClick={onFirst}
          disabled={step <= 0}
          title="First"
        >
          <FaBackwardStep size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={onPrev}
          disabled={step <= 0}
          title="Previous move (←)"
        >
          <FaChevronLeft size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${BUTTON} min-w-13`}
          onClick={onTogglePlay}
          disabled={maxStep === 0}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isPlaying ? (
            <FaPause size={20} aria-hidden="true" />
          ) : (
            <FaPlay size={20} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={onNext}
          disabled={step >= maxStep}
          title="Next move (→)"
        >
          <FaChevronRight size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={onLast}
          disabled={step >= maxStep}
          title="Last move"
        >
          <FaForwardStep size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-3 text-muted-foreground text-xs">
        Position after {step} of {maxStep} moves
      </p>
    </>
  );
}
