"use client";

import {
  DISPLAY_NAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from "@kyzen/shared/constants";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FaCheck, FaXmark } from "react-icons/fa6";
import { GlassPane } from "@/components/glass/glass-pane";
import { Button } from "@/components/ui/button";
import { clientFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const CHECK_DEBOUNCE_MS = 350;

const REASON_TEXT: Record<string, string> = {
  format: "3–30 characters: lowercase letters, numbers, or underscores.",
  reserved: "That name is reserved.",
  taken: "That username is already taken.",
};

type AvailabilityResponse = {
  available: boolean;
  reason?: keyof typeof REASON_TEXT;
  suggestions?: string[];
};

type CheckState =
  | { kind: "idle" }
  | { kind: "current" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; reason: string; suggestions: string[] };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

function pluralizeDays(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

function deriveCheck(
  locked: boolean,
  normalized: string,
  isCurrent: boolean,
  result: { for: string; data: AvailabilityResponse | null } | null,
): CheckState {
  if (locked) return { kind: "current" };
  if (normalized.length === 0) return { kind: "idle" };
  if (isCurrent) return { kind: "current" };
  if (!result || result.for !== normalized) return { kind: "checking" };
  if (result.data === null) return { kind: "idle" };
  if (result.data.available) return { kind: "available" };
  return {
    kind: "unavailable",
    reason: REASON_TEXT[result.data.reason ?? "taken"] ?? "Not available.",
    suggestions: result.data.suggestions ?? [],
  };
}

export function AccountIdentityForm({
  name,
  username,
  usernameEditableAt,
  cooldownDays,
}: {
  name: string | null;
  username: string;
  usernameEditableAt: string | null;
  cooldownDays: number;
}) {
  return (
    <section aria-labelledby="identity-heading" className="mb-6">
      <h3 id="identity-heading" className="font-medium text-foreground text-sm">
        Profile
      </h3>
      <p className="mt-1 text-muted-foreground text-xs">
        Your display name and the username in your profile link.
      </p>
      <div className="mt-4 space-y-6">
        <DisplayNameField initialName={name ?? ""} />
        <UsernameField
          currentUsername={username}
          usernameEditableAt={usernameEditableAt}
          cooldownDays={cooldownDays}
        />
      </div>
    </section>
  );
}

function DisplayNameField({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const canSave =
    !pending &&
    trimmed.length >= 1 &&
    trimmed.length <= DISPLAY_NAME_MAX_LENGTH &&
    trimmed !== saved;

  const onSave = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await clientFetch("/api/profiles/me/name", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        setError("Could not save your name.");
        return;
      }
      setSaved(trimmed);
      setValue(trimmed);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <label
        htmlFor="display-name"
        className="font-medium text-foreground text-xs"
      >
        Display name
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id="display-name"
          value={value}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) {
              e.preventDefault();
              void onSave();
            }
          }}
          className="w-full max-w-xs rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          size="sm"
          loading={pending}
          disabled={!canSave}
          onClick={onSave}
        >
          Save
        </Button>
      </div>
      {error ? <p className="mt-1.5 text-danger text-xs">{error}</p> : null}
    </div>
  );
}

function UsernameField({
  currentUsername,
  usernameEditableAt,
  cooldownDays,
}: {
  currentUsername: string;
  usernameEditableAt: string | null;
  cooldownDays: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentUsername);
  const [saved, setSaved] = useState(currentUsername);
  const [result, setResult] = useState<{
    for: string;
    data: AvailabilityResponse | null;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestId = useRef(0);

  const locked = Boolean(usernameEditableAt);
  const normalized = value.trim().toLowerCase();
  const isCurrent = normalized === saved.toLowerCase();

  useEffect(() => {
    if (locked || normalized.length === 0 || isCurrent) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await clientFetch(
          `/api/profiles/me/username-available?u=${encodeURIComponent(normalized)}`,
        );
        const data = (await res.json()) as AvailabilityResponse;
        if (id !== requestId.current) return;
        setResult({ for: normalized, data });
      } catch {
        if (id === requestId.current)
          setResult({ for: normalized, data: null });
      }
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalized, isCurrent, locked]);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  const check = deriveCheck(locked, normalized, isCurrent, result);

  const canSave =
    !pending &&
    !locked &&
    !isCurrent &&
    check.kind === "available" &&
    USERNAME_PATTERN.test(normalized);

  const doSave = async () => {
    setConfirmOpen(false);
    setPending(true);
    setError(null);
    try {
      const res = await clientFetch("/api/profiles/me/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalized }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "Could not save your username.");
        return;
      }
      const data = (await res.json()) as { username: string };
      setSaved(data.username);
      setValue(data.username);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const requestSave = () => {
    if (!canSave) return;
    if (cooldownDays > 0) setConfirmOpen(true);
    else void doSave();
  };

  return (
    <div>
      <label htmlFor="username" className="font-medium text-foreground text-xs">
        Username
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm">
            @
          </span>
          <input
            id="username"
            value={value}
            disabled={locked}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                requestSave();
              }
            }}
            className="w-full rounded-xl border border-border bg-surface-raised py-2 pr-9 pl-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          <StatusIcon state={check} />
        </div>
        <Button
          size="sm"
          loading={pending}
          disabled={!canSave}
          onClick={requestSave}
        >
          Save
        </Button>
      </div>

      {locked && usernameEditableAt ? (
        <p className="mt-1.5 text-muted-foreground text-xs">
          You can change your username again on {formatDate(usernameEditableAt)}
          .
        </p>
      ) : (
        <UsernameStatus state={check} onPick={setValue} />
      )}
      {error ? <p className="mt-1.5 text-danger text-xs">{error}</p> : null}

      {confirmOpen ? (
        <div
          className="glass-scrim fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="Confirm username change"
        >
          <GlassPane className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="font-semibold text-base text-card-foreground">
              Change username?
            </h3>
            <p className="mt-1.5 text-muted-foreground text-sm">
              You can change your username only once every{" "}
              {pluralizeDays(cooldownDays)}. After saving{" "}
              <span className="font-medium text-foreground">@{normalized}</span>{" "}
              you won't be able to change it again for{" "}
              {pluralizeDays(cooldownDays)}.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" loading={pending} onClick={() => doSave()}>
                Change username
              </Button>
            </div>
          </GlassPane>
        </div>
      ) : null}
    </div>
  );
}

function StatusIcon({ state }: { state: CheckState }) {
  if (state.kind === "available" || state.kind === "current")
    return (
      <FaCheck
        size={14}
        aria-hidden="true"
        className="absolute top-1/2 right-3 -translate-y-1/2 text-success"
      />
    );
  if (state.kind === "unavailable")
    return (
      <FaXmark
        size={14}
        aria-hidden="true"
        className="absolute top-1/2 right-3 -translate-y-1/2 text-danger"
      />
    );
  return null;
}

function UsernameStatus({
  state,
  onPick,
}: {
  state: CheckState;
  onPick: (value: string) => void;
}) {
  if (state.kind === "available")
    return (
      <p className="mt-1.5 text-success text-xs">Username is available.</p>
    );
  if (state.kind === "unavailable")
    return (
      <div className="mt-1.5">
        <p className="text-danger text-xs">{state.reason}</p>
        {state.suggestions.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Try:</span>
            {state.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onPick(suggestion)}
                className={cn(
                  "rounded-full border border-border bg-surface-overlay px-2.5 py-0.5 text-xs",
                  "text-muted-foreground transition hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  return null;
}
