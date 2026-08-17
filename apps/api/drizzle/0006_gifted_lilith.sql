CREATE TYPE "public"."status_category" AS ENUM('open', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "status_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"category" "status_category" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"custom_statuses_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "status_groups" ADD CONSTRAINT "status_groups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_group_id_status_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."status_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "status_groups_user_id_idx" ON "status_groups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "statuses_user_id_idx" ON "statuses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "statuses_group_id_idx" ON "statuses" USING btree ("group_id");--> statement-breakpoint
-- P2-03 seed: one default group + To Do (open) / Done (done) + a settings row per existing user
INSERT INTO "status_groups" ("id", "user_id", "name", "is_default", "position")
	SELECT gen_random_uuid(), u."id", 'Default', true, 0 FROM "user" u;--> statement-breakpoint
INSERT INTO "statuses" ("user_id", "group_id", "name", "color", "category", "position", "is_system")
	SELECT g."user_id", g."id", 'To Do', 'slate', 'open', 0, true FROM "status_groups" g WHERE g."is_default" = true;--> statement-breakpoint
INSERT INTO "statuses" ("user_id", "group_id", "name", "color", "category", "position", "is_system")
	SELECT g."user_id", g."id", 'Done', 'green', 'done', 1, true FROM "status_groups" g WHERE g."is_default" = true;--> statement-breakpoint
INSERT INTO "user_settings" ("user_id", "custom_statuses_enabled")
	SELECT u."id", false FROM "user" u;--> statement-breakpoint
-- Expand tasks: add status_id (nullable) + resolved_at + FK, backfill from completed, then NOT NULL
ALTER TABLE "tasks" ADD COLUMN "status_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "tasks" t SET
	"status_id" = s."id",
	"resolved_at" = CASE WHEN t."completed" THEN t."updated_at" ELSE NULL END
	FROM "statuses" s
	JOIN "status_groups" g ON g."id" = s."group_id" AND g."is_default" = true
	WHERE s."user_id" = t."user_id" AND s."is_system" = true
		AND s."category" = (CASE WHEN t."completed" THEN 'done' ELSE 'open' END)::"public"."status_category";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status_id" SET NOT NULL;--> statement-breakpoint
-- Sync the new user-scoped tables (PowerSync reads from the `powersync` publication)
ALTER PUBLICATION "powersync" ADD TABLE "status_groups", "statuses", "user_settings";
