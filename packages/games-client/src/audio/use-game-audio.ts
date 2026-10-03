"use client";

import { useMemo } from "react";
import { getGameAudioEngine } from "./engine";

export function useGameAudio() {
  return useMemo(() => {
    const engine = getGameAudioEngine();
    return {
      playHover: () => engine?.playHover(),
      playTouch: () => engine?.playTouch(),
      playWin: () => engine?.playWin(),
      playDraw: () => engine?.playDraw(),
      playSound: (url: string, gain?: number) => engine?.playSound(url, gain),
      preloadSounds: (urls: readonly string[]) => engine?.preloadSounds(urls),
      unlock: () => engine?.unlock(),
    };
  }, []);
}
