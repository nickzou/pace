CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tags_user_id_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_tags_task_tag_uq" ON "task_tags" USING btree ("task_id","tag_id");--> statement-breakpoint
CREATE INDEX "task_tags_user_id_idx" ON "task_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_tags_tag_id_idx" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
ALTER PUBLICATION "powersync" ADD TABLE "tags", "task_tags";