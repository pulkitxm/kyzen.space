import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  GAME_MUSIC_STORAGE_KEY,
  GAME_SFX_STORAGE_KEY,
} from "@kyzen/shared/constants";
import type { AudioChannelPrefs } from "@kyzen/shared/types";
import { atomWithStorage, createJSONStorage } from "jotai/utils";

const noopStringStorage = {
  getItem: (): string | null => null,
  setItem: () => {},
  removeItem: () => {},
};

function getStringStorage() {
  return typeof window !== "undefined" ? localStorage : noopStringStorage;
}

const channelStorage = createJSONStorage<AudioChannelPrefs>(getStringStorage);

export const gameSfxAtom = atomWithStorage<AudioChannelPrefs>(
  GAME_SFX_STORAGE_KEY,
  { volume: DEFAULT_SFX_VOLUME, muted: false },
  channelStorage,
  { getOnInit: true },
);

export const gameMusicAtom = atomWithStorage<AudioChannelPrefs>(
  GAME_MUSIC_STORAGE_KEY,
  { volume: DEFAULT_MUSIC_VOLUME, muted: false },
  channelStorage,
  { getOnInit: true },
);
