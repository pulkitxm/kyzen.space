import { cookies } from "next/headers";
import { CHAT_LAYOUT_COOKIE, parseChatLayoutCookie } from "@/lib/chat-layout";
import { PlaySkeleton } from "./play-skeleton";

export default async function PlayLoading() {
  const layoutCookie = (await cookies()).get(CHAT_LAYOUT_COOKIE)?.value;
  return <PlaySkeleton layout={parseChatLayoutCookie(layoutCookie)} />;
}
