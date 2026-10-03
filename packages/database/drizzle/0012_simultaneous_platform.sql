ALTER TABLE "game" ADD COLUMN "winners" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "game" SET "winners" = jsonb_build_array("winner") WHERE "winner" IS NOT NULL AND "winner" <> 'draw';--> statement-breakpoint
ALTER TABLE "match_friend_choice" DROP CONSTRAINT "match_friend_choice_uq";--> statement-breakpoint
ALTER TABLE "match_friend_choice" ADD COLUMN "target_user_id" text;--> statement-breakpoint
UPDATE "match_friend_choice" SET "target_user_id" = "peer"."user_id" FROM "game_player" AS "peer" WHERE "peer"."game_id" = "match_friend_choice"."game_id" AND "peer"."user_id" <> "match_friend_choice"."user_id" AND EXISTS (SELECT 1 FROM "user" WHERE "user"."id" = "peer"."user_id");--> statement-breakpoint
DELETE FROM "match_friend_choice" WHERE "target_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "match_friend_choice" ALTER COLUMN "target_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "match_friend_choice" ADD CONSTRAINT "match_friend_choice_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_friend_choice" ADD CONSTRAINT "match_friend_choice_uq" UNIQUE("game_id","user_id","target_user_id");
