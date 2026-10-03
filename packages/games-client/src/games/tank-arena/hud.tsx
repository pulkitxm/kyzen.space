"use client";

import type { TankAction, TankKind } from "@kyzen/shared/types";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import {
  FaAnglesUp,
  FaBurst,
  FaCheck,
  FaCrosshairs,
  FaEye,
  FaForwardFast,
  FaJetFighterUp,
  FaLock,
  FaMeteor,
  FaShieldHalved,
  FaTriangleExclamation,
  FaTrowelBricks,
} from "react-icons/fa6";
import { CountdownRing } from "../../ui/countdown-ring";
import {
  type ActionSlot,
  type Aim,
  actionInfo,
  type CooldownPips,
  cssColor,
  type RosterEntry,
  secondsLeft,
} from "./model";
import { PANEL } from "./styles";

export function ActionIcon({
  kind,
  action,
}: {
  kind: TankKind | null;
  action: TankAction;
}) {
  switch (action) {
    case "missile":
      return <FaCrosshairs aria-hidden="true" />;
    case "jump":
      return <FaAnglesUp aria-hidden="true" />;
    case "shield":
      return <FaShieldHalved aria-hidden="true" />;
    case "specialA":
      return kind === "kestrel" ? (
        <FaMeteor aria-hidden="true" />
      ) : (
        <FaBurst aria-hidden="true" />
      );
    case "specialB":
      return kind === "kestrel" ? (
        <FaJetFighterUp aria-hidden="true" />
      ) : (
        <FaTrowelBricks aria-hidden="true" />
      );
    default:
      return <FaEye aria-hidden="true" />;
  }
}

export function RoundTimer({
  deadline,
  active,
  onSecond,
}: {
  deadline: number | null;
  active: boolean;
  onSecond?: (seconds: number) => void;
}) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const announce = useEffectEvent((value: number) => onSecond?.(value));

  useEffect(() => {
    if (deadline == null) return;
    let previous: number | null = null;
    const update = () => {
      const value = secondsLeft(deadline, Date.now());
      setSeconds(value);
      if (value !== null && value !== previous) {
        previous = value;
        if (active) announce(value);
      }
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [deadline, active]);

  const urgent = active && seconds !== null && seconds <= 5;
  const critical = active && seconds !== null && seconds <= 3;
  return (
    <CountdownRing deadline={deadline} active={active} size={46} stroke={3}>
      <span
        className={[
          "font-bold text-sm tabular-nums transition-all duration-200",
          critical
            ? "scale-110 animate-pulse text-red-400"
            : urgent
              ? "text-red-300"
              : "text-slate-50",
        ].join(" ")}
      >
        <span aria-hidden="true">{seconds ?? "--"}</span>
        <span className="sr-only">
          {seconds === null ? "No timer" : `${seconds} seconds left`}
        </span>
      </span>
    </CountdownRing>
  );
}

export function TopBar({
  round,
  phaseLabel,
  deadline,
  timerActive,
  locked,
  total,
  onSecond,
}: {
  round: number;
  phaseLabel: string;
  deadline: number | null;
  timerActive: boolean;
  locked: number;
  total: number;
  onSecond?: (seconds: number) => void;
}) {
  return (
    <div
      className={`${PANEL} pointer-events-auto flex items-center gap-3 px-3 py-1.5`}
    >
      <RoundTimer
        deadline={deadline}
        active={timerActive}
        onSecond={onSecond}
      />
      <div className="min-w-0 leading-tight">
        <p className="font-semibold text-sm">
          {round === 0 ? "Tank select" : `Round ${round}`}
        </p>
        <p className="text-slate-300 text-xs">{phaseLabel}</p>
      </div>
      <p className="ml-1 rounded-md bg-white/10 px-2 py-1 font-medium text-xs tabular-nums">
        <FaLock aria-hidden="true" className="mr-1 inline size-3" />
        <span aria-hidden="true">
          {locked}/{total}
        </span>
        <span className="sr-only">
          {locked} of {total} players locked in
        </span>
      </p>
    </div>
  );
}

function HealthBar({
  hp,
  maxHp,
  color,
  slim = false,
  scene = false,
}: {
  hp: number;
  maxHp: number;
  color: number;
  slim?: boolean;
  scene?: boolean;
}) {
  const fraction = maxHp > 0 ? Math.min(1, Math.max(0, hp / maxHp)) : 0;
  const [trail, setTrail] = useState(fraction);

  useEffect(() => {
    if (fraction >= trail) {
      setTrail(fraction);
      return;
    }
    const timeout = setTimeout(() => setTrail(fraction), 400);
    return () => clearTimeout(timeout);
  }, [fraction, trail]);

  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-full bg-black/55 ring-1 ring-white/20",
        slim ? "h-1.5" : "h-2",
      ].join(" ")}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-red-500/70 transition-[width] duration-500"
        style={{ width: `${trail * 100}%` }}
      />
      <div
        data-hp-fill={scene ? "" : undefined}
        className="relative h-full rounded-full transition-[width] duration-200"
        style={{
          width: `${fraction * 100}%`,
          backgroundColor: cssColor(color),
        }}
      />
    </div>
  );
}

export function Roster({ entries }: { entries: RosterEntry[] }) {
  return (
    <ul
      aria-label="Players"
      className={`${PANEL} pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto p-1.5 md:max-h-[40vh] md:w-56 md:flex-col md:overflow-y-auto md:overflow-x-hidden`}
    >
      {entries.map((entry) => (
        <li
          key={entry.role}
          className={[
            "flex min-w-36 shrink-0 items-center gap-2 rounded-lg px-2 py-1",
            entry.local ? "bg-white/12" : "bg-white/4",
            entry.alive ? "" : "opacity-45",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: cssColor(entry.color) }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs">
              <span className="truncate font-medium">
                {entry.name}
                {entry.local ? " (you)" : ""}
              </span>
              <span className="ml-auto text-slate-300 tabular-nums">
                {entry.alive ? Math.round(entry.hp) : "out"}
              </span>
            </div>
            <HealthBar
              hp={entry.alive ? entry.hp : 0}
              maxHp={entry.maxHp}
              color={entry.color}
              slim
            />
          </div>
          <span
            role="img"
            className={[
              "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]",
              entry.locked
                ? "bg-emerald-400 text-emerald-950"
                : "bg-white/10 text-transparent",
            ].join(" ")}
            aria-label={
              entry.locked
                ? `${entry.name} is locked in`
                : `${entry.name} is planning`
            }
            title={entry.locked ? "Locked in" : "Planning"}
          >
            <FaCheck aria-hidden="true" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Nameplates({ entries }: { entries: RosterEntry[] }) {
  return (
    <>
      {entries.map((entry) =>
        entry.alive && entry.kind ? (
          <div
            key={entry.role}
            data-plate={entry.role}
            className="invisible absolute top-0 left-0 w-24 select-none"
          >
            {entry.locked ? (
              <p className="mb-0.5 text-center font-black text-[10px] text-emerald-300 uppercase italic tracking-wider drop-shadow">
                Ready
              </p>
            ) : null}
            <div className="flex items-center gap-1">
              <span
                data-hp-text=""
                className="min-w-7 rounded-sm bg-black/60 px-1 text-center font-bold text-[10px] text-white tabular-nums"
              >
                {Math.round(entry.hp)}
              </span>
              <HealthBar
                hp={entry.hp}
                maxHp={entry.maxHp}
                color={entry.color}
                scene
              />
            </div>
            <p className="mt-0.5 truncate text-center font-semibold text-[10px] text-white drop-shadow">
              {entry.local ? "You" : entry.name}
            </p>
          </div>
        ) : null,
      )}
    </>
  );
}

export function ActionBar({
  kind,
  slots,
  selected,
  aim,
  locked,
  pending,
  connected,
  dimmed,
  onSelect,
  onLock,
}: {
  kind: TankKind | null;
  slots: ActionSlot[];
  selected: TankAction;
  aim: Aim;
  locked: boolean;
  pending: boolean;
  connected: boolean;
  dimmed: boolean;
  onSelect: (action: TankAction) => void;
  onLock: () => void;
}) {
  const info = actionInfo(kind, selected);
  return (
    <div
      className={[
        "pointer-events-auto flex w-full flex-col gap-2 transition-opacity md:w-auto md:flex-row md:items-end",
        dimmed ? "opacity-40" : "opacity-100",
      ].join(" ")}
    >
      <div className={`${PANEL} flex flex-col gap-1.5 p-2`}>
        <div
          role="toolbar"
          aria-label="Actions"
          className="grid grid-cols-5 gap-1.5"
        >
          {slots.map((slot, index) => {
            const details = actionInfo(kind, slot.action);
            const isSelected = slot.action === selected;
            const describedBy = `tank-action-${slot.action}`;
            return (
              <div key={slot.action} className="group relative">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-describedby={describedBy}
                  aria-keyshortcuts={`${index + 1}`}
                  disabled={!slot.enabled || locked}
                  onClick={() => onSelect(slot.action)}
                  className={[
                    "flex h-18 w-full min-w-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-xl outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-40 md:w-22",
                    isSelected
                      ? "scale-105 border-sky-300 bg-gradient-to-b from-white/25 to-white/10 shadow-[0_0_20px_rgba(125,211,252,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]"
                      : "border-white/20 bg-gradient-to-b from-white/8 to-white/3 enabled:hover:scale-102 enabled:hover:border-white/30 enabled:hover:bg-white/12",
                  ].join(" ")}
                >
                  <ActionIcon kind={kind} action={slot.action} />
                  <span className="line-clamp-2 max-w-full px-1 text-center font-medium text-[10px] leading-tight">
                    {details.label}
                  </span>
                  <CooldownDots pips={slot.pips} />
                </button>
                <span
                  id={describedBy}
                  role="tooltip"
                  className={`${PANEL} pointer-events-none invisible absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 p-2 text-[11px] leading-snug opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100`}
                >
                  <span className="block font-semibold">
                    {index + 1}. {details.label}
                  </span>
                  {details.description}
                  {slot.pips && !slot.pips.ready
                    ? ` Ready in ${slot.pips.total - slot.pips.filled} round${slot.pips.total - slot.pips.filled === 1 ? "" : "s"}.`
                    : ""}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-300" aria-live="polite">
          {info.label}
          {info.usesAngle ? ` · ${Math.round(aim.angle)} deg` : ""}
          {info.usesPower ? ` · ${Math.round(aim.power * 100)}% power` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onLock}
        disabled={locked || pending || !connected}
        aria-keyshortcuts="Enter"
        className={[
          "flex h-16 items-center justify-center gap-2 rounded-2xl border-2 px-8 font-black text-lg uppercase tracking-wider outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-sky-300 md:h-20",
          locked
            ? "border-emerald-300/50 bg-gradient-to-b from-emerald-400 to-emerald-600 text-emerald-950 shadow-[0_4px_20px_rgba(52,211,153,0.4)]"
            : "border-rose-400/50 bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_4px_20px_rgba(244,63,94,0.4)] enabled:hover:scale-105 enabled:hover:shadow-[0_6px_28px_rgba(244,63,94,0.5)] disabled:opacity-60",
        ].join(" ")}
      >
        {locked ? (
          <>
            <FaCheck aria-hidden="true" /> Locked
          </>
        ) : (
          <>
            <FaLock aria-hidden="true" />{" "}
            {connected ? (pending ? "Locking" : "Lock in") : "Reconnecting..."}
          </>
        )}
      </button>
    </div>
  );
}

function CooldownDots({ pips }: { pips: CooldownPips | null }) {
  if (!pips || pips.total === 0) return <span className="h-1.5" />;
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: pips.total }, (_, i) => `pip-${i}`).map(
        (key, i) => (
          <span
            key={key}
            className={[
              "size-1.5 rounded-full",
              i < pips.filled ? "bg-sky-300" : "bg-white/20",
            ].join(" ")}
          />
        ),
      )}
    </span>
  );
}

export function AirstrikeBanner() {
  return (
    <div
      role="alert"
      className="pointer-events-none overflow-hidden rounded-lg border border-amber-300/60 font-black text-amber-950 text-xs uppercase tracking-[0.2em] shadow-lg"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(251,191,36,0.95) 0 14px, rgba(20,16,4,0.9) 14px 28px)",
      }}
    >
      <p className="m-1 flex items-center gap-2 rounded-md bg-amber-300 px-3 py-1">
        <FaTriangleExclamation aria-hidden="true" />
        Airstrike lands after this round
        <FaTriangleExclamation aria-hidden="true" />
      </p>
    </div>
  );
}

export function ReplayBar({
  round,
  onSkip,
}: {
  round: number;
  onSkip: () => void;
}) {
  return (
    <div
      className={`${PANEL} pointer-events-auto flex items-center gap-3 px-3 py-2`}
    >
      <p className="font-medium text-sm">Round {round} in motion</p>
      <button
        type="button"
        onClick={onSkip}
        className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 font-semibold text-xs outline-none transition hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <FaForwardFast aria-hidden="true" /> Skip
      </button>
    </div>
  );
}

export function StatusBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className={`${PANEL} pointer-events-none px-4 py-2 text-center font-medium text-sm`}
    >
      {children}
    </div>
  );
}

export function RoundBanner({
  round,
  visible,
}: {
  round: number;
  visible: boolean;
}) {
  const [show, setShow] = useState(false);
  const [displayRound, setDisplayRound] = useState(round);

  useEffect(() => {
    if (visible && round > 0) {
      setDisplayRound(round);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 2200);
      return () => clearTimeout(timer);
    }
  }, [visible, round]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="flex animate-[roundBannerIn_0.4s_ease-out,roundBannerOut_0.5s_ease-in_1.7s_forwards] flex-col items-center"
        style={{
          textShadow:
            "0 4px 24px rgba(0,0,0,0.8), 0 0 60px rgba(0,150,255,0.4)",
        }}
      >
        <span className="font-black text-sky-300 text-sm uppercase tracking-[0.4em]">
          Round
        </span>
        <span
          className="font-black text-7xl text-white tabular-nums sm:text-9xl"
          style={{
            textShadow:
              "0 0 40px rgba(100,200,255,0.6), 0 8px 32px rgba(0,0,0,0.7)",
          }}
        >
          {displayRound}
        </span>
      </div>
    </div>
  );
}

export function EventToast({
  message,
  color,
  icon,
}: {
  message: string;
  color: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className="flex animate-[toastIn_0.3s_ease-out,toastOut_0.4s_ease-in_2s_forwards] items-center gap-2 rounded-lg px-3 py-2 font-semibold text-sm shadow-lg"
      style={{
        backgroundColor: color,
        boxShadow: `0 4px 20px ${color}40`,
      }}
    >
      {icon}
      {message}
    </div>
  );
}
