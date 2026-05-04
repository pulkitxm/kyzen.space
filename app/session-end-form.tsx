import { revokeSessionAction } from "./actions/auth";

type Props = {
  token: string;
};

export function SessionEndForm({ token }: Props) {
  return (
    <form action={revokeSessionAction} className="shrink-0">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:scale-[0.98] dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        End session
      </button>
    </form>
  );
}
