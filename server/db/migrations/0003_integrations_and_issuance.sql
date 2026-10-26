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
CREATE TABLE "issuers" (
	"did" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short" varchar(12) NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"kid" varchar(40) NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_jwk_enc" text NOT NULL,
	"status" varchar(12) DEFAULT 'registered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issuers_kid_unique" UNIQUE("kid")
);
--> statement-breakpoint
CREATE TABLE "otps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statutory_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org" text NOT NULL,
	"institution_pid" varchar(20) NOT NULL,
	"basis" text NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "enrolments" ALTER COLUMN "apaar" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "public_jws" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "issuer_did" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "status_index" integer;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "holder_name" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "student_id" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "programme_code" varchar(16);--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "degree" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "cgpa" varchar(8);--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "institution_pid" varchar(20);--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "issued_by" text;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "inst_student_id" text;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "name_key" text;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "dob" date;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "gender" char(1);--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "category" varchar(12);--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "quota" varchar(16);--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "status" varchar(12) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "status_date" date;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "awarding_did" text;--> statement-breakpoint
ALTER TABLE "programmes" ADD COLUMN "last_year_admitted" integer;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "issuer_did" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "fields" text[] DEFAULT '{"basic"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "first_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "erase_by" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_institution_pid_institutions_pid_fk" FOREIGN KEY ("institution_pid") REFERENCES "public"."institutions"("pid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_access" ADD CONSTRAINT "statutory_access_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_access" ADD CONSTRAINT "statutory_access_institution_pid_institutions_pid_fk" FOREIGN KEY ("institution_pid") REFERENCES "public"."institutions"("pid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otps_user_idx" ON "otps" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_status_idx" ON "credentials" USING btree ("issuer_did","status_index");--> statement-breakpoint
CREATE INDEX "enrolments_person_idx" ON "enrolments" USING btree ("name_key","dob");