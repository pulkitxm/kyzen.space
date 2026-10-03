"use client";

import { getGameAudioEngine, type SfxSources } from "@kyzen/games-client";
import { CAR_FOOTBALL } from "@kyzen/shared/constants";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { gameMusicAtom, gameSfxAtom } from "./atoms";

const SFX_SOURCES: SfxSources = {
  hover: "/sounds/hover.ogg",
  touch: "/sounds/click.ogg",
  win: "/sounds/win.ogg",
  draw: "/sounds/draw.ogg",
};

const CAR_FOOTBALL_SFX_SOURCES: SfxSources = {
  ...SFX_SOURCES,
  touch: "/sounds/car-football-jump.wav",
  win: "/sounds/car-football-goal.wav",
};

export function useGameAudioBridge(
  musicUrl?: string | null,
  gameType?: string,
) {
  const sfx = useAtomValue(gameSfxAtom);
  const music = useAtomValue(gameMusicAtom);

  useEffect(() => {
    const engine = getGameAudioEngine();
    if (!engine) return;
    engine.setSfxSources(
      gameType === CAR_FOOTBALL ? CAR_FOOTBALL_SFX_SOURCES : SFX_SOURCES,
    );
  }, [gameType]);

  useEffect(() => {
    const engine = getGameAudioEngine();
    if (!engine) return;
    engine.setMusicSource(musicUrl ?? null);
  }, [musicUrl]);

  useEffect(() => {
    const engine = getGameAudioEngine();
    if (!engine) return;
    engine.setSfxVolume(sfx.volume);
    engine.setSfxMuted(sfx.muted);
  }, [sfx.volume, sfx.muted]);

  useEffect(() => {
    const engine = getGameAudioEngine();
    if (!engine) return;
    engine.setMusicVolume(music.volume);
    engine.setMusicMuted(music.muted);
  }, [music.volume, music.muted]);

  useEffect(() => {
    const engine = getGameAudioEngine();
    if (!engine) return;
    engine.setMusicActive(true);
    return () => engine.setMusicActive(false);
  }, []);

  useEffect(() => {
    const engine = getGameAudioEngine();
    if (!engine) return;
    const unlock = () => engine.unlock();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);
}
