import { redirect } from "next/navigation";

import { connectMongoose } from "@/database/mongoose";
import { ensureUsernameForUser } from "@/lib/ensure-username";
import { getServerSession } from "@/lib/get-server-session";

export const dynamic = "force-dynamic";

export default async function ProfileRedirectPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");

  await connectMongoose();
  const username = await ensureUsernameForUser(
    session.user.id,
    session.user.name,
  );
  redirect(`/${username}`);
}
