import Link from "next/link";
import { redirect } from "next/navigation";

import { RevokeOthersForm } from "@/app/revoke-others-form";
import { SessionEndForm } from "@/app/session-end-form";
import { SignOutForm } from "@/app/sign-out-form";
import { getAccountSessions } from "@/lib/get-account-sessions";
import { formatTs, shortenId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { current, list } = await getAccountSessions();

  if (!current?.session || !current.user) redirect("/auth");

  const currentId = current.session.id;

  const otherSessions = list.filter((s) => s.id !== currentId);

  return (
    <div className="min-h-full flex flex-col items-center justify-start px-4 py-14 md:py-16">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-violet-500/14 blur-[100px]" />
      </div>

      <main className="w-full max-w-xl">
        <Link
          href="/"
          className="inline-block text-xs text-neutral-500 underline-offset-4 hover:text-neutral-700 hover:underline dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          ← Home
        </Link>

        <div className="mt-8 rounded-2xl border border-neutral-200/90 bg-white/70 p-8 shadow-xl shadow-neutral-950/5 backdrop-blur-md dark:border-neutral-800/90 dark:bg-neutral-950/50">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
            Account
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {current.user.email}
          </p>

          <section className="mt-8" aria-labelledby="sessions-heading">
            <h2
              id="sessions-heading"
              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
            >
              Active sessions
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
              Each sign-in from a browser or device may create a separate
              session.
            </p>

            <ul className="mt-4 space-y-3">
              {list.length === 0 ? (
                <li className="rounded-xl border border-neutral-200/90 bg-neutral-50/80 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
                  No sessions returned.
                </li>
              ) : (
                list.map((session) => {
                  const isCurrent = session.id === currentId;
                  const token =
                    typeof session.token === "string" ? session.token : "";
                  return (
                    <li
                      key={session.id}
                      className={
                        "rounded-xl border px-4 py-3 text-left text-sm shadow-sm " +
                        (isCurrent
                          ? "border-emerald-500/40 bg-emerald-500/8 dark:border-emerald-500/35"
                          : "border-neutral-200/90 bg-white/60 dark:border-neutral-800/90 dark:bg-neutral-950/40")
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                            {shortenId(session.id)}…
                          </span>
                          {isCurrent ? (
                            <span className="rounded-full bg-emerald-600/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                              Current session
                            </span>
                          ) : (
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-500">
                              Other session
                            </span>
                          )}
                        </div>
                        {token && !isCurrent ? (
                          <SessionEndForm token={token} />
                        ) : null}
                      </div>
                      <dl className="mt-2 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                        <div>
                          <dt className="inline text-neutral-500">Started </dt>
                          <dd className="inline">
                            {formatTs(session.createdAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-neutral-500">Expires </dt>
                          <dd className="inline">
                            {formatTs(session.expiresAt)}
                          </dd>
                        </div>
                        {session.ipAddress ? (
                          <div>
                            <dt className="inline text-neutral-500">IP </dt>
                            <dd className="inline font-mono">
                              {session.ipAddress}
                            </dd>
                          </div>
                        ) : null}
                        {session.userAgent ? (
                          <div className="line-clamp-2 break-all">
                            <dt className="sr-only">Device</dt>
                            <dd>{session.userAgent}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <div className="mt-8 border-t border-neutral-200/90 pt-6 dark:border-neutral-800/90">
            <SignOutForm />
          </div>

          <RevokeOthersForm otherSessionCount={otherSessions.length} />
        </div>
      </main>
    </div>
  );
}
