CREATE TYPE "public"."activity_action" AS ENUM('created', 'title_changed', 'description_changed', 'status_changed', 'start_changed', 'due_changed', 'reparented', 'recurrence_changed', 'tags_changed', 'deleted', 'restored');--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"action" "activity_action" NOT NULL,
	"field" text,
	"from_value" text,
	"to_value" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_activity_task_id_idx" ON "task_activity" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_activity_user_id_idx" ON "task_activity" USING btree ("user_id");--> statement-breakpoint
-- P3-08: replicate the new table down to clients (append-only activity history).
ALTER PUBLICATION "powersync" ADD TABLE "task_activity";