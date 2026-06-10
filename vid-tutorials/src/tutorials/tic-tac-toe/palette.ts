export type TutorialMark = "X" | "O";

export function markColor(mark: TutorialMark): string {
  return mark === "X" ? "var(--primary)" : "var(--muted-foreground)";
}
