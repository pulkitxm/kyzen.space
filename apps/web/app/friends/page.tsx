import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-server-session";
import { FriendsClient } from "./friends-client";

export const metadata: Metadata = {
  title: "Friends",
  description: "Manage your friends and friend requests on GameLobby.",
};

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  return <FriendsClient />;
}
