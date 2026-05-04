import Image from "next/image";
import Link from "next/link";

import { PaginatedRecentGames } from "@/app/[username]/profile-activity-client";
import type { GameEntry } from "@/lib/games";
import type { ProfileActivityGameRow } from "@/lib/profile-activity-games";

export type ProfileStatGame = Pick<GameEntry, "id" | "name" | "href" | "coverImage"> & {
  played: number;
};

export type ProfileActivityMost = Pick<GameEntry, "id" | "name" | "href" | "coverImage"> & {
  played: number;
};

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
    <div className="min-h-full bg-[#0c0e14] text-neutral-100">
      <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Home
        </Link>

        <header className="mt-8">
          <Banner />
          <div className="relative z-10 -mt-14 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6">
              <Avatar displayName={displayName} username={username} />
              <div className="min-w-0 pb-1 sm:pb-2">
                <h1 className="text-2xl font-semibold tracking-tight text-white md:text-[1.75rem]">
                  {lineName}
                </h1>
                <p className="mt-1 truncate text-base text-neutral-400">
                  @{username}
                </p>
              </div>
            </div>
            {isOwnProfile ? (
              <div className="flex shrink-0 items-center gap-2 sm:mb-2">
                <Link
                  href="/account"
                  className="inline-flex items-center rounded-full bg-[#8b5cf6] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[#8b5cf6]/25 transition hover:bg-[#7c3aed]"
                >
                  Account
                </Link>
                <ProfileOverflowMenu />
              </div>
            ) : null}
          </div>
        </header>

        <div className="mt-14 grid gap-8 lg:grid-cols-[300px,minmax(0,1fr)] lg:gap-10">
          <aside className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
            <StatsCard memberForLabel={memberForLabel} totalGamesPlayed={totalGamesPlayed} />
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
    <div className="relative h-[10.5rem] overflow-hidden rounded-2xl sm:h-[12rem]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#2d1f5c] via-[#352064] to-[#123d34]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage: `linear-gradient(to top, rgba(12,14,20,0.92) 0%, transparent 45%),
            radial-gradient(ellipse 110% 80% at 20% 100%, rgba(139,92,246,0.35), transparent 55%),
            radial-gradient(circle at 85% 20%, rgba(250,146,108,0.15), transparent 40%)`,
        }}
      />
      <svg
        className="absolute bottom-0 left-0 right-0 h-16 text-[#162c28]/90"
        viewBox="0 0 400 56"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path fill="currentColor" d="M0 56V36c52-26 132-42 216-26 56 11 117 39 184 42v4H0z" />
      </svg>
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
      className={`relative flex size-[5.75rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] font-bold text-white ring-4 ring-[#0c0e14] sm:size-24 ${letterSize}`}
      aria-label={`${displayName?.trim() || username} avatar`}
    >
      {letters}
    </div>
  );
}

function ProfileOverflowMenu() {
  return (
    <details className="group relative">
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-neutral-600/60 bg-[#151822] text-neutral-300 transition hover:border-neutral-500 hover:bg-[#1a1f2e] [&::-webkit-details-marker]:hidden">
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
      <div className="absolute right-0 z-30 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-neutral-700/80 bg-[#151822] py-1 text-sm shadow-2xl ring-1 ring-black/40">
        <Link
          href="/profile"
          className="block px-4 py-2.5 text-neutral-200 transition hover:bg-[#1e2433]"
        >
          My profile
        </Link>
        <Link
          href="/games"
          className="block px-4 py-2.5 text-neutral-200 transition hover:bg-[#1e2433]"
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
    <section className="rounded-2xl border border-neutral-800/90 bg-[#13161f] p-5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
        Stats
      </h2>
      <ul className="mt-4 space-y-4">
        <li className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1f2c] text-neutral-400">
            <IconController />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-neutral-400">Games played</p>
            <p className="text-base font-semibold text-white">{totalGamesPlayed}</p>
          </div>
        </li>
        <li className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1f2c] text-neutral-400">
            <IconCalendar />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-neutral-400">Member for</p>
            <p className="text-base font-semibold text-white">{memberForLabel}</p>
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
    <section className="rounded-2xl border border-neutral-800/90 bg-[#13161f] p-5 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
        Activity
      </h2>
      {!mostPlayed && recentGamesInitial.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">
          Play a game to see your activity here.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {mostPlayed ? (
            <Link
              href={mostPlayed.href}
              className="flex gap-3 rounded-xl border border-neutral-800/80 bg-[#1a1f2c]/40 p-3 transition hover:border-neutral-700 hover:bg-[#1e2433]/80"
            >
              <ActivityThumb cover={mostPlayed.coverImage} name={mostPlayed.name} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                  <IconHeart className="text-[#f472b6]" />
                  Most played
                </p>
                <p className="mt-1 truncate font-medium text-white">
                  {mostPlayed.name}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
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
    <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
      {cover ? (
        <Image src={cover} alt="" fill className="object-cover" sizes="56px" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs font-semibold uppercase text-neutral-500">
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
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
