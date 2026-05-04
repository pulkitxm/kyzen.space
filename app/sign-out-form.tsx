type Props = {
  className?: string;
  label?: string;
};

export function SignOutForm({ className, label = "Sign out" }: Props) {
  return (
    <form action="/api/account/sign-out" method="post" className={className}>
      <button
        type="submit"
        className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80"
      >
        {label}
      </button>
    </form>
  );
}
