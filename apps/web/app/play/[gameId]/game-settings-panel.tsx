"use client";

import { clampVolume, stepVolume } from "@gamelobby/games-client";
import {
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_STEP,
} from "@gamelobby/shared/constants";
import type { AudioChannelPrefs } from "@gamelobby/shared/types";
import { useAtom } from "jotai";
import type { ReactNode } from "react";
import {
  FaMinus,
  FaMusic,
  FaPlus,
  FaVolumeHigh,
  FaVolumeLow,
  FaVolumeOff,
  FaVolumeXmark,
} from "react-icons/fa6";
import { gameMusicAtom, gameSfxAtom } from "@/lib/audio/atoms";
import { cn } from "@/lib/utils";

function muteIcon(prefs: AudioChannelPrefs) {
  if (prefs.muted) return <FaVolumeXmark size={16} aria-hidden="true" />;
  if (prefs.volume <= 0) return <FaVolumeOff size={16} aria-hidden="true" />;
  if (prefs.volume <= 0.5) return <FaVolumeLow size={16} aria-hidden="true" />;
  return <FaVolumeHigh size={16} aria-hidden="true" />;
}

function ChannelControl({
  label,
  icon,
  prefs,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  prefs: AudioChannelPrefs;
  onChange: (next: AudioChannelPrefs) => void;
}) {
  const shown = prefs.muted ? 0 : prefs.volume;
  const percent = Math.round(shown * 100);
  const stepBtn =
    "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground outline-none transition hover:bg-surface-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground">
          {icon}
          <span className="font-medium text-sm">{label}</span>
        </div>
        <button
          type="button"
          aria-pressed={prefs.muted}
          aria-label={prefs.muted ? `Unmute ${label}` : `Mute ${label}`}
          onClick={() => onChange({ ...prefs, muted: !prefs.muted })}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
            prefs.muted
              ? "border-transparent bg-danger/15 text-danger"
              : "border-border text-muted-foreground hover:bg-surface-overlay hover:text-foreground",
          )}
        >
          {muteIcon(prefs)}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={shown <= VOLUME_MIN}
          onClick={() =>
            onChange({ volume: stepVolume(prefs.volume, -1), muted: false })
          }
          className={stepBtn}
        >
          <FaMinus size={12} aria-hidden="true" />
        </button>
        <input
          type="range"
          aria-label={`${label} volume`}
          min={VOLUME_MIN}
          max={VOLUME_MAX}
          step={VOLUME_STEP}
          value={shown}
          onChange={(e) =>
            onChange({
              volume: clampVolume(Number(e.target.value)),
              muted: false,
            })
          }
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={shown >= VOLUME_MAX}
          onClick={() =>
            onChange({ volume: stepVolume(prefs.volume, 1), muted: false })
          }
          className={stepBtn}
        >
          <FaPlus size={12} aria-hidden="true" />
        </button>
        <span className="w-10 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
          {percent}%
        </span>
      </div>
    </div>
  );
}

export function GameSettingsPanel() {
  const [sfx, setSfx] = useAtom(gameSfxAtom);
  const [music, setMusic] = useAtom(gameMusicAtom);

  return (
    <div className="flex flex-col gap-3">
      <ChannelControl
        label="Game sound"
        icon={<FaVolumeHigh size={16} aria-hidden="true" />}
        prefs={sfx}
        onChange={setSfx}
      />
      <ChannelControl
        label="Background music"
        icon={<FaMusic size={16} aria-hidden="true" />}
        prefs={music}
        onChange={setMusic}
      />
      <p className="text-muted-foreground text-xs">
        Settings apply to every game and are saved on this device.
      </p>
    </div>
  );
}
