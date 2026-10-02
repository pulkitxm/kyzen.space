CREATE TABLE "match_message" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL REFERENCES "game"("id") ON DELETE CASCADE,
  "sender_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  CONSTRAINT "match_message_client_uq" UNIQUE("game_id", "sender_id", "client_id")
);
CREATE INDEX "match_message_game_idx" ON "match_message"("game_id", "created_at");
CREATE INDEX "match_message_expiry_idx" ON "match_message"("expires_at");
CREATE TABLE "match_friend_choice" (
  "game_id" uuid NOT NULL REFERENCES "game"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "match_friend_choice_uq" UNIQUE("game_id", "user_id")
);
