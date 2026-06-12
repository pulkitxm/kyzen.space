import { getDefinition, hasEngine } from "@gamelobby/games-core";
import { notFound } from "next/navigation";
import { NewClient } from "./new-client";

export const dynamic = "force-dynamic";

export default async function NewRoomPage({
  params,
}: {
  params: Promise<{ gameType: string }>;
}) {
  const { gameType } = await params;
  if (!hasEngine(gameType)) notFound();
  const { meta } = getDefinition(gameType);
  return <NewClient gameType={meta.type} gameName={meta.name} />;
}
