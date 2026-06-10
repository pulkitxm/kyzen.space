import { describe, expect, test } from "bun:test";
import {
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_STEP,
} from "@gamelobby/shared/constants";
import {
  clampVolume,
  GameAudioEngine,
  getGameAudioEngine,
  shouldPlayMusic,
  stepVolume,
} from "../src/audio/engine";

describe("clampVolume edge inputs", () => {
  test("clamps negative infinity to the minimum", () => {
    expect(clampVolume(Number.NEGATIVE_INFINITY)).toBe(VOLUME_MIN);
  });

  test("clamps a value one step below the minimum", () => {
    expect(clampVolume(VOLUME_MIN - VOLUME_STEP)).toBe(VOLUME_MIN);
  });

  test("clamps a value one step above the maximum", () => {
    expect(clampVolume(VOLUME_MAX + VOLUME_STEP)).toBe(VOLUME_MAX);
  });

  test("leaves a value exactly on each boundary untouched", () => {
    expect(clampVolume(VOLUME_MIN)).toBe(VOLUME_MIN);
    expect(clampVolume(VOLUME_MAX)).toBe(VOLUME_MAX);
  });
});

describe("stepVolume edge inputs", () => {
  test("steps up from a NaN start as if it were the minimum", () => {
    expect(stepVolume(Number.NaN, 1)).toBeCloseTo(VOLUME_MIN + VOLUME_STEP, 5);
  });

  test("clamps a below-range start before stepping down", () => {
    expect(stepVolume(-5, -1)).toBe(VOLUME_MIN);
  });

  test("clamps an above-range start before stepping up", () => {
    expect(stepVolume(5, 1)).toBe(VOLUME_MAX);
  });

  test("an above-range start can still step down into range", () => {
    expect(stepVolume(5, -1)).toBe(VOLUME_MAX - VOLUME_STEP);
  });

  test("round-trips up then down without floating point drift", () => {
    expect(stepVolume(stepVolume(0.3, 1), -1)).toBe(0.3);
  });
});

describe("shouldPlayMusic boundary", () => {
  const base = { active: true, muted: false, volume: 0.5, running: true };

  test("a negative volume is treated as inaudible", () => {
    expect(shouldPlayMusic({ ...base, volume: -0.1 })).toBe(false);
  });

  test("a volume exactly at zero is inaudible", () => {
    expect(shouldPlayMusic({ ...base, volume: 0 })).toBe(false);
  });

  test("the smallest positive volume is audible", () => {
    expect(shouldPlayMusic({ ...base, volume: 0.0001 })).toBe(true);
  });

  test("a single false flag suppresses an otherwise-playable state", () => {
    expect(shouldPlayMusic({ ...base, active: false })).toBe(false);
    expect(shouldPlayMusic({ ...base, muted: true })).toBe(false);
    expect(shouldPlayMusic({ ...base, running: false })).toBe(false);
  });

  test("plays only when every condition holds", () => {
    expect(shouldPlayMusic(base)).toBe(true);
  });
});

describe("getGameAudioEngine without a window", () => {
  test("returns null when window is undefined", () => {
    expect(typeof window).toBe("undefined");
    expect(getGameAudioEngine()).toBeNull();
  });
});

describe("GameAudioEngine is SSR-safe without an AudioContext", () => {
  test("every public mutator and trigger is a no-op when there is no context", () => {
    const engine = new GameAudioEngine();
    expect(() => {
      engine.setSfxVolume(0.4);
      engine.setSfxVolume(Number.NaN);
      engine.setSfxMuted(true);
      engine.setSfxSources({ hover: "/sounds/hover.ogg" });
      engine.setMusicVolume(0.2);
      engine.setMusicMuted(true);
      engine.setMusicActive(true);
      engine.setMusicSource("/sounds/bg.ogg");
      engine.unlock();
      engine.playHover();
      engine.playTouch();
      engine.playWin();
      engine.playDraw();
    }).not.toThrow();
  });

  test("setMusicSource with the same url is idempotent and harmless", () => {
    const engine = new GameAudioEngine();
    expect(() => {
      engine.setMusicSource("/sounds/bg.ogg");
      engine.setMusicSource("/sounds/bg.ogg");
      engine.setMusicSource(null);
      engine.setMusicSource(null);
    }).not.toThrow();
  });

  test("unlock before any context returns without error", () => {
    const engine = new GameAudioEngine();
    expect(() => engine.unlock()).not.toThrow();
  });
});
