export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const DISPLAY_NAME_MAX_LENGTH = 50;

export const RESERVED_USERNAMES = new Set([
  "api",
  "auth",
  "account",
  "chat",
  "friends",
  "games",
  "play",
  "profile",
  "settings",
  "ui",
]);
