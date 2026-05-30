import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-server-session";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");
  return <NotificationsClient />;
}
