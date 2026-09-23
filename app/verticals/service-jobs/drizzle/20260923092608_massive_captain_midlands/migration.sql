CREATE SCHEMA "service_jobs";
--> statement-breakpoint
CREATE TABLE "service_jobs"."gateway_assertion_redemptions" (
	"audience" text,
	"expires_at" timestamp with time zone NOT NULL,
	"issuer" text,
	"jti" uuid,
	CONSTRAINT "gateway_assertion_redemptions_pkey" PRIMARY KEY("issuer","audience","jti")
);
--> statement-breakpoint
CREATE TABLE "service_jobs"."jobs" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"party_id" uuid NOT NULL,
	"accepted_at" text NOT NULL,
	"acceptance" jsonb NOT NULL,
	"service_location" jsonb NOT NULL,
	"service_scope" jsonb NOT NULL,
	"commercial_summary" jsonb NOT NULL,
	"status" text NOT NULL,
	"revision" integer NOT NULL,
	"scheduled_start_at" text,
	"expected_duration_minutes" integer,
	"started_at" text,
	"completed_at" text,
	"checklist" jsonb NOT NULL,
	"execution_note" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "jobs_source_once" UNIQUE("tenant_id","legal_entity_id","source_id"),
	CONSTRAINT "jobs_revision_positive" CHECK ("revision" > 0 AND "source_revision" > 0),
	CONSTRAINT "jobs_status_valid" CHECK ("status" IN ('NEW','PLANNED','IN_PROGRESS','COMPLETED')),
	CONSTRAINT "jobs_schedule_present" CHECK ("status" = 'NEW' OR "scheduled_start_at" IS NOT NULL),
	CONSTRAINT "jobs_started_present" CHECK (("status" IN ('NEW','PLANNED') AND "started_at" IS NULL) OR ("status" IN ('IN_PROGRESS','COMPLETED') AND "started_at" IS NOT NULL)),
	CONSTRAINT "jobs_completed_present" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)),
	CONSTRAINT "jobs_duration_valid" CHECK ("expected_duration_minutes" IS NULL OR "expected_duration_minutes" BETWEEN 1 AND 10080)
);
--> statement-breakpoint
ALTER TABLE "service_jobs"."jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "jobs_scope_status_schedule" ON "service_jobs"."jobs" ("tenant_id","legal_entity_id","status","scheduled_start_at");--> statement-breakpoint
CREATE POLICY "jobs_scope_select" ON "service_jobs"."jobs" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("service_jobs"."jobs"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "service_jobs"."jobs"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "jobs_scope_insert" ON "service_jobs"."jobs" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("service_jobs"."jobs"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "service_jobs"."jobs"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "jobs_scope_update" ON "service_jobs"."jobs" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("service_jobs"."jobs"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "service_jobs"."jobs"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("service_jobs"."jobs"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "service_jobs"."jobs"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "jobs_scope_delete" ON "service_jobs"."jobs" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("service_jobs"."jobs"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "service_jobs"."jobs"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "service_jobs"."jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "service_jobs" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "service_jobs"."jobs" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "service_jobs"."gateway_assertion_redemptions" TO ontos_runtime;
