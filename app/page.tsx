import Link from "next/link";

import { SignOutForm } from "@/app/sign-out-form";
import { getServerSession } from "@/lib/get-server-session";

export const dynamic = "force-dynamic";

function displayName(user: {
  name?: string | null;
  email?: string | null;
}): string | null {
  if (typeof user.name === "string" && user.name.trim()) return user.name.trim();
  if (typeof user.email === "string" && user.email.trim())
    return user.email.trim();
  return null;
}

export default async function Home() {
  const session = await getServerSession();
  const user = session?.user ?? null;

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-14">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-violet-500/14 blur-[100px]" />
      </div>

      <main className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50 md:text-[1.65rem]">
          Game lib
        </h1>

        {!user ? (
          <>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Sign in to continue.
            </p>
            <Link
              href="/auth"
              className="mt-8 inline-flex rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-violet-950/25 transition hover:bg-violet-500 active:scale-[0.98]"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
              You&apos;re signed in{" "}
              {(() => {
                const d = displayName(user);
                return d ? `as ${d}` : "";
              })()}
              .
            </p>
            {typeof user.email === "string" &&
            user.email.trim() &&
            displayName(user) !== user.email.trim() ? (
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                {user.email}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <SignOutForm />
              <Link
                href="/account"
                className="text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
              >
                Account
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
