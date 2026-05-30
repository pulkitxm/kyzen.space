import type { FriendshipJson } from "@gamelobby/chat-core";
import { redirect } from "next/navigation";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";
import { FriendsClient } from "./friends-client";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  const [friends, requests] = await Promise.all([
    serverFetchJson<{ friends: FriendshipJson[] }>("/api/friends"),
    serverFetchJson<{ incoming: FriendshipJson[]; outgoing: FriendshipJson[] }>(
      "/api/friends/requests",
    ),
  ]);
  return (
    <FriendsClient
      initialFriends={friends?.friends ?? []}
      initialIncoming={requests?.incoming ?? []}
      initialOutgoing={requests?.outgoing ?? []}
    />
  );
}
