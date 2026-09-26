CREATE TABLE "payment_term_catalog"."gateway_assertion_redemptions" (
	"audience" text,
	"expires_at" timestamp with time zone NOT NULL,
	"issuer" text,
	"jti" uuid,
	CONSTRAINT "gateway_assertion_redemptions_pkey" PRIMARY KEY("issuer","audience","jti")
);

--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "payment_term_catalog"."gateway_assertion_redemptions" TO ontos_runtime;
