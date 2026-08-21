ALTER TABLE "user_settings" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "timezone_auto" boolean DEFAULT true NOT NULL;