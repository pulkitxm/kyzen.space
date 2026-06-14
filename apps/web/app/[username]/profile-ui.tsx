import type { AvatarConfig } from "@kyzen/avatar";
import Image from "next/image";
import Link from "next/link";
import { FaEllipsis, FaGamepad, FaHeart, FaRegCalendar } from "react-icons/fa6";

import { EditableAvatar } from "@/app/[username]/avatar-editor";
import { PaginatedRecentGames } from "@/app/[username]/profile-activity-client";
import { Character } from "@/components/ui";
import type { ProfileActivityGameRow } from "@/lib/profile-activity-games";

type ProfileStatGame = {
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
  avatar,
  isOwnProfile,
  memberForLabel,
  totalGamesPlayed,
  activityMostPlayed,
  activityRecentGamesInitial,
  activityRecentHasMore,
}: {
  username: string;
  displayName: string | null;
  avatar: AvatarConfig | null;
  isOwnProfile: boolean;
  memberForLabel: string;
  totalGamesPlayed: number;
  activityMostPlayed: ProfileActivityMost | null;
  activityRecentGamesInitial: ProfileActivityGameRow[];
  activityRecentHasMore: boolean;
}) {
  const lineName = displayName?.trim() || username;

  return (
    <div className="min-h-screen shrink-0 bg-surface text-card-foreground">
      <div className="relative mx-auto max-w-5xl px-4 pt-8 pb-20">
        <header>
          <Banner />
          <div className="relative z-10 mx-3 -mt-9 flex flex-col gap-6 rounded-2xl border border-border bg-card/95 p-4 shadow-black/5 shadow-xl backdrop-blur sm:mx-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
              {isOwnProfile ? (
                <EditableAvatar
                  avatar={avatar}
                  username={username}
                  displayName={displayName}
                />
              ) : (
                <div className="relative size-23 shrink-0 overflow-hidden rounded-2xl ring-4 ring-card sm:size-24">
                  <Character
                    config={avatar}
                    fallbackSeed={username}
                    className="size-full"
                    alt={`${displayName?.trim() || username} avatar`}
                  />
                </div>
              )}
              <div className="min-w-0 pb-1 sm:pb-2">
                <h1 className="font-semibold text-2xl text-card-foreground tracking-tight md:text-[1.75rem]">
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
                  href="/settings/account"
                  className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground text-sm shadow-lg shadow-primary/25 transition hover:bg-primary-hover"
                >
                  Settings
                </Link>
                <ProfileOverflowMenu username={username} />
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
    <div className="relative h-38 overflow-hidden rounded-2xl sm:h-48">
      <div
        className="absolute inset-0 bg-linear-to-br"
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

function ProfileOverflowMenu({ username }: { username: string }) {
  return (
    <details className="group relative">
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-surface-overlay text-muted-foreground transition hover:border-border/80 hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
        <span className="sr-only">More options</span>
        <FaEllipsis size={18} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 min-w-44 overflow-hidden rounded-xl border border-border bg-card py-1 text-sm shadow-2xl ring-1 ring-black/10">
        <Link
          href={`/${username}`}
          className="block px-4 py-2.5 text-card-foreground transition hover:bg-surface-overlay"
        >
          My profile
        </Link>
        <Link
          href="/friends"
          className="block px-4 py-2.5 text-card-foreground transition hover:bg-surface-overlay"
        >
          Friends
        </Link>
        <Link
          href="/"
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
      <h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]">
        Stats
      </h2>
      <ul className="mt-4 space-y-4">
        <li className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-muted-foreground">
            <FaGamepad size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">Games played</p>
            <p className="font-semibold text-base text-card-foreground">
              {totalGamesPlayed}
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-muted-foreground">
            <FaRegCalendar size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">Member for</p>
            <p className="font-semibold text-base text-card-foreground">
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
      <h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]">
        Activity
      </h2>
      {!mostPlayed && recentGamesInitial.length === 0 ? (
        <p className="mt-4 text-muted-foreground text-sm">
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
                <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                  <FaHeart
                    className="text-primary"
                    size={14}
                    aria-hidden="true"
                  />
                  Most played
                </p>
                <p className="mt-1 truncate font-medium text-card-foreground">
                  {mostPlayed.name}
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs">
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
        <div className="flex h-full items-center justify-center font-semibold text-muted-foreground text-xs uppercase">
          {name.slice(0, 2)}
        </div>
      )}
    </div>
  );
}
