import { getDefinition, hasEngine } from "@gamelobby/games-core";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { RoomActions } from "@/app/games/_shared/room-actions";
import { TutorialButton } from "@/app/games/_shared/tutorial-button";

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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <div className="space-y-1">
        <h1 className="font-bold text-3xl text-foreground tracking-tight">
          {meta.name}
        </h1>
        <p className="text-muted-foreground text-sm">{meta.description}</p>
      </div>

      {meta.coverImage ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-border shadow-md">
          <Image
            src={meta.coverImage}
            alt={meta.name}
            fill
            sizes="(max-width: 448px) 100vw, 448px"
            className="object-cover"
            priority
          />
        </div>
      ) : null}

      {meta.tutorialVideo ? (
        <TutorialButton src={meta.tutorialVideo} title={meta.name} />
      ) : null}

      <RoomActions meta={meta} />
    </div>
  );
}
