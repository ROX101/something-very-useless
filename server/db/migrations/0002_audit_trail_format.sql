CREATE TABLE "registrations" (
	"ref" text PRIMARY KEY NOT NULL,
	"kind" varchar(8) NOT NULL,
	"apaar" char(12),
	"mobile" varchar(10),
	"org" text,
	"email" text,
	"purpose" text,
	"status" varchar(12) DEFAULT 'Received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "role_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "org" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "category" varchar(24) DEFAULT 'System' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "detail" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "reference" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "retention_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
-- Backfill the readable fields for entries written before this format existed.
UPDATE "audit_log" a SET
  "actor_name" = COALESCE((SELECT u."name" FROM "users" u WHERE u."user_id" = a."actor"), a."actor"),
  "org" = COALESCE((SELECT u."org" FROM "users" u WHERE u."user_id" = a."actor"), ''),
  "role_label" = CASE a."role"
    WHEN 'aicte_bureau' THEN 'Regulation Bureau Officer' WHEN 'aicte_regional' THEN 'Regional Officer'
    WHEN 'aicte_admin' THEN 'AICTE Administrator' WHEN 'inst_admin' THEN 'Institution Admin (Nodal Officer)'
    WHEN 'inst_operator' THEN 'Data Operator' WHEN 'student' THEN 'Student' WHEN 'verifier' THEN 'Registered Verifier'
    ELSE a."role" END,
  "category" = CASE split_part(a."action", '.', 1)
    WHEN 'auth' THEN 'Sign-in' WHEN 'upload' THEN 'Data' WHEN 'submission' THEN 'Submission'
    WHEN 'alert' THEN 'Compliance' WHEN 'consent' THEN 'Consent' WHEN 'record' THEN 'Verification' ELSE 'System' END,
  "detail" = trim(both ', ' from a."entity_id" || CASE WHEN a."payload" = '{}'::jsonb THEN '' ELSE ', ' || a."payload"::text END),
  "action" = CASE a."action"
    WHEN 'auth.login' THEN 'Signed in' WHEN 'auth.logout' THEN 'Signed out'
    WHEN 'upload.create' THEN 'Uploaded enrolment file' WHEN 'upload.fix' THEN 'Applied suggested fixes'
    WHEN 'upload.discard' THEN 'Removed uploaded file' WHEN 'submission.create' THEN 'Submitted enrolment data to AICTE'
    WHEN 'alert.action' THEN 'Case action' WHEN 'consent.request' THEN 'Requested consent'
    WHEN 'consent.grant' THEN 'Allowed verification' WHEN 'consent.refuse' THEN 'Refused verification'
    WHEN 'consent.revoke' THEN 'Revoked consent' WHEN 'record.view' THEN 'Viewed shared record'
    ELSE a."action" END
WHERE a."actor_name" = '';
--> statement-breakpoint
-- Number entries 1..n with no gaps, then rebuild the hash chain in the new format.
UPDATE "audit_log" SET "seq" = -s.n FROM (SELECT "seq" AS old, row_number() OVER (ORDER BY "seq") AS n FROM "audit_log") s WHERE "audit_log"."seq" = s.old;
--> statement-breakpoint
UPDATE "audit_log" SET "seq" = -"seq";
--> statement-breakpoint
DO $$
DECLARE r record; prev text := repeat('0', 64); h text;
BEGIN
  FOR r IN SELECT * FROM "audit_log" ORDER BY "seq" LOOP
    h := encode(sha256(convert_to(concat_ws('|', r."seq"::text,
      to_char(r."at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      r."actor_name", r."role_label", r."org", r."category", r."action", r."detail", prev), 'UTF8')), 'hex');
    UPDATE "audit_log" SET "prev_hash" = prev, "hash" = h WHERE "seq" = r."seq";
    prev := h;
  END LOOP;
END $$;
