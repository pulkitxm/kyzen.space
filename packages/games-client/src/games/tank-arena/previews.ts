"use client";

import { TANK_KINDS } from "@kyzen/games-core";
import type { TankKind } from "@kyzen/shared/types";
import { useCallback, useSyncExternalStore } from "react";
import type { PreviewRequest } from "./view";

export const PREVIEW_FRAMES = 36;
export const PREVIEW_FRAME_MS = 1000 / 12;
const PREVIEW_HEIGHT = 160;
const PREVIEW_ASPECT = 1.5;
const MAX_SCALE = 1.5;
const RELEASE_MS = 2000;

export type PreviewFrames = Partial<Record<TankKind, ImageBitmap[]>>;

export function previewRequest(
  color: number,
  devicePixelRatio: number,
): PreviewRequest {
  const scale = Math.min(Math.max(1, devicePixelRatio || 1), MAX_SCALE);
  const height = Math.round(PREVIEW_HEIGHT * scale);
  return {
    color,
    kinds: [...TANK_KINDS],
    frames: PREVIEW_FRAMES,
    width: Math.round(height * PREVIEW_ASPECT),
    height,
  };
}

type PreviewEntry = {
  frames: PreviewFrames | null;
  users: number;
  listeners: Set<() => void>;
  release: ReturnType<typeof setTimeout> | null;
  stop: () => void;
};

const entries = new Map<number, PreviewEntry>();

function previewEntry(color: number) {
  const existing = entries.get(color);
  if (existing) return existing;
  let stopped = false;
  let job: { cancel: () => void } | null = null;
  const entry: PreviewEntry = {
    frames: null,
    users: 0,
    listeners: new Set(),
    release: null,
    stop: () => {
      stopped = true;
      job?.cancel();
      for (const frames of Object.values(entry.frames ?? {})) {
        for (const bitmap of frames) bitmap.close();
      }
      entries.delete(color);
    },
  };
  entries.set(color, entry);
  import("./scene")
    .then((scene) => {
      if (stopped) return;
      job = scene.renderPreviews(
        previewRequest(color, globalThis.devicePixelRatio),
        (kind, frames) => {
          entry.frames = { ...entry.frames, [kind]: frames };
          for (const listener of entry.listeners) listener();
        },
      );
    })
    .catch(() => {});
  return entry;
}

function subscribePreviews(color: number, listener: () => void) {
  const entry = previewEntry(color);
  if (entry.release) clearTimeout(entry.release);
  entry.release = null;
  entry.users += 1;
  entry.listeners.add(listener);
  return () => {
    entry.users -= 1;
    entry.listeners.delete(listener);
    if (entry.users === 0) entry.release = setTimeout(entry.stop, RELEASE_MS);
  };
}

export function usePreviewFrames(color: number): PreviewFrames | null {
  const subscribe = useCallback(
    (listener: () => void) => subscribePreviews(color, listener),
    [color],
  );
  return useSyncExternalStore(
    subscribe,
    () => entries.get(color)?.frames ?? null,
    () => null,
  );
}
