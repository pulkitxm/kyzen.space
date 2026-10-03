"use client";

import { TANK_KINDS, TANKS } from "@kyzen/games-core";
import type { TankKind } from "@kyzen/shared/types";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { FaCheck, FaLock } from "react-icons/fa6";
import { ActionIcon, RoundTimer } from "./hud";
import { cssColor, type RosterEntry, statBars } from "./model";
import { PANEL } from "./styles";
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
      className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-radial from-sky-800/60 via-slate-900/50 to-transparent sm:h-40"
      style={{
        boxShadow: "inset 0 -20px 30px -10px rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
        }}
      />
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
        "flex flex-col gap-3 rounded-2xl border-2 p-4 text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-default",
        focused
          ? "scale-[1.02] border-sky-400 bg-gradient-to-br from-sky-500/20 to-sky-900/30 shadow-[0_0_30px_rgba(56,189,248,0.25)]"
          : "border-white/10 bg-gradient-to-br from-white/8 to-white/2 enabled:hover:scale-[1.01] enabled:hover:border-white/20 enabled:hover:bg-white/10",
      ].join(" ")}
    >
      <TankPreview kind={kind} color={color} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-black text-xl uppercase tracking-wider">
            {spec.name}
          </span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-medium text-[10px] text-slate-300 uppercase tracking-wide">
            {spec.role}
          </span>
        </div>
        {picked ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 font-semibold text-emerald-300 text-xs">
            <FaCheck aria-label="Your pick" />
            Picked
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-x-3 gap-y-1.5 text-xs">
        {statBars(kind).map((bar) => (
          <div key={bar.key} className="contents">
            <dt className="font-medium text-slate-400">{bar.label}</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-slate-800/80">
              <span
                className="block h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(bar.fraction * 100)}%`,
                  background: `linear-gradient(90deg, rgb(56 189 248) 0%, rgb(147 197 253) 100%)`,
                  boxShadow: "0 0 8px rgba(56, 189, 248, 0.4)",
                }}
              />
            </dd>
            <dd className="text-right font-semibold text-slate-200 tabular-nums">
              {bar.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["specialA", "specialB"] as const).map((slot) => {
          const special = spec[slot];
          return (
            <div
              key={slot}
              className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-900/40 p-3"
            >
              <p className="flex items-center gap-2 font-bold text-sm">
                <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
                  <ActionIcon kind={kind} action={slot} />
                </span>
                {special.name}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-300 leading-relaxed">
                {special.description}
              </p>
              <p className="mt-2 flex items-center gap-1 font-medium text-[10px] text-sky-300">
                <span className="rounded bg-sky-500/15 px-1.5 py-0.5">
                  {special.cooldown} round cooldown
                </span>
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
  connected,
  submitted,
  picked,
  deadline,
  entries,
  previewColor,
  onPick,
  onSecond,
}: {
  player: boolean;
  connected: boolean;
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
        <PickStatus entries={entries} lockedCount={lockedCount} />
        {player ? (
          <ConfirmButton
            done={done}
            connected={connected}
            picked={picked}
            focused={focused}
            onPick={onPick}
          />
        ) : (
          <p className="text-slate-300 text-sm">Spectating tank selection</p>
        )}
      </div>
    </section>
  );
}

function PickStatus({
  entries,
  lockedCount,
}: {
  entries: RosterEntry[];
  lockedCount: number;
}) {
  return (
    <ul
      aria-label={`Pick status, ${lockedCount} of ${entries.length} picked`}
      className="flex max-h-16 flex-1 flex-wrap gap-1.5 overflow-y-auto"
    >
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
  );
}

function confirmLabel(
  done: boolean,
  connected: boolean,
  picked: TankKind | null,
  focused: TankKind,
) {
  if (done) return picked ? `${TANKS[picked].name} locked` : "Locked in";
  if (!connected) return "Reconnecting...";
  return `Confirm ${TANKS[focused].name}`;
}

function ConfirmButton({
  done,
  connected,
  picked,
  focused,
  onPick,
}: {
  done: boolean;
  connected: boolean;
  picked: TankKind | null;
  focused: TankKind;
  onPick: (kind: TankKind) => void;
}) {
  const Icon = done ? FaCheck : FaLock;
  return (
    <button
      type="button"
      disabled={done || !connected}
      onClick={() => onPick(focused)}
      className={[
        "flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 px-8 font-black text-base uppercase tracking-wider outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white",
        done
          ? "border-emerald-300/40 bg-gradient-to-b from-emerald-400 to-emerald-600 text-emerald-950 shadow-[0_4px_20px_rgba(52,211,153,0.35)]"
          : "border-sky-300/40 bg-gradient-to-b from-sky-400 to-sky-600 text-sky-950 shadow-[0_4px_20px_rgba(56,189,248,0.35)] enabled:hover:scale-105 enabled:hover:shadow-[0_6px_28px_rgba(56,189,248,0.45)] disabled:opacity-60",
      ].join(" ")}
    >
      <Icon aria-hidden="true" />{" "}
      {confirmLabel(done, connected, picked, focused)}
    </button>
  );
}
