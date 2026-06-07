"use client";

import { useCallback, useMemo, useRef } from "react";

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // @ts-expect-error
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

function useAudioCtx() {
  const ctxRef = useRef<AudioContext | null>(null);
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = getAudioContext();
    }
    if (ctxRef.current?.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);
  return getCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  type: OscillatorType,
  gainVal: number,
  startTime: number,
  duration: number,
  fadeOut = true,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainVal, startTime);
  if (fadeOut) {
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  }
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

function playNoise(
  ctx: AudioContext,
  gainVal: number,
  startTime: number,
  duration: number,
) {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  source.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(gainVal, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  source.start(startTime);
}

export function useSound() {
  const getCtx = useAudioCtx();

  const playDiceRoll = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    playNoise(ctx, 0.18, t, 0.12);
    playNoise(ctx, 0.14, t + 0.13, 0.1);
    playNoise(ctx, 0.12, t + 0.24, 0.09);
    playNoise(ctx, 0.1, t + 0.34, 0.08);
    playTone(ctx, 180, "sine", 0.25, t + 0.42, 0.12);
    playTone(ctx, 140, "sine", 0.2, t + 0.44, 0.1);
  }, [getCtx]);

  const playStep = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    playTone(ctx, 520, "sine", 0.08, t, 0.04);
    playNoise(ctx, 0.04, t, 0.03);
  }, [getCtx]);

  const playLanding = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    playTone(ctx, 440, "triangle", 0.15, t, 0.18);
    playTone(ctx, 554, "triangle", 0.12, t + 0.02, 0.16);
    playTone(ctx, 659, "triangle", 0.1, t + 0.04, 0.2);
  }, [getCtx]);

  const playBuy = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      playTone(ctx, freq, "sine", 0.14 - i * 0.02, t + i * 0.07, 0.15);
    });
  }, [getCtx]);

  const playPassGo = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [523, 659, 784, 659, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.44];
    notes.forEach((freq, i) => {
      playTone(ctx, freq, "square", 0.1, t + times[i], 0.14);
      playTone(ctx, freq * 0.5, "sine", 0.06, t + times[i], 0.14);
    });
  }, [getCtx]);

  const playJail = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    playTone(ctx, 180, "sawtooth", 0.14, t, 0.08);
    playTone(ctx, 120, "sawtooth", 0.18, t + 0.08, 0.25);
    playTone(ctx, 80, "sine", 0.2, t + 0.2, 0.35);
  }, [getCtx]);

  const playCardDraw = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.25);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.35);
  }, [getCtx]);

  const playTax = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    playTone(ctx, 440, "sine", 0.12, t, 0.12);
    playTone(ctx, 330, "sine", 0.14, t + 0.12, 0.14);
    playTone(ctx, 220, "sine", 0.16, t + 0.26, 0.2);
  }, [getCtx]);

  return useMemo(
    () => ({
      playDiceRoll,
      playStep,
      playLanding,
      playBuy,
      playPassGo,
      playJail,
      playCardDraw,
      playTax,
    }),
    [
      playDiceRoll,
      playStep,
      playLanding,
      playBuy,
      playPassGo,
      playJail,
      playCardDraw,
      playTax,
    ],
  );
}
