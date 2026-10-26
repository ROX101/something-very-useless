CREATE TABLE "api_keys" (
	"id" varchar(24) PRIMARY KEY NOT NULL,
	"scope" varchar(12) NOT NULL,
	"institution_pid" varchar(20),
	"name" text NOT NULL,
	"secret_hash" char(64) NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency" (
	"key" text NOT NULL,
	"api_key_id" varchar(24) NOT NULL,
	"status" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_api_key_id_key_pk" PRIMARY KEY("api_key_id","key")
);
--> statement-breakpoint
ALTER TABLE "programmes" ADD COLUMN "last_year_admitted" integer;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_institution_pid_institutions_pid_fk" FOREIGN KEY ("institution_pid") REFERENCES "public"."institutions"("pid") ON DELETE no action ON UPDATE no action;