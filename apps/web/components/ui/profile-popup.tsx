"use client";

import type { AvatarConfig } from "@gamelobby/shared/types";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { m } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaRegCalendar, FaRegMessage, FaXmark } from "react-icons/fa6";
import { useLiquidLens } from "@/components/glass/liquid-glass";
import { Button } from "@/components/ui/button";
import { Character } from "@/components/ui/character";
import { Skeleton } from "@/components/ui/skeleton";
import { clientFetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ProfilePopupUser = {
  username: string;
  displayName?: string | null;
  avatar?: AvatarConfig | null;
};

type FetchedProfile = {
  username: string;
  displayName: string | null;
  avatar: AvatarConfig | null;
  createdAt: string;
};

type ProfileResponse = { profile: FetchedProfile };

const profilePopupUserAtom = atom<ProfilePopupUser | null>(null);
const profileCache = new Map<string, FetchedProfile>();

function joinedLabel(createdAtIso: string): string {
  return new Date(createdAtIso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function useProfilePopup() {
  const setUser = useSetAtom(profilePopupUserAtom);
  return useCallback((user: ProfilePopupUser) => setUser(user), [setUser]);
}

function ProfilePopupBody({ user }: { user: ProfilePopupUser }) {
  const closePopup = useSetAtom(profilePopupUserAtom);
  const [profile, setProfile] = useState<FetchedProfile | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (profileCache.has(user.username)) return;
    let active = true;
    clientFetchJson<ProfileResponse>(
      `/api/profiles/${encodeURIComponent(user.username)}`,
    )
      .then((data) => {
        profileCache.set(user.username, data.profile);
        if (active) setProfile(data.profile);
      })
      .catch(() => {
        if (active) setFailedFor(user.username);
      });
    return () => {
      active = false;
    };
  }, [user.username]);

  const fresh =
    (profile && profile.username === user.username ? profile : null) ??
    profileCache.get(user.username) ??
    null;
  const failed = failedFor === user.username;
  const avatar = fresh?.avatar ?? user.avatar ?? null;
  const name = fresh?.displayName ?? user.displayName ?? user.username;

  return (
    <div className="flex flex-col items-center pt-1 text-center">
      <Character
        config={avatar}
        fallbackSeed={user.username}
        alt={name}
        size={96}
        className="size-24 rounded-2xl border border-border"
      />
      <h2 className="mt-3 max-w-full truncate font-semibold text-lg">{name}</h2>
      <Link
        href={`/${user.username}`}
        onClick={() => closePopup(null)}
        className="max-w-full truncate text-muted-foreground text-sm"
      >
        @{user.username}
      </Link>
      <div className="mt-2 flex items-center gap-1.5 text-muted-foreground text-xs">
        <FaRegCalendar size={12} aria-hidden="true" />
        {fresh ? (
          `Joined ${joinedLabel(fresh.createdAt)}`
        ) : failed ? (
          "Joined GameLobby"
        ) : (
          <Skeleton className="h-3 w-28" />
        )}
      </div>
    </div>
  );
}

export function ProfilePopupHost() {
  const user = useAtomValue(profilePopupUserAtom);
  const setUser = useSetAtom(profilePopupUserAtom);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState<ProfilePopupUser | null>(null);
  const [hidden, setHidden] = useState(true);
  const lensRef = useLiquidLens<HTMLDivElement>();

  const open = user !== null;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (user) {
      setShown(user);
      setHidden(false);
    }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUser(null);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, setUser]);

  if (!mounted) return null;

  const close = () => setUser(null);
  const message = () => {
    const target = shown;
    close();
    if (target) router.push(`/chat/${target.username}`);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-120 flex items-center justify-center p-4"
      style={{
        display: hidden && !open ? "none" : undefined,
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      <m.button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={close}
        className="glass-scrim absolute inset-0 bg-black/50"
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      />
      <m.div
        ref={lensRef}
        role="dialog"
        aria-modal="true"
        className="glass-pane relative w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl"
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          scale: open ? 1 : 0.97,
          y: open ? 0 : 8,
        }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        onAnimationComplete={() => {
          if (!open) setHidden(true);
        }}
      >
        <div className="mb-1 flex items-center justify-end">
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="-mr-1 rounded-lg p-1.5 text-muted-foreground transition hover:bg-surface-overlay hover:text-foreground"
          >
            <FaXmark size={18} aria-hidden="true" />
          </button>
        </div>
        {shown ? <ProfilePopupBody user={shown} /> : null}
        {shown ? (
          <div className="mt-4">
            <Button size="sm" className="w-full" onClick={message}>
              <FaRegMessage size={14} aria-hidden="true" />
              Message
            </Button>
          </div>
        ) : null}
      </m.div>
    </div>,
    document.body,
  );
}

export function ProfilePopupTrigger({
  user,
  className,
  children,
}: {
  user: ProfilePopupUser;
  className?: string;
  children: React.ReactNode;
}) {
  const openProfile = useProfilePopup();
  const open = useCallback(() => openProfile(user), [openProfile, user]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: this trigger can render inside <a>/<button> rows where a nested <button> is invalid HTML; a span with role=button plus keyboard handlers is the accessible alternative
    <span
      role="button"
      tabIndex={0}
      aria-label={`View ${user.displayName ?? user.username}'s profile`}
      className={cn(
        "inline-flex cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          open();
        }
      }}
    >
      {children}
    </span>
  );
}
