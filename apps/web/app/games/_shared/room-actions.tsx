"use client";

import { CAR_FOOTBALL } from "@kyzen/shared/constants";
import {
  type GameMeta,
  isGameCode,
  normalizeGameCode,
} from "@kyzen/shared/types";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  FaArrowRightToBracket,
  FaPlay,
  FaPlus,
  FaXmark,
} from "react-icons/fa6";
import { ensureIdentity } from "@/lib/auth/ensure-identity";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

const JOIN_ERRORS: Record<string, string> = {
  not_found: "No room with that code.",
  full: "That room is already full.",
  already_started: "That game has already started.",
  finished: "That game has already finished.",
};

export function RoomActions({ meta }: { meta: GameMeta }) {
  const router = useRouter();
  const { socket } = useSocket();
  const [panel, setPanel] = useState<"none" | "join">("none");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"play" | "create" | "join" | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const play = useCallback(async () => {
    setBusy("play");
    try {
      const created = await ensureIdentity();
      if (created) window.location.assign(`/play/find/${meta.type}`);
      else router.push(`/play/find/${meta.type}`);
    } catch {
      setBusy(null);
    }
  }, [router, meta.type]);

  const create = useCallback(async () => {
    setBusy("create");
    try {
      const created = await ensureIdentity();
      if (created) window.location.assign(`/play/new/${meta.type}`);
      else router.push(`/play/new/${meta.type}`);
    } catch {
      setBusy(null);
    }
  }, [router, meta.type]);

  const join = useCallback(async () => {
    setJoinError(null);
    const normalized = normalizeGameCode(code);
    if (!isGameCode(normalized)) {
      setJoinError("That doesn't look like a valid code.");
      return;
    }
    setBusy("join");
    try {
      const created = await ensureIdentity();
      if (created) {
        window.location.assign(`/play/${normalized}`);
        return;
      }
      if (socket?.connected) {
        try {
          const res = await emitAck<{ ok: true; code: string }>(
            socket,
            "room:join",
            { code: normalized },
          );
          router.push(`/play/${res.code}`);
          return;
        } catch (e) {
          const message = e instanceof Error ? e.message : "";
          const friendly = JOIN_ERRORS[message];
          if (friendly) {
            setJoinError(friendly);
            setBusy(null);
            return;
          }
        }
      }
      router.push(`/play/${normalized}`);
    } catch {
      setJoinError("Something went wrong. Try again.");
      setBusy(null);
    }
  }, [code, router, socket]);

  return (
    <div className="w-full space-y-3">
      {meta.type !== CAR_FOOTBALL ? (
        <button
          type="button"
          onClick={play}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 font-semibold text-base text-primary-foreground shadow-lg outline-none transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
        >
          <FaPlay size={16} aria-hidden="true" />
          {busy === "play" ? "Finding a match..." : "Play now"}
        </button>
      ) : (
        <p className="rounded-2xl border border-border bg-surface-raised p-4 text-muted-foreground text-sm">
          Create a room and invite three players for a 2v2 match.
        </p>
      )}

      <p className="pt-2 font-semibold text-muted-foreground text-xs uppercase tracking-[0.25em]">
        Play with friends
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={create}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface-raised px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay disabled:pointer-events-none disabled:opacity-60"
        >
          <FaPlus size={14} aria-hidden="true" />
          {busy === "create" ? "Creating..." : "Create room"}
        </button>
        <button
          type="button"
          onClick={() => {
            setJoinError(null);
            setPanel((p) => (p === "join" ? "none" : "join"));
          }}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface-raised px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay disabled:pointer-events-none disabled:opacity-60"
        >
          <FaArrowRightToBracket size={14} aria-hidden="true" />
          Join by code
        </button>
      </div>

      <AnimatePresence>
        {panel === "join" ? (
          <m.div
            initial={{ scaleY: 0.95, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ scaleY: 0.95, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="origin-top overflow-hidden"
          >
            <div className="space-y-2 rounded-2xl border border-border bg-surface-raised p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-card-foreground text-sm">
                  Enter a room code
                </span>
                <button
                  type="button"
                  onClick={() => setPanel("none")}
                  aria-label="Close"
                  className="rounded p-1 text-muted-foreground outline-none transition hover:text-card-foreground"
                >
                  <FaXmark size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void join();
                  }}
                  aria-label="Room code"
                  placeholder="A2K9P7"
                  maxLength={6}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-card-foreground text-lg uppercase tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => void join()}
                  disabled={busy === "join" || code.length === 0}
                  className="shrink-0 rounded-lg bg-primary px-4 font-medium text-primary-foreground text-sm outline-none transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy === "join" ? "..." : "Join"}
                </button>
              </div>
              {joinError ? (
                <p className="text-destructive text-xs">{joinError}</p>
              ) : null}
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
