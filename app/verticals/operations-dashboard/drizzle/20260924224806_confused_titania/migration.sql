CREATE SCHEMA "operations_dashboard";
--> statement-breakpoint
CREATE TABLE "operations_dashboard"."gateway_assertion_redemptions" (
	"audience" text,
	"expires_at" timestamp with time zone NOT NULL,
	"issuer" text,
	"jti" uuid,
	CONSTRAINT "gateway_assertion_redemptions_pkey" PRIMARY KEY("issuer","audience","jti")
);
--> statement-breakpoint
GRANT USAGE ON SCHEMA "operations_dashboard" TO ontos_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "operations_dashboard"."gateway_assertion_redemptions" TO ontos_runtime;
