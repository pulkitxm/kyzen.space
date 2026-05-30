ALTER TABLE "game" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "game" ADD COLUMN "creator_user_id" text;--> statement-breakpoint
ALTER TABLE "game" ADD COLUMN "seating_mode" text;--> statement-breakpoint
ALTER TABLE "game" ADD COLUMN "challenged_user_id" text;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_challenged_user_id_user_id_fk" FOREIGN KEY ("challenged_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_conversation_idx" ON "game" USING btree ("conversation_id");