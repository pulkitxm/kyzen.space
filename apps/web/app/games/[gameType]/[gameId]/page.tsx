import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Play",
  description: "Redirecting to your game.",
};

export const dynamic = "force-dynamic";

export default async function LegacyGamePage({
  params,
}: {
  params: Promise<{ gameType: string; gameId: string }>;
}) {
  const { gameId } = await params;
  redirect(`/play/${gameId}`);
}
