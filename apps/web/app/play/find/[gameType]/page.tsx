import { getDefinition, hasEngine } from "@gamelobby/games-core";
import { notFound } from "next/navigation";
import { FindClient } from "./find-client";

export const dynamic = "force-dynamic";

export default async function FindMatchPage({
  params,
}: {
  params: Promise<{ gameType: string }>;
}) {
  const { gameType } = await params;
  if (!hasEngine(gameType)) notFound();
  const { meta } = getDefinition(gameType);
  return <FindClient gameType={meta.type} gameName={meta.name} />;
}
