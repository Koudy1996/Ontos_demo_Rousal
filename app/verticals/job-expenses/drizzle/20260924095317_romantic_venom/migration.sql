CREATE SCHEMA "job_expenses";
--> statement-breakpoint
CREATE TABLE "job_expenses"."gateway_assertion_redemptions" (
	"audience" text,
	"expires_at" timestamp with time zone NOT NULL,
	"issuer" text,
	"jti" uuid,
	CONSTRAINT "gateway_assertion_redemptions_pkey" PRIMARY KEY("issuer","audience","jti")
);
--> statement-breakpoint
CREATE TABLE "job_expenses"."job_expenses" (
	"amount_czk" numeric(14,2) NOT NULL,
	"category" text NOT NULL,
	"cost_basis" text NOT NULL,
	"created_at" text NOT NULL,
	"currency" text NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY,
	"incurred_on" date NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"service_job_id" uuid NOT NULL,
	"status" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"updated_at" text NOT NULL,
	"voided_at" text,
	"void_reason" text,
	CONSTRAINT "job_expenses_scope_identity" UNIQUE("tenant_id","legal_entity_id","id"),
	CONSTRAINT "job_expenses_amount_positive" CHECK ("amount_czk" > 0),
	CONSTRAINT "job_expenses_category_valid" CHECK ("category" IN ('WORK','TRANSPORT','DISPOSAL','MATERIAL','OTHER')),
	CONSTRAINT "job_expenses_description_valid" CHECK (length(trim("description")) > 0 AND length("description") <= 500),
	CONSTRAINT "job_expenses_currency_valid" CHECK ("currency" = 'CZK'),
	CONSTRAINT "job_expenses_cost_basis_valid" CHECK ("cost_basis" = 'EXCLUDING_VAT'),
	CONSTRAINT "job_expenses_status_valid" CHECK ("status" IN ('RECORDED','VOIDED')),
	CONSTRAINT "job_expenses_revision_positive" CHECK ("revision" > 0),
	CONSTRAINT "job_expenses_void_state_valid" CHECK (("status" = 'RECORDED' AND "voided_at" IS NULL AND "void_reason" IS NULL) OR ("status" = 'VOIDED' AND "voided_at" IS NOT NULL AND length(trim("void_reason")) > 0 AND length("void_reason") <= 500))
);
--> statement-breakpoint
ALTER TABLE "job_expenses"."job_expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "job_expenses_scope_select" ON "job_expenses"."job_expenses" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("job_expenses"."job_expenses"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "job_expenses"."job_expenses"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "job_expenses_scope_insert" ON "job_expenses"."job_expenses" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("job_expenses"."job_expenses"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "job_expenses"."job_expenses"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "job_expenses_scope_update" ON "job_expenses"."job_expenses" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("job_expenses"."job_expenses"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "job_expenses"."job_expenses"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("job_expenses"."job_expenses"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "job_expenses"."job_expenses"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "job_expenses_scope_delete" ON "job_expenses"."job_expenses" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("job_expenses"."job_expenses"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "job_expenses"."job_expenses"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "job_expenses"."job_expenses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "job_expenses" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "job_expenses"."job_expenses" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "job_expenses"."gateway_assertion_redemptions" TO ontos_runtime;
