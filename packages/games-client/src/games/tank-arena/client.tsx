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
  type AimDrag,
  actionSlots,
  aimFromDrag,
  airstrikeWarning,
  type BoardMode,
  beginAimDrag,
  deriveMode,
  dragPoint,
  localRoleOf,
  lockSummary,
  parseTankState,
  replayView,
  rosterEntries,
  tankOf,
  teamColor,
} from "./model";
import { sceneContext } from "./replay";
import { handlePlanKey } from "./shortcuts";
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
  const [left, setLeft] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<AimDrag | null>(null);
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
  const replay = useResolutionReplay({
    state,
    ctx,
    scene,
    deadline,
    live,
    sounds,
  });
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

  const aimAt = (point: { x: number; y: number } | null) => {
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

  const startAim = (clientX: number, clientY: number) => {
    const handle = scene.handle;
    dragRef.current = handle
      ? beginAimDrag(handle.screenToWorld, clientX, clientY)
      : null;
    setDragging(true);
    aimAt(dragRef.current?.press ?? null);
  };

  const moveAim = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const handle = scene.handle;
    if (!drag || !handle) return;
    aimAt(
      dragPoint(
        drag,
        handle.screenToWorld,
        clientX,
        clientY,
        arenaWidth(state),
      ),
    );
  };

  const endAim = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const leave = () => {
    if (!live || !connected || left) return;
    makeMove({ type: "forfeit", round: state.round });
    setLeft(true);
  };

  const onPlanKey = useEffectEvent((event: KeyboardEvent) => {
    handlePlanKey(
      event,
      { board: boardRef.current, body: document.body },
      {
        aim: plan.aim,
        jumpLike: isJumpAction(me?.kind ?? null, plan.action),
        lock,
        selectAction,
        setAim: plan.setAim,
      },
    );
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

  const shownState = replay.active ? replayView(state) : state;
  const roster = rosterEntries(shownState, game.players, localRole);
  const label = phaseLabel(mode, replay.round);

  return (
    <div
      ref={boardRef}
      className="relative isolate min-h-105 w-full flex-1 overflow-hidden rounded-2xl bg-[#020812] text-slate-50"
      data-mode={mode}
    >
      <ArenaCanvas
        deferred={state.phase === "select"}
        reducedMotion={reducedMotion}
        interactive={planning}
        label={`Tank Arena, ${label}. Drag from your tank to aim, or use the arrow keys.`}
        minimap={minimapRef}
        onReady={onReady}
        onAimStart={startAim}
        onAimMove={moveAim}
        onAimEnd={endAim}
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
        round={shownState.round}
        label={label}
        deadline={deadline}
        timerActive={mode === "plan" && !lockState.pending}
        summary={lockSummary(shownState)}
        roster={roster}
        airstrike={airstrikeWarning(state) !== null && mode !== "replay"}
        player={Boolean(localRole)}
        live={live}
        connected={connected}
        canLeave={!left}
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
        onLeave={leave}
      />
    </div>
  );
}
