"use client";

import {
  AVATAR_COLORS,
  AVATAR_OPTIONS,
  AVATAR_STYLES,
  type AvatarColorKey,
  type AvatarConfig,
  type AvatarOptionKey,
  type AvatarStyle,
  applyStyleToConfig,
  configsEqual,
  isHatTop,
  randomAvatarConfig,
} from "@gamelobby/avatar";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaPencil,
  FaShuffle,
  FaXmark,
} from "react-icons/fa6";
import { Button, Character } from "@/components/ui";
import { clientFetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const AVATAR_FRAME =
  "relative size-[5.75rem] shrink-0 overflow-hidden rounded-2xl ring-4 ring-card sm:size-24";

export function EditableAvatar({
  avatar,
  username,
  displayName,
}: {
  avatar: AvatarConfig | null;
  username: string;
  displayName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<AvatarConfig | null>(avatar);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Customize your character"
        className={cn(AVATAR_FRAME, "group cursor-pointer")}
      >
        <Character
          config={current}
          fallbackSeed={username}
          className="size-full"
          alt={`${displayName?.trim() || username} avatar`}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
          <FaPencil size={20} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <AvatarEditorModal
          initial={current ?? randomAvatarConfig(username)}
          onClose={() => setOpen(false)}
          onSaved={(saved) => {
            setCurrent(saved);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function AvatarEditorModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: AvatarConfig;
  onClose: () => void;
  onSaved: (config: AvatarConfig) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty = !configsEqual(draft, initial);

  const attemptClose = useCallback(() => {
    if (dirty) setConfirmOpen(true);
    else onClose();
  }, [dirty, onClose]);

  const setField = useCallback((key: keyof AvatarConfig, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onEscape = useEffectEvent(() => {
    if (confirmOpen) setConfirmOpen(false);
    else attemptClose();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await clientFetchJson<{ avatar: AvatarConfig }>(
        "/api/profiles/me/avatar",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      onSaved(res.avatar);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your character",
      );
      setSaving(false);
    }
  }, [draft, onSaved, router]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Customize your character"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close editor"
          onClick={attemptClose}
        />
        <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
          <header className="flex items-center justify-between border-border border-b px-5 py-4">
            <h2 className="font-semibold text-base text-card-foreground">
              Customize your character
            </h2>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-overlay hover:text-foreground"
            >
              <FaXmark size={16} aria-hidden="true" />
            </button>
          </header>

          <div className="flex shrink-0 flex-col px-4 pt-4 sm:px-5 sm:pt-5">
            <div className="flex flex-col items-center gap-3">
              <div className="size-28 overflow-hidden rounded-2xl ring-4 ring-surface-overlay sm:size-36">
                <Character
                  config={draft}
                  className="size-full"
                  alt="Character preview"
                />
              </div>
              <StyleControl
                value={draft.style ?? "any"}
                onChange={(style) =>
                  setDraft((prev) => applyStyleToConfig(prev, style))
                }
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setDraft((prev) => randomAvatarConfig(undefined, prev.style))
                }
              >
                <FaShuffle size={15} aria-hidden="true" /> Shuffle
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-4 flex w-full items-center justify-center gap-1.5 border-border border-t pt-4 pb-4 font-medium text-muted-foreground text-sm transition hover:text-foreground"
            >
              {showAll ? "Hide options" : "Customize manually"}
              <ChevronIcon dir={showAll ? "up" : "down"} />
            </button>
          </div>

          {showAll ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-5 sm:px-5">
              <ColorRow
                label="Skin"
                colorKey="skinColor"
                value={draft.skinColor}
                onChange={setField}
              />
              <OptionStepper
                label="Hair / Hat"
                optionKey="top"
                value={draft.top}
                onChange={setField}
              />
              <ColorRow
                label="Hair color"
                colorKey="hairColor"
                value={draft.hairColor}
                onChange={setField}
              />
              {isHatTop(draft.top) ? (
                <ColorRow
                  label="Hat color"
                  colorKey="hatColor"
                  value={draft.hatColor}
                  onChange={setField}
                />
              ) : null}
              <OptionStepper
                label="Eyes"
                optionKey="eyes"
                value={draft.eyes}
                onChange={setField}
              />
              <OptionStepper
                label="Eyebrows"
                optionKey="eyebrows"
                value={draft.eyebrows}
                onChange={setField}
              />
              <OptionStepper
                label="Mouth"
                optionKey="mouth"
                value={draft.mouth}
                onChange={setField}
              />
              <OptionStepper
                label="Facial hair"
                optionKey="facialHair"
                value={draft.facialHair}
                onChange={setField}
              />
              {draft.facialHair !== "none" ? (
                <ColorRow
                  label="Facial hair color"
                  colorKey="facialHairColor"
                  value={draft.facialHairColor}
                  onChange={setField}
                />
              ) : null}
              <OptionStepper
                label="Glasses"
                optionKey="accessories"
                value={draft.accessories}
                onChange={setField}
              />
              {draft.accessories !== "none" ? (
                <ColorRow
                  label="Glasses color"
                  colorKey="accessoriesColor"
                  value={draft.accessoriesColor}
                  onChange={setField}
                />
              ) : null}
              <OptionStepper
                label="Clothing"
                optionKey="clothing"
                value={draft.clothing}
                onChange={setField}
              />
              <ColorRow
                label="Clothing color"
                colorKey="clothesColor"
                value={draft.clothesColor}
                onChange={setField}
              />
              <ColorRow
                label="Background"
                colorKey="backgroundColor"
                value={draft.backgroundColor}
                onChange={setField}
              />
            </div>
          ) : null}

          <footer className="flex items-center justify-between gap-3 border-border border-t px-5 py-4">
            <p className="min-w-0 truncate text-danger text-sm">{error}</p>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="ghost" onClick={attemptClose}>
                Cancel
              </Button>
              <Button type="button" onClick={save} loading={saving}>
                Save
              </Button>
            </div>
          </footer>
        </div>
      </div>
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label="Unsaved changes"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="font-semibold text-base text-card-foreground">
              Unsaved changes
            </h3>
            <p className="mt-1.5 text-muted-foreground text-sm">
              You have unsaved changes to your character. Save them before
              closing?
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmOpen(false)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  setConfirmOpen(false);
                  onClose();
                }}
              >
                Discard
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  void save();
                }}
                loading={saving}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}

const STYLE_LABELS: Record<AvatarStyle, string> = {
  any: "Any",
  feminine: "Feminine",
  masculine: "Masculine",
};

function StyleControl({
  value,
  onChange,
}: {
  value: AvatarStyle;
  onChange: (style: AvatarStyle) => void;
}) {
  return (
    <fieldset
      className="flex w-44 min-w-0 rounded-lg border border-border bg-surface-overlay p-0.5"
      aria-label="Character style"
    >
      {AVATAR_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          aria-pressed={value === style}
          onClick={() => onChange(style)}
          className={cn(
            "flex-1 rounded-md px-1 py-1.5 font-medium text-[11px] transition",
            value === style
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {STYLE_LABELS[style]}
        </button>
      ))}
    </fieldset>
  );
}

function OptionStepper({
  label,
  optionKey,
  value,
  onChange,
}: {
  label: string;
  optionKey: AvatarOptionKey;
  value: string;
  onChange: (key: keyof AvatarConfig, value: string) => void;
}) {
  const options = AVATAR_OPTIONS[optionKey];
  const index = Math.max(0, options.indexOf(value));
  const step = (delta: number) => {
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(optionKey, next);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium text-card-foreground text-sm">{label}</span>
      <div className="flex items-center gap-1">
        <StepButton label={`Previous ${label}`} onClick={() => step(-1)}>
          <ChevronIcon dir="left" />
        </StepButton>
        <span className="min-w-32 text-center text-muted-foreground text-sm">
          {humanize(value)}
        </span>
        <StepButton label={`Next ${label}`} onClick={() => step(1)}>
          <ChevronIcon dir="right" />
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface-overlay text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
    >
      {children}
    </button>
  );
}

function ColorRow({
  label,
  colorKey,
  value,
  onChange,
}: {
  label: string;
  colorKey: AvatarColorKey;
  value: string;
  onChange: (key: keyof AvatarConfig, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-card-foreground text-sm">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_COLORS[colorKey].map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`${label}: #${hex}`}
            aria-pressed={value === hex}
            onClick={() => onChange(colorKey, hex)}
            className={cn(
              "size-7 rounded-full border transition",
              value === hex
                ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-card"
                : "border-border hover:scale-110",
            )}
            style={{ backgroundColor: `#${hex}` }}
          />
        ))}
      </div>
    </div>
  );
}

function humanize(value: string): string {
  if (value === "none") return "None";
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/(\d+)/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (ch) => ch.toUpperCase());
}

const CHEVRON_ICONS = {
  left: FaChevronLeft,
  right: FaChevronRight,
  up: FaChevronUp,
  down: FaChevronDown,
} as const;

function ChevronIcon({ dir }: { dir: keyof typeof CHEVRON_ICONS }) {
  const Icon = CHEVRON_ICONS[dir];
  return <Icon size={14} aria-hidden="true" />;
}
