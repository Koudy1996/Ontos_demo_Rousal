CREATE SCHEMA "workforce";
--> statement-breakpoint
CREATE TABLE "workforce"."absences" (
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"id" uuid PRIMARY KEY,
	"legal_entity_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	CONSTRAINT "absence_dates_valid" CHECK ("date_to" >= "date_from"),
	CONSTRAINT "absence_reason_valid" CHECK ("reason" IN ('VACATION','SICK','OTHER'))
);
--> statement-breakpoint
ALTER TABLE "workforce"."absences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workforce"."assignments" (
	"created_at" text NOT NULL,
	"job_id" uuid,
	"legal_entity_id" uuid,
	"tenant_id" uuid,
	"worker_id" uuid,
	CONSTRAINT "assignments_pkey" PRIMARY KEY("tenant_id","legal_entity_id","worker_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "workforce"."assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workforce"."gateway_assertion_redemptions" (
	"audience" text,
	"expires_at" timestamp with time zone NOT NULL,
	"issuer" text,
	"jti" uuid,
	CONSTRAINT "gateway_assertion_redemptions_pkey" PRIMARY KEY("issuer","audience","jti")
);
--> statement-breakpoint
CREATE TABLE "workforce"."workers" (
	"agreement_type" text NOT NULL,
	"agreement_valid_from" date NOT NULL,
	"agreement_valid_to" date,
	"created_at" text NOT NULL,
	"display_name" text NOT NULL,
	"id" uuid PRIMARY KEY,
	"internal_hourly_cost_czk" numeric(14,2),
	"legal_entity_id" uuid NOT NULL,
	"phone" text,
	"position" text,
	"revision" integer NOT NULL,
	"status" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "workers_scope_identity" UNIQUE("tenant_id","legal_entity_id","id"),
	CONSTRAINT "workers_name_valid" CHECK (length(trim("display_name")) > 0 AND length("display_name") <= 500),
	CONSTRAINT "workers_status_valid" CHECK ("status" IN ('ACTIVE','INACTIVE')),
	CONSTRAINT "workers_agreement_valid" CHECK ("agreement_type" IN ('EMPLOYMENT','DPP','DPC','CONTRACTOR') AND ("agreement_valid_to" IS NULL OR "agreement_valid_to" >= "agreement_valid_from")),
	CONSTRAINT "workers_cost_valid" CHECK ("internal_hourly_cost_czk" IS NULL OR "internal_hourly_cost_czk" >= 0),
	CONSTRAINT "workers_revision_positive" CHECK ("revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "workforce"."workers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workforce"."absences" ADD CONSTRAINT "absence_worker_scope" FOREIGN KEY ("tenant_id","legal_entity_id","worker_id") REFERENCES "workforce"."workers"("tenant_id","legal_entity_id","id");--> statement-breakpoint
ALTER TABLE "workforce"."assignments" ADD CONSTRAINT "assignment_worker_scope" FOREIGN KEY ("tenant_id","legal_entity_id","worker_id") REFERENCES "workforce"."workers"("tenant_id","legal_entity_id","id");--> statement-breakpoint
CREATE POLICY "absences_scope_select" ON "workforce"."absences" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("workforce"."absences"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."absences"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "absences_scope_insert" ON "workforce"."absences" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("workforce"."absences"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."absences"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "absences_scope_update" ON "workforce"."absences" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("workforce"."absences"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."absences"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("workforce"."absences"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."absences"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "absences_scope_delete" ON "workforce"."absences" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("workforce"."absences"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."absences"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assignments_scope_select" ON "workforce"."assignments" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("workforce"."assignments"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."assignments"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assignments_scope_insert" ON "workforce"."assignments" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("workforce"."assignments"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."assignments"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assignments_scope_update" ON "workforce"."assignments" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("workforce"."assignments"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."assignments"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("workforce"."assignments"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."assignments"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "assignments_scope_delete" ON "workforce"."assignments" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("workforce"."assignments"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."assignments"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "workers_scope_select" ON "workforce"."workers" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("workforce"."workers"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."workers"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "workers_scope_insert" ON "workforce"."workers" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("workforce"."workers"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."workers"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "workers_scope_update" ON "workforce"."workers" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("workforce"."workers"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."workers"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("workforce"."workers"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."workers"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "workers_scope_delete" ON "workforce"."workers" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("workforce"."workers"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "workforce"."workers"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "workforce"."workers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workforce"."absences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workforce"."assignments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "workforce" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "workforce"."workers" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "workforce"."absences", "workforce"."assignments", "workforce"."gateway_assertion_redemptions" TO ontos_runtime;
