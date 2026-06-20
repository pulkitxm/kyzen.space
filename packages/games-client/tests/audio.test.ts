import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_STEP,
} from "@kyzen/shared/constants";
import { clampVolume, shouldPlayMusic, stepVolume } from "../src/audio/engine";

describe("clampVolume", () => {
  test("keeps values within range", () => {
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(VOLUME_MIN)).toBe(VOLUME_MIN);
    expect(clampVolume(VOLUME_MAX)).toBe(VOLUME_MAX);
  });

  test("clamps out-of-range values", () => {
    expect(clampVolume(-2)).toBe(VOLUME_MIN);
    expect(clampVolume(5)).toBe(VOLUME_MAX);
  });

  test("falls back to the minimum for non-finite input", () => {
    expect(clampVolume(Number.NaN)).toBe(VOLUME_MIN);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(VOLUME_MAX);
  });
});

describe("stepVolume", () => {
  test("increases and decreases by a single step", () => {
    expect(stepVolume(0.5, 1)).toBeCloseTo(0.5 + VOLUME_STEP, 5);
    expect(stepVolume(0.5, -1)).toBeCloseTo(0.5 - VOLUME_STEP, 5);
  });

  test("never leaves the valid range", () => {
    expect(stepVolume(VOLUME_MAX, 1)).toBe(VOLUME_MAX);
    expect(stepVolume(VOLUME_MIN, -1)).toBe(VOLUME_MIN);
  });

  test("avoids floating point drift", () => {
    expect(stepVolume(0.3, 1)).toBe(0.4);
  });
});

describe("shouldPlayMusic", () => {
  const base = { active: true, muted: false, volume: 0.5, running: true };

  test("plays only when active, audible, and the context is running", () => {
    expect(shouldPlayMusic(base)).toBe(true);
  });

  test("does not play when inactive", () => {
    expect(shouldPlayMusic({ ...base, active: false })).toBe(false);
  });

  test("does not play when muted", () => {
    expect(shouldPlayMusic({ ...base, muted: true })).toBe(false);
  });

  test("does not play at zero volume", () => {
    expect(shouldPlayMusic({ ...base, volume: 0 })).toBe(false);
  });

  test("does not play before the context is running", () => {
    expect(shouldPlayMusic({ ...base, running: false })).toBe(false);
  });
});

describe("audio defaults", () => {
  test("sit within the valid volume range", () => {
    expect(clampVolume(DEFAULT_SFX_VOLUME)).toBe(DEFAULT_SFX_VOLUME);
    expect(clampVolume(DEFAULT_MUSIC_VOLUME)).toBe(DEFAULT_MUSIC_VOLUME);
  });
});
