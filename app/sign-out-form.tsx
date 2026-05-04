import { signOutAction } from "./actions/auth";

type Props = {
  className?: string;
  label?: string;
};

export function SignOutForm({ className, label = "Sign out" }: Props) {
  return (
    <form action={signOutAction} className={className}>
      <button
        type="submit"
        className="text-sm font-medium text-violet-700 underline underline-offset-4 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-200"
      >
        {label}
      </button>
    </form>
  );
}
