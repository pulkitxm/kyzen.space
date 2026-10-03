"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGameAudio } from "../../audio/use-game-audio";
import type { SoundName } from "./replay";

const SOUND_NAMES: readonly SoundName[] = [
  "fire",
  "explode",
  "jump",
  "land",
  "shield",
  "wall",
  "cluster",
  "mine",
  "pickup",
  "portal",
  "lock",
  "tick",
  "siren",
  "splash",
  "select",
];

const GAINS: Partial<Record<SoundName, number>> = {
  tick: 0.55,
  land: 0.6,
  portal: 0.7,
  splash: 0.8,
};

const MIN_GAP_MS = 70;

function soundUrl(name: SoundName) {
  return `/sounds/tank-arena/${name}.ogg`;
}

export function useTankAudio() {
  const audio = useGameAudio();
  const lastPlayed = useRef(new Map<SoundName, number>());

  useEffect(() => {
    audio.preloadSounds(SOUND_NAMES.map(soundUrl));
  }, [audio]);

  return useMemo(
    () => ({
      play: (name: SoundName) => {
        const now = performance.now();
        const last = lastPlayed.current.get(name) ?? -Infinity;
        if (now - last < MIN_GAP_MS) return;
        lastPlayed.current.set(name, now);
        audio.playSound(soundUrl(name), GAINS[name] ?? 1);
      },
    }),
    [audio],
  );
}

export type TankAudio = ReturnType<typeof useTankAudio>;
