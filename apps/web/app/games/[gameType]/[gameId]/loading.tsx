import { Spinner } from "@/components/ui";

export default function LegacyGameRedirectLoading() {
  return (
    <div className="flex min-h-full items-center justify-center p-10">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
