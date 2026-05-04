import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/app/google-sign-in-button";
import { getServerSession } from "@/lib/get-server-session";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const googleOAuthReady = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  const session = await getServerSession();
  if (session?.user) redirect("/profile");

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-14">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-violet-500/14 blur-[100px]" />
      </div>

      <main className="w-full max-w-[360px]">
        <Link
          href="/"
          className="mb-10 inline-block text-xs text-neutral-500 underline-offset-4 hover:text-neutral-700 hover:underline dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          ← Back home
        </Link>

        <div className="rounded-2xl border border-neutral-200/90 bg-white/70 p-8 shadow-xl shadow-neutral-950/5 backdrop-blur-md dark:border-neutral-800/90 dark:bg-neutral-950/50">
          <h1 className="text-center text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
            Sign in
          </h1>

          <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
            Use your Google account to continue.
          </p>

          <GoogleSignInButton googleOAuthReady={googleOAuthReady} />

          {!googleOAuthReady ? (
            <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-500">
              Add <span className="font-mono">GOOGLE_CLIENT_ID</span> and{" "}
              <span className="font-mono">GOOGLE_CLIENT_SECRET</span> to{" "}
              <span className="font-mono">.env.local</span>, set the redirect URI
              to{" "}
              <span className="break-all font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                [your app URL]/api/auth/callback/google
              </span>
              , then restart the dev server.
            </p>
          ) : null}

          <p className="mt-8 text-center text-xs text-neutral-400 dark:text-neutral-600">
            Email &amp; password: coming soon
          </p>
        </div>
      </main>
    </div>
  );
}
