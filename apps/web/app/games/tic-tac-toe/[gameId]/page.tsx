import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Old game URLs now live at the side-by-side /play route.
export default async function LegacyTicTacToeGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  redirect(`/play/${gameId}`);
}
