"use client";

import type { ConfigField, GameMeta } from "@gamelobby/games-core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConversationPicker } from "@/app/games/components/conversation-picker";

/**
 * Shared lobby for every game: an optional setup form (rendered from the game's
 * declared `configFields`) followed by the common "Play with a friend" entry.
 * The collected `config` is forwarded to game creation. A game with no
 * `configFields` (e.g. tic-tac-toe) shows just the play button — identical to
 * the old per-game page. New games reuse this verbatim.
 */
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
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(configFields.map((f) => [f.key, f.default])),
  );

  const setField = (key: string, value: unknown) =>
    setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="mt-8 max-w-sm space-y-6">
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

      <button
        type="button"
        onClick={() => (userId ? setOpen(true) : router.push("/auth"))}
        className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground text-sm shadow outline-none transition hover:opacity-90"
      >
        Play with a friend
      </button>

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
          className="size-4 accent-[var(--color-primary)]"
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

  // select
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
