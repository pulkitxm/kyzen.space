import { Spinner } from "@/components/ui";

// Redirect-only route (-> /[username]); shows briefly during the redirect.
export default function ProfileRedirectLoading() {
  return (
    <div className="flex min-h-full items-center justify-center p-10">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
