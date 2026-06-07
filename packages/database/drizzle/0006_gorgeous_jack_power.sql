CREATE TYPE "public"."app_pattern" AS ENUM('doodles', 'games', 'shapes', 'none');--> statement-breakpoint
ALTER TYPE "public"."app_theme" ADD VALUE 'forest';--> statement-breakpoint
ALTER TYPE "public"."app_theme" ADD VALUE 'violet';--> statement-breakpoint
ALTER TYPE "public"."app_theme" ADD VALUE 'slate';--> statement-breakpoint
ALTER TYPE "public"."app_theme" ADD VALUE 'amber';--> statement-breakpoint
ALTER TYPE "public"."app_theme" ADD VALUE 'rose';--> statement-breakpoint
ALTER TYPE "public"."app_theme" ADD VALUE 'cyan';--> statement-breakpoint
ALTER TYPE "public"."app_theme" ADD VALUE 'csk';--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "pattern" "app_pattern" DEFAULT 'doodles' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "chat_layout" jsonb;