import { getDefinition, hasEngine } from "@kyzen/games-core";
import { GAME_CATEGORIES } from "@kyzen/shared/constants";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { HowToPlay } from "@/app/games/_shared/how-to-play";
import { RoomActions } from "@/app/games/_shared/room-actions";

export const metadata: Metadata = {
  title: "Play",
  description: "Start a game, create a room, or join one with a code.",
};

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ gameType: string }>;
}) {
  const { gameType } = await params;
  if (!hasEngine(gameType)) notFound();

  const { meta } = getDefinition(gameType);
  const category = Object.values(GAME_CATEGORIES).find(
    (c) => c.id === meta.categoryId,
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 lg:px-8 lg:py-14">
      {category ? (
        <p className="font-semibold text-primary text-sm uppercase tracking-[0.25em]">
          {category.label}
        </p>
      ) : null}
      <h1 className="mt-3 font-bold text-5xl text-foreground tracking-tight sm:text-6xl">
        {meta.name}
      </h1>
      <p className="mt-4 max-w-xl text-base text-muted-foreground">
        {meta.description} Play a quick match or set up a room with friends.
      </p>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="flex flex-col gap-6">
          {meta.coverImage ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-border shadow-md">
              <Image
                src={meta.coverImage}
                alt={meta.name}
                fill
                sizes="(max-width: 1024px) 100vw, 600px"
                className="object-cover"
                priority
              />
            </div>
          ) : null}
          <RoomActions meta={meta} />
        </div>

        <HowToPlay meta={meta} />
      </div>
    </div>
  );
}
