import type { NotificationJson } from "@gamelobby/chat-core";
import { redirect } from "next/navigation";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  const data = await serverFetchJson<{ notifications: NotificationJson[] }>(
    "/api/notifications?limit=50",
  );
  return (
    <NotificationsClient initialNotifications={data?.notifications ?? []} />
  );
}
