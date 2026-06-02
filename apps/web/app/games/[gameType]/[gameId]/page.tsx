import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyGamePage({
  params,
}: {
  params: Promise<{ gameType: string; gameId: string }>;
}) {
  const { gameId } = await params;
  redirect(`/play/${gameId}`);
}
