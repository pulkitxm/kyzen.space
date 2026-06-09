import { randomUsernameSuffix } from "./username-rules";

export function generateGuestName(): string {
  return `Guest-${randomUsernameSuffix()}`;
}
