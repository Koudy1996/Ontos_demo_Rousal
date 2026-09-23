CREATE SCHEMA "sales_inquiries";
--> statement-breakpoint
CREATE TABLE "sales_inquiries"."gateway_assertion_redemptions" (
	"issuer" text,
	"audience" text,
	"jti" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gateway_assertion_redemptions_pkey" PRIMARY KEY("issuer","audience","jti")
);
--> statement-breakpoint
CREATE TABLE "sales_inquiries"."inquiries" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"stage" text NOT NULL,
	"service_location" jsonb NOT NULL,
	"object_type" text NOT NULL,
	"description" text NOT NULL,
	"requested_date" text,
	"floor" integer,
	"elevator" boolean,
	"estimated_volume_m3" text,
	"special_waste" text,
	"site_visit_at" text,
	"internal_note" text NOT NULL,
	"service_offer" jsonb,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"sent_at" text,
	"accepted_at" text,
	"declined_at" text,
	"acceptance" jsonb,
	"decline_reason" text,
	CONSTRAINT "inquiries_tenant_legal_entity_id" UNIQUE("tenant_id","legal_entity_id","id"),
	CONSTRAINT "inquiries_revision_positive" CHECK ("revision" > 0),
	CONSTRAINT "inquiries_stage_valid" CHECK ("stage" IN ('NEW','SITE_VISIT','PRICING','OFFER_SENT','ACCEPTED','DECLINED')),
	CONSTRAINT "inquiries_offer_sent" CHECK ("stage" NOT IN ('OFFER_SENT','ACCEPTED','DECLINED') OR ("service_offer" IS NOT NULL AND "sent_at" IS NOT NULL)),
	CONSTRAINT "inquiries_acceptance_present" CHECK ("stage" <> 'ACCEPTED' OR ("acceptance" IS NOT NULL AND "accepted_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "sales_inquiries"."inquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "inquiries_scope_stage" ON "sales_inquiries"."inquiries" ("tenant_id","legal_entity_id","stage");--> statement-breakpoint
CREATE POLICY "inquiries_scope_select" ON "sales_inquiries"."inquiries" AS PERMISSIVE FOR SELECT TO "ontos_runtime" USING ("sales_inquiries"."inquiries"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "sales_inquiries"."inquiries"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "inquiries_scope_insert" ON "sales_inquiries"."inquiries" AS PERMISSIVE FOR INSERT TO "ontos_runtime" WITH CHECK ("sales_inquiries"."inquiries"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "sales_inquiries"."inquiries"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "inquiries_scope_update" ON "sales_inquiries"."inquiries" AS PERMISSIVE FOR UPDATE TO "ontos_runtime" USING ("sales_inquiries"."inquiries"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "sales_inquiries"."inquiries"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid) WITH CHECK ("sales_inquiries"."inquiries"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "sales_inquiries"."inquiries"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "inquiries_scope_delete" ON "sales_inquiries"."inquiries" AS PERMISSIVE FOR DELETE TO "ontos_runtime" USING ("sales_inquiries"."inquiries"."tenant_id" = nullif(current_setting('ontos.tenant_id', true), '')::uuid and "sales_inquiries"."inquiries"."legal_entity_id" = nullif(current_setting('ontos.legal_entity_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sales_inquiries"."inquiries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "sales_inquiries" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "sales_inquiries"."inquiries" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "sales_inquiries"."gateway_assertion_redemptions" TO ontos_runtime;
