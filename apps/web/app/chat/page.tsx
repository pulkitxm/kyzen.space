import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-server-session";
import { ChatListClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  return <ChatListClient userId={session.user.id} />;
}
