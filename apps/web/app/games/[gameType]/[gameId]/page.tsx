import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Legacy `/games/:type/:id` URLs now live at the side-by-side `/play` route.
export default async function LegacyGamePage({
  params,
}: {
  params: Promise<{ gameType: string; gameId: string }>;
}) {
  const { gameId } = await params;
  redirect(`/play/${gameId}`);
}
