CREATE TABLE "access_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"apaar" char(12) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"alert_id" text NOT NULL,
	"status" varchar(40) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apaar_registry" (
	"apaar" char(12) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dob" date NOT NULL,
	"gender" char(1) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"role" varchar(24) NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"prev_hash" char(64) NOT NULL,
	"hash" char(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_pid" varchar(20) NOT NULL,
	"institution" text NOT NULL,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"rule" varchar(4) NOT NULL,
	"clause" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"receipt_no" text,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"risk" integer
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"cert_no" text PRIMARY KEY NOT NULL,
	"apaar" char(12) NOT NULL,
	"jws" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "enrolments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"apaar" char(12) NOT NULL,
	"institution_pid" varchar(20) NOT NULL,
	"institution" text NOT NULL,
	"city" text NOT NULL,
	"ay" varchar(7) NOT NULL,
	"programme" text,
	"submission_receipt" text
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"pid" varchar(20) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"university" text,
	"type" text,
	"initials" varchar(8),
	"established" integer,
	"approval" text,
	"motto" text
);
--> statement-breakpoint
CREATE TABLE "programmes" (
	"institution_pid" varchar(20) NOT NULL,
	"code" varchar(16) NOT NULL,
	"label" text NOT NULL,
	"name" text NOT NULL,
	"intake" integer NOT NULL,
	CONSTRAINT "programmes_institution_pid_code_pk" PRIMARY KEY("institution_pid","code")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"receipt_no" text PRIMARY KEY NOT NULL,
	"institution_pid" varchar(20) NOT NULL,
	"upload_id" integer NOT NULL,
	"ay" varchar(7) NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" text NOT NULL,
	"file_name" text NOT NULL,
	"records" integer NOT NULL,
	"alerts" integer NOT NULL,
	"hash" char(64) NOT NULL,
	"status" varchar(24) DEFAULT 'Received' NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"institution_pid" varchar(20) NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fixes_applied" integer DEFAULT 0 NOT NULL,
	"rows" jsonb NOT NULL,
	"current" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" varchar(24) NOT NULL,
	"org" text NOT NULL,
	"scope" text NOT NULL,
	"institution_pid" varchar(20),
	"apaar" char(12),
	"states" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"apaar" char(12) NOT NULL,
	"verifier_user_id" text,
	"verifier" text NOT NULL,
	"verifier_org" text NOT NULL,
	"purpose" text NOT NULL,
	"validity_days" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(12) DEFAULT 'Pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"consent_no" text,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_receipt_no_submissions_receipt_no_fk" FOREIGN KEY ("receipt_no") REFERENCES "public"."submissions"("receipt_no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_institution_pid_institutions_pid_fk" FOREIGN KEY ("institution_pid") REFERENCES "public"."institutions"("pid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_institution_pid_institutions_pid_fk" FOREIGN KEY ("institution_pid") REFERENCES "public"."institutions"("pid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_institution_pid_institutions_pid_fk" FOREIGN KEY ("institution_pid") REFERENCES "public"."institutions"("pid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_users_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_pid_institutions_pid_fk" FOREIGN KEY ("institution_pid") REFERENCES "public"."institutions"("pid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_verifier_user_id_users_user_id_fk" FOREIGN KEY ("verifier_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_log_apaar_idx" ON "access_log" USING btree ("apaar","at");--> statement-breakpoint
CREATE INDEX "alert_actions_alert_idx" ON "alert_actions" USING btree ("alert_id","at");--> statement-breakpoint
CREATE INDEX "alerts_state_idx" ON "compliance_alerts" USING btree ("state");--> statement-breakpoint
CREATE INDEX "alerts_rule_idx" ON "compliance_alerts" USING btree ("rule");--> statement-breakpoint
CREATE INDEX "enrolments_apaar_idx" ON "enrolments" USING btree ("apaar");--> statement-breakpoint
CREATE UNIQUE INDEX "enrolments_unique" ON "enrolments" USING btree ("apaar","institution_pid","ay");--> statement-breakpoint
CREATE INDEX "submissions_inst_idx" ON "submissions" USING btree ("institution_pid","submitted_at");--> statement-breakpoint
CREATE INDEX "uploads_inst_current_idx" ON "uploads" USING btree ("institution_pid","current");--> statement-breakpoint
CREATE INDEX "vr_apaar_idx" ON "verification_requests" USING btree ("apaar");--> statement-breakpoint
CREATE INDEX "vr_org_idx" ON "verification_requests" USING btree ("verifier_org");