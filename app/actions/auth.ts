"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureMongoConnected } from "@/database";
import { getAuth } from "@/lib/auth";

export async function signOutAction() {
  await ensureMongoConnected();
  await getAuth().api.signOut({
    headers: await headers(),
  });
  redirect("/");
}

export async function revokeOtherSessionsAction() {
  await ensureMongoConnected();
  const h = await headers();
  const auth = getAuth();

  const session = await auth.api.getSession({ headers: h });
  if (!session?.session) redirect("/auth");

  await auth.api.revokeOtherSessions({ headers: h });
  revalidatePath("/account");
}

export async function revokeSessionAction(formData: FormData) {
  await ensureMongoConnected();
  const h = await headers();
  const auth = getAuth();

  const current = await auth.api.getSession({ headers: h });
  if (!current?.session) redirect("/auth");

  const raw = formData.get("token");
  if (typeof raw !== "string" || raw.length === 0) {
    return;
  }

  const isCurrent = current.session.token === raw;

  if (isCurrent) {
    await auth.api.signOut({ headers: h });
    redirect("/auth");
  }

  await auth.api.revokeSession({
    headers: h,
    body: { token: raw },
  });

  revalidatePath("/account");
}
