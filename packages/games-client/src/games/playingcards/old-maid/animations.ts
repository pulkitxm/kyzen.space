import type { OldMaidCard } from "@gamelobby/shared/types";

export type FlightPoint = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotation: number;
};

export function measurePoint(el: HTMLElement, rotation: number): FlightPoint {
  const rect = el.getBoundingClientRect();
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width: el.offsetWidth,
    height: el.offsetHeight,
    rotation,
  };
}

export function centerPoint(
  rect: DOMRect,
  width: number,
  height: number,
  rotation = 0,
): FlightPoint {
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width,
    height,
    rotation,
  };
}

export function dedupeCards(cards: OldMaidCard[]): OldMaidCard[] {
  const seen = new Set<string>();
  const next: OldMaidCard[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    next.push(card);
  }
  return next;
}

export function runArcFlight(
  el: HTMLElement,
  from: FlightPoint,
  to: FlightPoint,
  durationMs: number,
  onComplete?: () => void,
  liftScale = 1,
): Animation {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const scale = to.width / from.width;
  const arcLift =
    -Math.min(180 * liftScale, Math.abs(dy) * 0.48 + 80 * liftScale);
  const midRot = (from.rotation + to.rotation) / 2;

  const animation = el.animate(
    [
      {
        transform: `translate3d(0px, 0px, 0px) rotate(${from.rotation}deg) scale(1)`,
      },
      {
        transform: `translate3d(${dx * 0.46}px, ${dy * 0.46 + arcLift}px, 56px) rotate(${midRot}deg) scale(${Math.max(scale, 1) * 1.08})`,
        offset: 0.5,
      },
      {
        transform: `translate3d(${dx}px, ${dy}px, 0px) rotate(${to.rotation}deg) scale(${scale})`,
      },
    ],
    {
      duration: durationMs,
      easing: "cubic-bezier(0.34, 1.12, 0.44, 1)",
      fill: "forwards",
    },
  );

  animation.onfinish = () => onComplete?.();
  return animation;
}

export function runDiscardFlight(
  el: HTMLElement,
  from: FlightPoint,
  to: FlightPoint,
  durationMs: number,
  onComplete?: () => void,
): Animation {
  return runArcFlight(el, from, to, durationMs, onComplete, 1.35);
}

function waitAnimations(anims: Animation[]): Promise<void> {
  return Promise.all(
    anims.map(
      (anim) =>
        new Promise<void>((resolve) => {
          anim.onfinish = () => resolve();
          anim.oncancel = () => resolve();
        }),
    ),
  ).then(() => undefined);
}

export function runHandCollapse(
  elements: HTMLElement[],
  centerX: number,
  centerY: number,
  durationMs: number,
): Promise<void> {
  const anims = elements.map((el) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = centerX - cx;
    const dy = centerY - cy;
    const base = getComputedStyle(el).transform;
    const prefix = base === "none" ? "" : `${base} `;
    return el.animate(
      [
        { transform: base },
        {
          transform: `${prefix}translate(${dx}px, ${dy - 28}px) rotate(0deg)`,
        },
      ],
      {
        duration: durationMs,
        easing: "cubic-bezier(0.33, 1, 0.38, 1)",
        fill: "forwards",
      },
    );
  });
  return waitAnimations(anims);
}

export function runHandRiffle(
  elements: HTMLElement[],
  durationMs: number,
): Promise<void> {
  const anims = elements.map((el, index) => {
    const base = getComputedStyle(el).transform;
    const prefix = base === "none" ? "" : `${base} `;
    const wobble = index % 2 === 0 ? -5 : 5;
    return el.animate(
      [
        { transform: base },
        { transform: `${prefix}rotate(${wobble}deg)` },
        { transform: `${prefix}rotate(${-wobble * 0.6}deg)` },
        { transform: `${prefix}rotate(0deg)` },
      ],
      {
        duration: durationMs,
        easing: "ease-in-out",
        fill: "forwards",
      },
    );
  });
  return waitAnimations(anims);
}

export function snapHandToStack(
  elements: HTMLElement[],
  stackX: number,
  stackY: number,
): void {
  for (const el of elements) {
    el.getAnimations().forEach((anim) => anim.cancel());
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = stackX - cx;
    const dy = stackY - cy - 28;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}

export function runHandSpreadToFan(
  elements: HTMLElement[],
  endTransforms: string[],
  durationMs: number,
): Promise<void> {
  const anims = elements.map((el, index) => {
    const end = endTransforms[index];
    if (!end) return null;
    const base = getComputedStyle(el).transform;
    return el.animate(
      [{ transform: base }, { transform: end }],
      {
        duration: durationMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );
  });
  return waitAnimations(anims.filter((anim): anim is Animation => anim !== null));
}

export function clearHandTransforms(elements: HTMLElement[]): void {
  for (const el of elements) {
    el.getAnimations().forEach((anim) => anim.cancel());
    el.style.transform = "";
  }
}

export function runHandSpread(
  elements: HTMLElement[],
  targets: { dx: number; dy: number; rotation: number }[],
  durationMs: number,
): Promise<void> {
  const anims = elements.map((el, index) => {
    const target = targets[index];
    if (!target) return null;
    const base = getComputedStyle(el).transform;
    const prefix = base === "none" ? "" : `${base} `;
    return el.animate(
      [
        { transform: base },
        {
          transform: `${prefix}translate(${target.dx}px, ${target.dy}px) rotate(${target.rotation}deg) scale(1)`,
        },
      ],
      {
        duration: durationMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );
  });
  return waitAnimations(anims.filter((anim): anim is Animation => anim !== null));
}

