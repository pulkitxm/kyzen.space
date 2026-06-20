import { getDefinition, hasEngine } from "@kyzen/games-core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewClient } from "./new-client";

export const metadata: Metadata = {
  title: "Creating a room",
  description: "Setting up your private room.",
};

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
