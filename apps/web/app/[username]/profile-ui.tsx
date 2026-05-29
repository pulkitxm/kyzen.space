import Image from "next/image";
import Link from "next/link";

import { PaginatedRecentGames } from "@/app/[username]/profile-activity-client";
import type { ProfileActivityGameRow } from "@/lib/profile-activity-games";

export type ProfileStatGame = {
  id: string;
  name: string;
  href: string;
  coverImage?: string;
  played: number;
};

export type ProfileActivityMost = ProfileStatGame;

export function ProfilePageView({
  username,
  displayName,
  isOwnProfile,
  memberForLabel,
  totalGamesPlayed,
  activityMostPlayed,
  activityRecentGamesInitial,
  activityRecentHasMore,
}: {
  username: string;
  displayName: string | null;
  isOwnProfile: boolean;
  memberForLabel: string;
  totalGamesPlayed: number;
  activityMostPlayed: ProfileActivityMost | null;
  activityRecentGamesInitial: ProfileActivityGameRow[];
  activityRecentHasMore: boolean;
}) {
  const lineName = displayName?.trim() || username;

  return (
    <div className="min-h-full bg-surface text-card-foreground">
      <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          ← Home
        </Link>

        <header className="mt-8">
          <Banner />
          <div className="relative z-10 mx-3 -mt-9 flex flex-col gap-6 rounded-2xl border border-border bg-card/95 p-4 shadow-xl shadow-black/5 backdrop-blur sm:mx-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
              <Avatar displayName={displayName} username={username} />
              <div className="min-w-0 pb-1 sm:pb-2">
                <h1 className="text-2xl font-semibold tracking-tight text-card-foreground md:text-[1.75rem]">
                  {lineName}
                </h1>
                <p className="mt-1 truncate text-base text-muted-foreground">
                  @{username}
                </p>
              </div>
            </div>
            {isOwnProfile ? (
              <div className="flex shrink-0 items-center gap-2 sm:mb-2">
                <Link
                  href="/account"
                  className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary-hover"
                >
                  Account
                </Link>
                <ProfileOverflowMenu />
              </div>
            ) : null}
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[300px,minmax(0,1fr)] lg:gap-10">
          <aside className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
            <StatsCard
              memberForLabel={memberForLabel}
              totalGamesPlayed={totalGamesPlayed}
            />
            <ActivitySection
              profileUsername={username}
              mostPlayed={activityMostPlayed}
              recentGamesInitial={activityRecentGamesInitial}
              recentGamesHasMore={activityRecentHasMore}
            />
          </aside>

          <main />
        </div>
      </div>
    </div>
  );
}

function Banner() {
  return (
    <div className="relative h-[9.5rem] overflow-hidden rounded-2xl sm:h-[12rem]">
      <div
        className="absolute inset-0 bg-gradient-to-br"
        style={{
          backgroundImage: `linear-gradient(to bottom right, var(--banner-from), var(--banner-via), var(--banner-to))`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage: `linear-gradient(to top, var(--banner-fade) 0%, transparent 45%),
            radial-gradient(ellipse 110% 80% at 20% 100%, var(--primary), transparent 55%),
            radial-gradient(circle at 85% 20%, rgba(250,146,108,0.15), transparent 40%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -12deg,
            transparent,
            transparent 18px,
            rgba(255,255,255,0.035) 18px,
            rgba(255,255,255,0.035) 36px
          )`,
        }}
      />
    </div>
  );
}

function profileAvatarLetters(
  displayName: string | null | undefined,
  username: string,
): string {
  const name = displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]!.charAt(0);
      const b = parts[1]!.charAt(0);
      if (a && b) return (a + b).toUpperCase();
    }
    const first = name.charAt(0);
    if (first) return first.toUpperCase();
  }
  const u = username.trim();
  return u ? u.charAt(0).toUpperCase() : "?";
}

function Avatar({
  displayName,
  username,
}: {
  displayName: string | null;
  username: string;
}) {
  const letters = profileAvatarLetters(displayName, username);
  const letterSize =
    letters.length >= 2 ? "text-[1.7rem] sm:text-3xl" : "text-3xl sm:text-4xl";

  return (
    <div
      className={`relative flex size-[5.75rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl font-bold text-primary-foreground ring-4 ring-card sm:size-24 ${letterSize}`}
      style={{
        background: `linear-gradient(to bottom right, var(--primary), var(--primary-dark))`,
      }}
      aria-label={`${displayName?.trim() || username} avatar`}
    >
      {letters}
    </div>
  );
}

function ProfileOverflowMenu() {
  return (
    <details className="group relative">
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-surface-overlay text-muted-foreground transition hover:border-border/80 hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
        <span className="sr-only">More options</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </summary>
      <div className="absolute right-0 z-30 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-card py-1 text-sm shadow-2xl ring-1 ring-black/10">
        <Link
          href="/profile"
          className="block px-4 py-2.5 text-card-foreground transition hover:bg-surface-overlay"
        >
          My profile
        </Link>
        <Link
          href="/games"
          className="block px-4 py-2.5 text-card-foreground transition hover:bg-surface-overlay"
        >
          Games
        </Link>
      </div>
    </details>
  );
}

function StatsCard({
  memberForLabel,
  totalGamesPlayed,
}: {
  memberForLabel: string;
  totalGamesPlayed: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Stats
      </h2>
      <ul className="mt-4 space-y-4">
        <li className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-muted-foreground">
            <IconController />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Games played</p>
            <p className="text-base font-semibold text-card-foreground">
              {totalGamesPlayed}
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-muted-foreground">
            <IconCalendar />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Member for</p>
            <p className="text-base font-semibold text-card-foreground">
              {memberForLabel}
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}

function ActivitySection({
  profileUsername,
  mostPlayed,
  recentGamesInitial,
  recentGamesHasMore,
}: {
  profileUsername: string;
  mostPlayed: ProfileActivityMost | null;
  recentGamesInitial: ProfileActivityGameRow[];
  recentGamesHasMore: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Activity
      </h2>
      {!mostPlayed && recentGamesInitial.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Play a game to see your activity here.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {mostPlayed ? (
            <Link
              href={mostPlayed.href}
              className="flex gap-3 rounded-xl border border-border bg-surface-overlay/40 p-3 transition hover:border-border/60 hover:bg-surface-hover/80"
            >
              <ActivityThumb
                cover={mostPlayed.coverImage}
                name={mostPlayed.name}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <IconHeart className="text-primary" />
                  Most played
                </p>
                <p className="mt-1 truncate font-medium text-card-foreground">
                  {mostPlayed.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {mostPlayed.played} matches
                </p>
              </div>
            </Link>
          ) : null}
          <PaginatedRecentGames
            profileUsername={profileUsername}
            initialGames={recentGamesInitial}
            initialHasMore={recentGamesHasMore}
          />
        </div>
      )}
    </section>
  );
}

function ActivityThumb({
  cover,
  name,
}: {
  cover: string | undefined;
  name: string;
}) {
  return (
    <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-overlay">
      {cover ? (
        <Image src={cover} alt="" fill className="object-cover" sizes="56px" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs font-semibold uppercase text-muted-foreground">
          {name.slice(0, 2)}
        </div>
      )}
    </div>
  );
}

function IconController() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 12h2m0 0h2m-2 0v2m0-2v-2M6 7h12a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3 9h18M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconHeart({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 21s-6.716-4.11-9-8.5C.5 8.5 2.5 5 7 5c2.5 0 5 2 5 2s2.5-2 5-2c4.5 0 6.5 3.5 4 7.5-2.284 4.39-9 8.5-9 8.5z" />
    </svg>
  );
}
