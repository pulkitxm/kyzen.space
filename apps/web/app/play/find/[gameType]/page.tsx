import { getDefinition, hasEngine } from "@kyzen/games-core";
import { CAR_FOOTBALL } from "@kyzen/shared/constants";
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
}: {
  params: Promise<{ gameType: string }>;
}) {
  const { gameType } = await params;
  if (!hasEngine(gameType) || gameType === CAR_FOOTBALL) notFound();
  const { meta } = getDefinition(gameType);
  return <FindClient gameType={meta.type} gameName={meta.name} />;
}
