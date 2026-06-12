import type { GameMeta } from "@gamelobby/shared/types";
import { TutorialButton } from "./tutorial-button";

export function HowToPlay({ meta }: { meta: GameMeta }) {
  const steps = meta.howToPlay ?? [];
  if (steps.length === 0 && !meta.tutorialVideo) return null;

  return (
    <section className="w-full rounded-3xl border border-border bg-surface-raised p-6 shadow-md">
      <h2 className="text-center font-game-paused text-primary text-xs uppercase tracking-[0.25em]">
        How to play
      </h2>

      {steps.length > 0 ? (
        <ol className="mt-6 space-y-5 text-left">
          {steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/40 font-game-paused text-[11px] text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5 text-card-foreground text-sm leading-relaxed">
                {step}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {meta.tutorialVideo ? (
        <>
          {steps.length > 0 ? (
            <div aria-hidden="true" className="mt-6 h-px w-full bg-border" />
          ) : null}
          <div className="mt-6">
            <TutorialButton src={meta.tutorialVideo} title={meta.name} />
          </div>
        </>
      ) : null}
    </section>
  );
}
