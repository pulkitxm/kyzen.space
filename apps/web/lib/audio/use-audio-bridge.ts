"use client";

import { getGameAudioEngine, type SfxSources } from "@kyzen/games-client";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { gameMusicAtom, gameSfxAtom } from "./atoms";

const SFX_SOURCES: SfxSources = {
  hover: "/sounds/hover.ogg",
  touch: "/sounds/click.ogg",
  win: "/sounds/win.ogg",
  draw: "/sounds/draw.ogg",
};

export function useGameAudioBridge(musicUrl?: string | null) {
  const sfx = useAtomValue(gameSfxAtom);
  const music = useAtomValue(gameMusicAtom);

  useEffect(() => {
    const engine = getGameAudioEngine();
    if (!engine) return;
    engine.setSfxSources(SFX_SOURCES);
  }, []);

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
