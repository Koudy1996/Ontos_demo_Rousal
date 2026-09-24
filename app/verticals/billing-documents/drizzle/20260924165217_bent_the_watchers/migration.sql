CREATE SCHEMA "billing_documents";
--> statement-breakpoint
CREATE TABLE "billing_documents"."gateway_assertion_redemptions" (
	"audience" text,
	"expires_at" timestamp with time zone NOT NULL,
	"issuer" text,
	"jti" uuid,
	CONSTRAINT "gateway_assertion_redemptions_pkey" PRIMARY KEY("issuer","audience","jti")
);
--> statement-breakpoint
CREATE TABLE "billing_documents"."invoice_number_counters" (
	"invoice_year" integer,
	"last_number" integer NOT NULL,
	"legal_entity_id" uuid,
	"tenant_id" uuid,
	CONSTRAINT "invoice_number_counters_pkey" PRIMARY KEY("tenant_id","legal_entity_id","invoice_year"),
	CONSTRAINT "billing_documents_counter_year_ck" CHECK ("invoice_year" between 1 and 9999),
	CONSTRAINT "billing_documents_counter_value_ck" CHECK ("last_number" between 1 and 999999)
);
--> statement-breakpoint
ALTER TABLE "billing_documents"."invoice_number_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_documents"."invoices" (
	"commercial_currency" text NOT NULL,
	"commercial_price_basis" text NOT NULL,
	"commercial_total" numeric(14,2) NOT NULL,
	"created_at" text NOT NULL,
	"customer_party_id" uuid NOT NULL,
	"description" text NOT NULL,
	"due_at" text,
	"id" uuid PRIMARY KEY,
	"invoice_number" text,
	"issued_at" text,
	"issuer_snapshot" jsonb,
	"legal_entity_id" uuid NOT NULL,
	"payment_term_id" uuid,
	"payment_term_snapshot" jsonb,
	"recipient_address_selection" jsonb,
	"recipient_snapshot" jsonb,
	"revision" integer NOT NULL,
	"source_accepted_at" text NOT NULL,
	"source_job_id" uuid NOT NULL,
	"source_revision" integer NOT NULL,
	"status" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "billing_documents_invoice_source_uk" UNIQUE("tenant_id","legal_entity_id","source_job_id"),
	CONSTRAINT "billing_documents_invoice_number_uk" UNIQUE("tenant_id","legal_entity_id","invoice_number"),
	CONSTRAINT "billing_documents_invoice_status_ck" CHECK ("status" in ('DRAFT', 'ISSUED')),
	CONSTRAINT "billing_documents_invoice_amount_ck" CHECK ("commercial_total" >= 0),
	CONSTRAINT "billing_documents_invoice_currency_ck" CHECK ("commercial_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "billing_documents_invoice_price_basis_ck" CHECK ("commercial_price_basis" in ('INCLUDING_VAT', 'EXCLUDING_VAT')),
	CONSTRAINT "billing_documents_invoice_description_ck" CHECK (length(btrim("description")) between 1 and 500),
	CONSTRAINT "billing_documents_invoice_revision_ck" CHECK ("revision" > 0),
	CONSTRAINT "billing_documents_invoice_lifecycle_ck" CHECK (("status" = 'DRAFT' and "invoice_number" is null and "issued_at" is null and "due_at" is null and "recipient_snapshot" is null and "payment_term_snapshot" is null and "issuer_snapshot" is null) or ("status" = 'ISSUED' and "invoice_number" is not null and "issued_at" is not null and "due_at" is not null and "recipient_snapshot" is not null and "payment_term_snapshot" is not null and "issuer_snapshot" is not null))
);
--> statement-breakpoint
ALTER TABLE "billing_documents"."invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "billing_documents_counter_scope_select" ON "billing_documents"."invoice_number_counters" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("billing_documents"."invoice_number_counters"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoice_number_counters"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_documents_counter_scope_insert" ON "billing_documents"."invoice_number_counters" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("billing_documents"."invoice_number_counters"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoice_number_counters"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_documents_counter_scope_update" ON "billing_documents"."invoice_number_counters" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("billing_documents"."invoice_number_counters"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoice_number_counters"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("billing_documents"."invoice_number_counters"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoice_number_counters"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_documents_counter_scope_delete" ON "billing_documents"."invoice_number_counters" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("billing_documents"."invoice_number_counters"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoice_number_counters"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_documents_invoice_scope_select" ON "billing_documents"."invoices" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("billing_documents"."invoices"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoices"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_documents_invoice_scope_insert" ON "billing_documents"."invoices" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("billing_documents"."invoices"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoices"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_documents_invoice_scope_update" ON "billing_documents"."invoices" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("billing_documents"."invoices"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoices"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("billing_documents"."invoices"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoices"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "billing_documents_invoice_scope_delete" ON "billing_documents"."invoices" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("billing_documents"."invoices"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "billing_documents"."invoices"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "billing_documents"."invoice_number_counters" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_documents"."invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "billing_documents" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "billing_documents"."invoice_number_counters" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "billing_documents"."invoices" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "billing_documents"."gateway_assertion_redemptions" TO ontos_runtime;