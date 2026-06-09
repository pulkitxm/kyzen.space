import { authClient } from "@/lib/auth-client";

export async function ensureIdentity(): Promise<void> {
  const { data } = await authClient.getSession();
  if (!data?.session) {
    await authClient.signIn.anonymous();
  }
}
