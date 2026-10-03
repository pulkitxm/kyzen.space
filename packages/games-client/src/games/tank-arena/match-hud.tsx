"use client";

import type { TankAction, TankArenaState, TankKind } from "@kyzen/shared/types";
import { type RefObject, useEffect, useState } from "react";
import { FaDoorOpen } from "react-icons/fa6";
import {
  ActionBar,
  AirstrikeBanner,
  PANEL,
  ReplayBar,
  Roster,
  StatusBanner,
  TopBar,
} from "./hud";
import type { ActionSlot, Aim, BoardMode, RosterEntry } from "./model";
import { SelectScreen } from "./select-screen";

type HudRefs = {
  top: RefObject<HTMLDivElement | null>;
  bottom: RefObject<HTMLDivElement | null>;
  minimap: RefObject<HTMLCanvasElement | null>;
};

export type MatchHudProps = {
  mode: BoardMode;
  phase: TankArenaState["phase"];
  round: number;
  label: string;
  deadline: number | null;
  timerActive: boolean;
  summary: { locked: number; total: number };
  roster: RosterEntry[];
  airstrike: boolean;
  player: boolean;
  live: boolean;
  submitted: boolean;
  picked: TankKind | null;
  previewColor: number;
  kind: TankKind | null;
  slots: ActionSlot[];
  action: TankAction;
  aim: Aim;
  pending: boolean;
  dragging: boolean;
  replayRound: number | null;
  refs: HudRefs;
  onPick: (kind: TankKind) => void;
  onSecond: (seconds: number) => void;
  onSelectAction: (action: TankAction) => void;
  onLock: () => void;
  onSkip: () => void;
  onLeave: () => void;
};

function spectatorText(phase: TankArenaState["phase"], player: boolean) {
  if (!player) return "Spectating";
  return phase === "select"
    ? "Waiting for tank picks"
    : "Your tank is out. Spectating the rest of the match.";
}

export function MatchHud(props: MatchHudProps) {
  const { mode, phase, refs } = props;
  const selecting = phase === "select";
  const showPlanBar = mode === "plan" || mode === "locked";
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-2 sm:p-3">
      <div
        ref={refs.top}
        className="relative flex flex-col items-start gap-2 pr-14"
      >
        {selecting ? null : (
          <>
            <TopBar
              round={props.round}
              phaseLabel={props.label}
              deadline={props.deadline}
              timerActive={props.timerActive}
              locked={props.summary.locked}
              total={props.summary.total}
              onSecond={props.onSecond}
            />
            <div className="w-full md:absolute md:top-full md:left-0 md:mt-2 md:w-auto">
              <Roster entries={props.roster} />
            </div>
          </>
        )}
        <div
          aria-hidden="true"
          className={[
            "h-9 w-full md:absolute md:top-0 md:right-14 md:w-[min(22rem,40%)]",
            selecting ? "hidden" : "",
          ].join(" ")}
        >
          <canvas
            ref={refs.minimap}
            className="invisible size-full rounded-md border border-white/20"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        {props.airstrike ? <AirstrikeBanner /> : null}
        {mode === "spectate" ? (
          <StatusBanner>{spectatorText(phase, props.player)}</StatusBanner>
        ) : null}
        {mode === "locked" ? (
          <StatusBanner>
            Locked in. {props.summary.locked} of {props.summary.total} ready.
          </StatusBanner>
        ) : null}
      </div>

      {selecting ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <SelectScreen
            player={props.player && props.live}
            submitted={props.submitted}
            picked={props.picked}
            deadline={props.deadline}
            entries={props.roster}
            previewColor={props.previewColor}
            onPick={props.onPick}
            onSecond={props.onSecond}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div
        ref={refs.bottom}
        className="flex flex-col items-center gap-2 md:flex-row md:items-end md:justify-between"
      >
        {mode === "replay" && props.replayRound !== null ? (
          <div className="mx-auto">
            <ReplayBar round={props.replayRound} onSkip={props.onSkip} />
          </div>
        ) : null}
        {showPlanBar ? (
          <>
            <ActionBar
              kind={props.kind}
              slots={props.slots}
              selected={props.action}
              aim={props.aim}
              locked={mode === "locked"}
              pending={props.pending}
              dimmed={props.dragging}
              onSelect={props.onSelectAction}
              onLock={props.onLock}
            />
            {mode === "plan" && !props.pending ? (
              <LeaveButton onLeave={props.onLeave} />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function LeaveButton({ onLeave }: { onLeave: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);
  return (
    <button
      type="button"
      onClick={() => {
        if (confirming) onLeave();
        else setConfirming(true);
      }}
      className={`${PANEL} pointer-events-auto flex items-center gap-1.5 px-3 py-2 font-medium text-xs outline-none transition hover:bg-rose-500/30 focus-visible:ring-2 focus-visible:ring-sky-300`}
    >
      <FaDoorOpen aria-hidden="true" />
      {confirming ? "Confirm leaving" : "Leave match"}
    </button>
  );
}
