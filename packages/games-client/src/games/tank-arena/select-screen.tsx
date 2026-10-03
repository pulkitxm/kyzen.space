"use client";

import { TANK_KINDS, TANKS } from "@kyzen/games-core";
import type { TankKind } from "@kyzen/shared/types";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FaCheck, FaLock } from "react-icons/fa6";
import { actionIcon, PANEL, RoundTimer } from "./hud";
import { cssColor, type RosterEntry, statBars } from "./model";
import type { PreviewHandle } from "./view";

function TankPreview({ kind, color }: { kind: TankKind; color: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PreviewHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const initial = useEffectEvent(() => ({ kind, color }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    import("./scene")
      .then((module) => {
        if (cancelled) return;
        const start = initial();
        const handle = module.mountPreview(container, start.kind, start.color);
        if (!handle) setFailed(true);
        handleRef.current = handle;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.setKind(kind, color);
  }, [kind, color]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${TANKS[kind].name} rotating preview`}
      className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-radial from-sky-900/50 to-transparent sm:h-36"
    >
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center font-black text-3xl text-white/70 uppercase tracking-widest">
          {TANKS[kind].name}
        </p>
      ) : null}
    </div>
  );
}

function TankCard({
  kind,
  focused,
  color,
  picked,
  disabled,
  onFocus,
}: {
  kind: TankKind;
  focused: boolean;
  color: number;
  picked: boolean;
  disabled: boolean;
  onFocus: () => void;
}) {
  const spec = TANKS[kind];
  return (
    <button
      type="button"
      aria-pressed={focused}
      disabled={disabled}
      onClick={onFocus}
      className={[
        "flex flex-col gap-2 rounded-xl border p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-default",
        focused
          ? "border-sky-300 bg-sky-400/15"
          : "border-white/15 bg-white/5 enabled:hover:bg-white/10",
      ].join(" ")}
    >
      <TankPreview kind={kind} color={color} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-black text-lg uppercase tracking-wide">
          {spec.name}
        </span>
        <span className="text-slate-300 text-xs">
          {spec.role}
          {picked ? (
            <FaCheck
              aria-label="Your pick"
              className="ml-1 inline text-emerald-300"
            />
          ) : null}
        </span>
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-x-2 gap-y-1 text-xs">
        {statBars(kind).map((bar) => (
          <div key={bar.key} className="contents">
            <dt className="text-slate-300">{bar.label}</dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <span
                className="block h-full rounded-full bg-sky-300"
                style={{ width: `${Math.round(bar.fraction * 100)}%` }}
              />
            </dd>
            <dd className="text-right tabular-nums">{bar.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(["specialA", "specialB"] as const).map((slot) => {
          const special = spec[slot];
          return (
            <div
              key={slot}
              className="rounded-lg border border-white/10 bg-black/20 p-2"
            >
              <p className="flex items-center gap-1.5 font-semibold text-xs">
                {actionIcon(kind, slot)}
                {special.name}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-300 leading-snug">
                {special.description}
              </p>
              <p className="mt-1 text-[10px] text-sky-200">
                Cooldown {special.cooldown} rounds
              </p>
            </div>
          );
        })}
      </div>
    </button>
  );
}

export function SelectScreen({
  player,
  submitted,
  picked,
  deadline,
  entries,
  previewColor,
  onPick,
  onSecond,
}: {
  player: boolean;
  submitted: boolean;
  picked: TankKind | null;
  deadline: number | null;
  entries: RosterEntry[];
  previewColor: number;
  onPick: (kind: TankKind) => void;
  onSecond?: (seconds: number) => void;
}) {
  const [focused, setFocused] = useState<TankKind>(picked ?? "bastion");
  const shown = picked ?? focused;
  const lockedCount = entries.filter((entry) => entry.locked).length;
  const done = submitted || picked !== null;
  const hasPicked = done || !player;

  return (
    <section
      aria-labelledby="tank-select-title"
      className={`${PANEL} pointer-events-auto flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-y-auto p-3 sm:p-4`}
    >
      <header className="flex items-center gap-3">
        <RoundTimer
          deadline={deadline}
          active={!hasPicked}
          onSecond={onSecond}
        />
        <div className="min-w-0 flex-1">
          <h2 id="tank-select-title" className="font-bold text-lg">
            Choose your tank
          </h2>
          <p className="text-slate-300 text-xs">
            Picks stay hidden until everyone has chosen. {lockedCount} of{" "}
            {entries.length} ready.
          </p>
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {TANK_KINDS.map((kind) => (
          <TankCard
            key={kind}
            kind={kind}
            focused={shown === kind}
            color={previewColor}
            picked={picked === kind}
            disabled={hasPicked}
            onFocus={() => setFocused(kind)}
          />
        ))}
      </div>
      <div className="sticky -bottom-3 -mx-3 -mb-3 flex flex-col gap-3 border-white/10 border-t bg-slate-950/85 p-3 backdrop-blur-md sm:-bottom-4 sm:-mx-4 sm:-mb-4 sm:flex-row sm:items-center sm:p-4">
        <ul aria-label="Pick status" className="flex flex-1 flex-wrap gap-1.5">
          {entries.map((entry) => (
            <li
              key={entry.role}
              className="flex items-center gap-1.5 rounded-full bg-white/8 px-2 py-0.5 text-xs"
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: cssColor(entry.color) }}
              />
              <span className="max-w-28 truncate">
                {entry.local ? "You" : entry.name}
              </span>
              {entry.locked ? (
                <FaCheck aria-label="picked" className="text-emerald-300" />
              ) : (
                <span className="text-slate-400">choosing</span>
              )}
            </li>
          ))}
        </ul>
        {player ? (
          <button
            type="button"
            disabled={done}
            onClick={() => onPick(focused)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 font-bold text-sky-950 uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-white enabled:hover:bg-sky-400 disabled:bg-emerald-500/80 disabled:text-emerald-950"
          >
            {done ? (
              <>
                <FaCheck aria-hidden="true" />{" "}
                {picked ? `${TANKS[picked].name} locked` : "Locked in"}
              </>
            ) : (
              <>
                <FaLock aria-hidden="true" /> Confirm {TANKS[focused].name}
              </>
            )}
          </button>
        ) : (
          <p className="text-slate-300 text-sm">Spectating tank selection</p>
        )}
      </div>
    </section>
  );
}
