import { authClient } from "@/lib/auth-client";

export async function ensureIdentity(): Promise<boolean> {
  const { data } = await authClient.getSession();
  if (!data?.session) {
    const result = await authClient.signIn.anonymous();
    if (result.error)
      throw new Error(result.error.message ?? "Guest sign-in failed");
    return true;
  }
  return false;
}
