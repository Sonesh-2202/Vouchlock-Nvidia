ALTER TYPE "public"."ai_gen_kind" ADD VALUE 'requirement_extraction';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_brief_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" varchar(200) DEFAULT 'Project Brief' NOT NULL,
	"content" text NOT NULL,
	"notes" text,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_brief_revisions" ADD CONSTRAINT "project_brief_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_brief_revisions" ADD CONSTRAINT "project_brief_revisions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brief_revisions_project_id_idx" ON "project_brief_revisions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_brief_revisions_unique_rev_idx" ON "project_brief_revisions" USING btree ("project_id","revision_number");