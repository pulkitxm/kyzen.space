"use client";

import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { type ArenaStatus, createArenaLifecycle } from "./arena-lifecycle";
import type { ArenaHandle } from "./view";

export function ArenaCanvas({
  reducedMotion,
  interactive,
  label,
  minimap,
  onReady,
  onAimStart,
  onAimMove,
  onAimEnd,
  children,
}: {
  reducedMotion: boolean;
  interactive: boolean;
  label: string;
  minimap: RefObject<HTMLCanvasElement | null>;
  onReady: (handle: ArenaHandle | null, failed: boolean) => void;
  onAimStart: (clientX: number, clientY: number) => void;
  onAimMove: (clientX: number, clientY: number) => void;
  onAimEnd: () => void;
  children?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  const [status, setStatus] = useState<ArenaStatus>("loading");

  const report = useEffectEvent((handle: ArenaHandle | null, failed: boolean) =>
    onReady(handle, failed),
  );
  const motionPreference = useEffectEvent(() => reducedMotion);
  const minimapCanvas = useEffectEvent(() => minimap.current);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const lifecycle = createArenaLifecycle((next, handle) => {
      setStatus(next);
      report(handle, next === "failed");
    });
    import("./scene")
      .then((module) => {
        if (cancelled) return;
        lifecycle.start((events) =>
          module.mountArena(container, {
            overlay: overlayRef.current,
            minimap: minimapCanvas(),
            reducedMotion: motionPreference(),
            ...events,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) lifecycle.fail();
      });
    return () => {
      cancelled = true;
      lifecycle.dispose();
      report(null, false);
    };
  }, []);

  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== event.pointerId) return;
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onAimEnd();
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        role="img"
        aria-label={label}
        className={[
          "absolute inset-0 overflow-hidden",
          interactive ? "cursor-crosshair touch-none" : "",
        ].join(" ")}
        onPointerDown={(event) => {
          if (!interactive || status !== "ready") return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          draggingRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          onAimStart(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current !== event.pointerId) return;
          onAimMove(event.clientX, event.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      />
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {children}
      </div>
      {status === "failed" ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p
            role="status"
            className="glass-pane max-w-sm rounded-xl border border-border bg-card/80 p-4 text-center text-card-foreground text-sm"
          >
            The 3D arena could not start because WebGL is unavailable on this
            device. You can still pick actions, aim with the arrow keys, and
            lock in your plan.
          </p>
        </div>
      ) : null}
      {status === "restoring" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60 p-6">
          <p
            role="status"
            className="glass-pane max-w-sm rounded-xl border border-border bg-card/80 p-4 text-center text-card-foreground text-sm"
          >
            Restoring graphics...
          </p>
        </div>
      ) : null}
      {status === "loading" ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-linear-to-b from-sky-950/60 to-slate-950/80"
        />
      ) : null}
    </div>
  );
}
