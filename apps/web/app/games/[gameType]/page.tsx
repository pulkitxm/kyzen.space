import { getDefinition, hasEngine } from "@gamelobby/games-core";
import { GAME_CATEGORIES } from "@gamelobby/shared/constants";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameLobby } from "@/app/games/_shared/game-lobby";
import { Reveal } from "@/components/motion/reveal";
import { getServerSession } from "@/lib/get-server-session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameType: string }>;
}): Promise<Metadata> {
  const { gameType } = await params;
  if (!hasEngine(gameType)) return { title: "Game lobby" };
  const { meta } = getDefinition(gameType);
  return {
    title: `${meta.name}: Game lobby`,
    description: meta.description,
  };
}

export const dynamic = "force-dynamic";

function categoryLabel(categoryId: string): string | null {
  return (
    Object.values(GAME_CATEGORIES).find((c) => c.id === categoryId)?.label ??
    null
  );
}

export default async function GameLobbyPage({
  params,
}: {
  params: Promise<{ gameType: string }>;
}) {
  const { gameType } = await params;
  if (!hasEngine(gameType)) notFound();

  const def = getDefinition(gameType);
  const session = await getServerSession();
  const category = categoryLabel(def.meta.categoryId);

  return (
    <div className="min-h-full px-4 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="grid items-start gap-8 lg:grid-cols-[1.15fr_1fr]">
          <Reveal>
            <section className="relative flex aspect-4/3 flex-col justify-end overflow-hidden rounded-3xl bg-surface-raised shadow-[0_12px_40px_-12px_rgb(0_0_0/0.2)]">
              {def.meta.coverImage ? (
                <>
                  <Image
                    src={def.meta.coverImage}
                    alt={`${def.meta.name} artwork`}
                    fill
                    priority
                    className="object-cover object-center"
                    sizes="(max-width:1024px) 100vw, 36rem"
                  />
                  <div
                    className="absolute inset-0 bg-linear-to-t from-black/85 via-black/30 to-transparent"
                    aria-hidden
                  />
                </>
              ) : null}
              <div className="relative p-6">
                {category ? (
                  <span className="mb-2 inline-flex w-fit rounded-full bg-white/15 px-2.5 py-0.5 font-medium text-white/90 text-xs backdrop-blur-sm">
                    {category}
                  </span>
                ) : null}
                <h1 className="font-bold text-2xl text-white tracking-tight drop-shadow-sm">
                  {def.meta.name}
                </h1>
                <p className="mt-1.5 max-w-md text-sm text-white/80 leading-snug">
                  {def.meta.description}
                </p>
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.08}>
            <section
              aria-label="Start playing"
              className="rounded-3xl border border-border bg-surface-raised p-6 shadow-sm"
            >
              <h2 className="font-semibold text-foreground text-lg tracking-tight">
                Start playing
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                Play with a friend, share a link, or find a match.
              </p>
              <GameLobby
                meta={def.meta}
                configFields={def.configFields ?? []}
                userId={session?.user?.id ?? null}
              />
              <p className="mt-6 text-muted-foreground text-xs leading-relaxed">
                Starting a game posts a game card into that conversation and
                opens it side-by-side with the chat. You can also start one from
                the game button in any conversation, or jump straight to{" "}
                <Link href="/chat" className="text-primary hover:underline">
                  your chats
                </Link>
                .
              </p>
            </section>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
