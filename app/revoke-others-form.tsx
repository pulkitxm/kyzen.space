import { revokeOtherSessionsAction } from "./actions/auth";

type Props = {
  otherSessionCount: number;
};

export function RevokeOthersForm({ otherSessionCount }: Props) {
  if (otherSessionCount === 0) return null;

  return (
    <form action={revokeOtherSessionsAction} className="mt-6">
      <button
        type="submit"
        className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-800 shadow-sm transition hover:bg-red-50 dark:border-red-900/70 dark:bg-neutral-950 dark:text-red-200 dark:hover:bg-red-950/40"
      >
        Sign out all other sessions
      </button>
      <p className="mt-2 max-w-xl text-xs text-neutral-500 dark:text-neutral-500">
        Ends {otherSessionCount} other active session
        {otherSessionCount === 1 ? "" : "s"}. This device stays signed in.
      </p>
    </form>
  );
}
