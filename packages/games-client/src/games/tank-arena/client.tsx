"use client";

import { arenaWidth, canUse, isJumpAction } from "@kyzen/games-core";
import type { TankAction, TankArenaState, TankKind } from "@kyzen/shared/types";
import { useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GameClientProps } from "../../types";
import { ArenaCanvas } from "./arena-canvas";
import { useTankAudio } from "./audio";
import {
  aimPreview,
  type SceneState,
  useAims,
  useAirstrikeSiren,
  useElementHeight,
  usePendingLock,
  usePlanState,
  useResolutionReplay,
  useSceneSync,
} from "./hooks";
import { Nameplates } from "./hud";
import { MatchHud } from "./match-hud";
import {
  actionFromKey,
  actionSlots,
  aimFromDrag,
  airstrikeWarning,
  type BoardMode,
  deriveMode,
  localRoleOf,
  lockSummary,
  nudgeAim,
  parseTankState,
  rosterEntries,
  tankOf,
  teamColor,
} from "./model";
import { sceneContext } from "./replay";
import type { ArenaHandle } from "./view";

export function TankArenaBoard(props: GameClientProps) {
  const state = useMemo(
    () => parseTankState(props.game.gameState),
    [props.game.gameState],
  );
  if (!state) {
    return (
      <p
        role="alert"
        className="m-auto rounded-xl border border-border bg-card p-4 text-card-foreground text-sm"
      >
        This match could not be displayed. Reload the page to try again.
      </p>
    );
  }
  return <TankArenaMatch {...props} state={state} />;
}

function phaseLabel(mode: BoardMode, round: number | null) {
  switch (mode) {
    case "select":
      return "Pick your tank";
    case "plan":
      return "Plan and lock your move";
    case "locked":
      return "Locked in, waiting for the others";
    case "replay":
      return `Round ${round ?? ""} plays out`;
    case "spectate":
      return "Spectating";
    case "finished":
      return "Match over";
  }
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function TankArenaMatch({
  game,
  userId,
  connected,
  makeMove,
  state,
}: GameClientProps & { state: TankArenaState }) {
  const localRole = localRoleOf(game.players, game.viewerId ?? userId);
  const reducedMotion = useReducedMotion() ?? false;
  const sounds = useTankAudio();
  const [scene, setScene] = useState<SceneState>({
    handle: null,
    failed: false,
  });
  const [pickedKind, setPickedKind] = useState<TankKind | null>(null);
  const [dragging, setDragging] = useState(false);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topHeight = useElementHeight(topRef);
  const bottomHeight = useElementHeight(bottomRef);
  const deadline = game.turnDeadline ?? null;
  const live = game.status === "active";

  const ctx = useMemo(
    () => sceneContext(state, game.players, localRole, pickedKind),
    [state, game.players, localRole, pickedKind],
  );
  const replay = useResolutionReplay({ state, ctx, scene, deadline, sounds });
  const mode = deriveMode({ state, localRole, replaying: replay.active });
  const plan = usePlanState(state, localRole);
  const me = tankOf(state, localRole);
  const submitted = localRole ? state.submitted.includes(localRole) : false;
  const lockState = usePendingLock(state.round, submitted);
  const planning = mode === "plan" && live && !lockState.pending;
  const aims = useAims(state, localRole, mode, plan.aim);
  const preview = useMemo(
    () =>
      mode === "plan" || mode === "locked"
        ? aimPreview(
            state,
            localRole,
            plan.action,
            plan.aim,
            mode === "locked" || lockState.pending,
          )
        : null,
    [mode, state, localRole, plan.action, plan.aim, lockState.pending],
  );

  useSceneSync({
    scene,
    state,
    ctx,
    mode,
    localRole,
    replayActive: replay.active,
    reducedMotion,
    aims,
    preview,
  });
  useAirstrikeSiren(state, replay.active, sounds);

  useEffect(() => {
    scene.handle?.setInsets({
      top: topHeight + 12,
      bottom: bottomHeight + 12,
    });
  }, [scene.handle, topHeight, bottomHeight]);

  const onReady = useCallback(
    (handle: ArenaHandle | null, failed: boolean) =>
      setScene({ handle, failed }),
    [],
  );

  const lock = () => {
    if (!planning || !connected || !me?.kind) return;
    makeMove({
      type: "lock",
      round: state.round,
      action: plan.action,
      angle: plan.aim.angle,
      power: plan.aim.power,
    });
    lockState.markPending();
    sounds.play("lock");
  };

  const pick = (kind: TankKind) => {
    if (!live || !connected || mode !== "select" || submitted) return;
    setPickedKind(kind);
    makeMove({ type: "select", round: 0, tank: kind });
    sounds.play("select");
  };

  const selectAction = (action: TankAction) => {
    if (!localRole || !canUse(state, localRole, action)) return;
    plan.setAction(action);
  };

  const aimAt = (clientX: number, clientY: number) => {
    const point = scene.handle?.screenToWorld(clientX, clientY);
    if (!point || !me?.kind) return;
    plan.setAim(
      aimFromDrag(
        { x: me.x, y: me.y },
        point,
        arenaWidth(state),
        isJumpAction(me.kind, plan.action),
      ),
    );
  };

  const onPlanKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      isEditable(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    if (event.key === "Enter") {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      lock();
      return;
    }
    const action = actionFromKey(event.key);
    if (action) {
      selectAction(action);
      return;
    }
    const next = nudgeAim(
      plan.aim,
      event.key,
      event.shiftKey,
      isJumpAction(me?.kind ?? null, plan.action),
    );
    if (next) {
      event.preventDefault();
      plan.setAim(next);
    }
  });

  useEffect(() => {
    if (!planning) return;
    const onKey = (event: KeyboardEvent) => onPlanKey(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [planning]);

  const onSecond = useCallback(
    (seconds: number) => {
      if (seconds > 0 && seconds <= 5) sounds.play("tick");
    },
    [sounds],
  );

  const shownState =
    replay.active && state.resolution
      ? { ...state, tanks: state.resolution.before.tanks }
      : state;
  const roster = rosterEntries(shownState, game.players, localRole);
  const label = phaseLabel(mode, replay.round);

  return (
    <div
      className="relative isolate min-h-105 w-full flex-1 overflow-hidden rounded-2xl bg-[#020812] text-slate-50"
      data-mode={mode}
    >
      <ArenaCanvas
        reducedMotion={reducedMotion}
        interactive={planning}
        label={`Tank Arena, ${label}. Drag from your tank to aim, or use the arrow keys.`}
        minimap={minimapRef}
        onReady={onReady}
        onAimStart={(x, y) => {
          setDragging(true);
          aimAt(x, y);
        }}
        onAimMove={aimAt}
        onAimEnd={() => setDragging(false)}
      >
        <Nameplates
          entries={
            replay.active
              ? roster.map((entry) => ({ ...entry, locked: false }))
              : roster
          }
        />
      </ArenaCanvas>
      <p className="sr-only" aria-live="polite">
        {label}
      </p>
      <MatchHud
        mode={mode}
        phase={state.phase}
        round={mode === "replay" ? (replay.round ?? state.round) : state.round}
        label={label}
        deadline={deadline}
        timerActive={mode === "plan" && !lockState.pending}
        summary={lockSummary(state)}
        roster={roster}
        airstrike={airstrikeWarning(state) !== null && mode !== "replay"}
        player={Boolean(localRole)}
        live={live}
        submitted={submitted}
        picked={pickedKind}
        previewColor={localRole ? teamColor(state, localRole) : 0x3edcff}
        kind={me?.kind ?? null}
        slots={actionSlots(state, localRole)}
        action={plan.action}
        aim={plan.aim}
        pending={lockState.pending}
        dragging={dragging}
        replayRound={replay.round}
        refs={{ top: topRef, bottom: bottomRef, minimap: minimapRef }}
        onPick={pick}
        onSecond={onSecond}
        onSelectAction={selectAction}
        onLock={lock}
        onSkip={replay.skip}
        onLeave={() => makeMove({ type: "forfeit", round: state.round })}
      />
    </div>
  );
}
