CREATE TYPE "public"."job_execution_target" AS ENUM('nebius_serverless_job', 'local_worker');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."ai_gen_kind" ADD VALUE IF NOT EXISTS 'copilot_report';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mcp_tokens" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "serverless_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"job_type" varchar(100) NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"execution_target" "job_execution_target" DEFAULT 'local_worker' NOT NULL,
	"model_id" varchar(255),
	"model_role" varchar(50),
	"idempotency_key" varchar(128),
	"input_params" jsonb NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"cloud_job_id" varchar(255),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "serverless_jobs" ADD CONSTRAINT "serverless_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "serverless_jobs" ADD CONSTRAINT "serverless_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "serverless_jobs" ADD CONSTRAINT "serverless_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_tokens_token_hash_idx" ON "mcp_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_user_id_idx" ON "mcp_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_workspace_id_idx" ON "mcp_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serverless_jobs_workspace_id_idx" ON "serverless_jobs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serverless_jobs_project_id_idx" ON "serverless_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serverless_jobs_user_id_idx" ON "serverless_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serverless_jobs_idempotency_idx" ON "serverless_jobs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serverless_jobs_status_idx" ON "serverless_jobs" USING btree ("status");