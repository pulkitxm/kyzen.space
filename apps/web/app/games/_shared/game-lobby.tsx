"use client";

import type {
  ConfigField,
  GameMeta,
  ServerMatchFoundPayload,
} from "@gamelobby/shared/types";
import { useAtom } from "jotai";
import { m, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FaLink, FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
import { ConversationPicker } from "@/app/games/components/conversation-picker";
import { ensureIdentity } from "@/lib/auth/ensure-identity";
import { createInviteLink } from "@/lib/invite-client";
import { matchmakingAtom } from "@/lib/matchmaking-atoms";
import { useSocket, useSocketEvent } from "@/lib/socket/socket-context";

export function GameLobby({
  meta,
  configFields,
  userId,
}: {
  meta: GameMeta;
  configFields: ConfigField[];
  userId: string | null;
}) {
  const router = useRouter();
  const { socket } = useSocket();
  const reduceMotion = useReducedMotion();
  const [matchmaking, setMatchmaking] = useAtom(matchmakingAtom);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(configFields.map((f) => [f.key, f.default])),
  );

  const setField = (key: string, value: unknown) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "busy" | "copied" | "error"
  >("idle");

  const inviteByLink = useCallback(async () => {
    setInviteStatus("busy");
    try {
      await ensureIdentity();
      const { url } = await createInviteLink(meta.type, config);
      await navigator.clipboard.writeText(url);
      setInviteStatus("copied");
      setTimeout(() => setInviteStatus("idle"), 2500);
    } catch {
      setInviteStatus("error");
      setTimeout(() => setInviteStatus("idle"), 2500);
    }
  }, [meta.type, config]);

  const searching = matchmaking.searching === meta.type;

  useSocketEvent<ServerMatchFoundPayload>("match_found", (payload) => {
    if (!payload?.gameId) return;
    setMatchmaking({ searching: null });
    router.push(`/play/${payload.gameId}`);
  });

  const findMatch = useCallback(async () => {
    setBusy(true);
    try {
      await ensureIdentity();
      socket?.emit("game:queue_join", { gameType: meta.type, config });
      setMatchmaking({ searching: meta.type });
    } catch {
      setMatchmaking({ searching: null });
    } finally {
      setBusy(false);
    }
  }, [socket, meta.type, config, setMatchmaking]);

  const cancelMatch = useCallback(() => {
    setMatchmaking({ searching: null });
    socket?.emit("game:queue_leave", { gameType: meta.type });
  }, [socket, meta.type, setMatchmaking]);

  const tap = reduceMotion ? undefined : { scale: 0.98 };

  return (
    <div className="mt-6 space-y-4">
      {configFields.length > 0 ? (
        <div className="space-y-4">
          {configFields.map((field) => (
            <ConfigFieldRow
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(v) => setField(field.key, v)}
            />
          ))}
        </div>
      ) : null}

      <m.button
        type="button"
        whileTap={tap}
        onClick={() => (userId ? setOpen(true) : router.push("/auth"))}
        className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground text-sm shadow outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
      >
        Play with a friend
      </m.button>

      <m.button
        type="button"
        whileTap={tap}
        onClick={inviteByLink}
        disabled={inviteStatus === "busy"}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <FaLink size={16} className="shrink-0" aria-hidden="true" />
        {inviteStatus === "busy"
          ? "Creating link…"
          : inviteStatus === "copied"
            ? "Link copied!"
            : inviteStatus === "error"
              ? "Couldn't create link"
              : "Invite a friend (link)"}
      </m.button>

      {searching ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-surface-raised px-4 py-3">
          <span className="flex items-center gap-2.5 text-card-foreground text-sm">
            <span className="relative inline-flex size-5 items-center justify-center">
              {reduceMotion ? null : (
                <m.span
                  aria-hidden
                  className="absolute inset-0 rounded-full border border-primary/60"
                  animate={{ scale: [0.6, 1.7], opacity: [0.7, 0] }}
                  transition={{
                    duration: 1.4,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeOut",
                  }}
                />
              )}
              <FaMagnifyingGlass
                size={14}
                className="text-primary"
                aria-hidden="true"
              />
            </span>
            Searching for an opponent…
          </span>
          <button
            type="button"
            onClick={cancelMatch}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-card-foreground text-xs outline-none transition hover:bg-surface-overlay"
          >
            <FaXmark size={14} aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : (
        <m.button
          type="button"
          whileTap={tap}
          disabled={busy}
          onClick={findMatch}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent px-4 py-3 font-medium text-card-foreground text-sm outline-none transition hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <FaMagnifyingGlass size={16} aria-hidden="true" />
          {busy ? "Starting…" : "Find a match"}
        </m.button>
      )}

      {open && userId ? (
        <ConversationPicker
          userId={userId}
          gameType={meta.type}
          config={config}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

const LABEL = "block font-medium text-foreground text-sm";
const CONTROL =
  "mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-card-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ConfigFieldRow({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "toggle") {
    return (
      <label className="flex items-center justify-between gap-3">
        <span className={LABEL}>{field.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-primary"
        />
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="block">
        <span className={LABEL}>{field.label}</span>
        <input
          type="number"
          value={Number(value ?? 0)}
          min={field.min}
          max={field.max}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className={CONTROL}
        />
      </label>
    );
  }

  return (
    <label className="block">
      <span className={LABEL}>{field.label}</span>
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={CONTROL}
      >
        {(field.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
