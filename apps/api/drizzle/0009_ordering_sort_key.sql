ALTER TABLE "tasks" ADD COLUMN "sort_order" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_order_idx" ON "tasks" USING btree ("user_id","parent_id","sort_order");