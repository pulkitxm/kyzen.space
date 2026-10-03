import { getDefinition, hasEngine } from "@kyzen/games-core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FindClient } from "./find-client";

export const metadata: Metadata = {
  title: "Finding a match",
  description: "Matching you with an opponent.",
};

export const dynamic = "force-dynamic";

export default async function FindMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameType: string }>;
  searchParams: Promise<{ queue?: string | string[] }>;
}) {
  const { gameType } = await params;
  if (!hasEngine(gameType)) notFound();
  const { meta, queues = [] } = getDefinition(gameType);
  const { queue } = await searchParams;
  return (
    <FindClient
      gameType={meta.type}
      gameName={meta.name}
      queues={queues}
      requestedQueue={typeof queue === "string" ? queue : null}
    />
  );
}
