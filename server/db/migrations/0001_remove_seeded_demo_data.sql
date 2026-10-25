-- Removes the sample activity data that earlier versions seeded. Demo accounts, the Aranya institution,
-- its programmes, the APAAR registry stand-in and the issued credential are kept.
-- Only rows created by the old seed are touched; anything created through the app stays.

-- 12 sample national alerts (ids S-…) and any case actions taken on them
DELETE FROM "alert_actions" WHERE "alert_id" LIKE 'S-%';
--> statement-breakpoint
DELETE FROM "compliance_alerts" WHERE "id" LIKE 'S-%' AND "live" = false;
--> statement-breakpoint

-- The pre-made consent request RQ-1001 and its log lines (request, and any decision/view on it)
DELETE FROM "access_log" WHERE "apaar" = '447120936618' AND (
  ("actor" = 'Tarang Software Pvt. Ltd.' AND "at" = (SELECT "created_at" FROM "verification_requests" WHERE "id" = 'RQ-1001'))
  OR "action" LIKE '%' || (SELECT "consent_no" FROM "verification_requests" WHERE "id" = 'RQ-1001' AND "consent_no" IS NOT NULL) || '%'
  OR ("actor" = 'You' AND "action" = 'Refused the request from Tarang Software Pvt. Ltd.'
      AND "at" = (SELECT "decided_at" FROM "verification_requests" WHERE "id" = 'RQ-1001'))
);
--> statement-breakpoint
DELETE FROM "verification_requests" WHERE "id" = 'RQ-1001';
--> statement-breakpoint

-- The fake cross-enrolment at Meghavarsha (seeded rows have no submission receipt)
DELETE FROM "enrolments" WHERE "submission_receipt" IS NULL;
--> statement-breakpoint

-- Sample institutions that existed only to own the sample alerts
DELETE FROM "institutions" i WHERE i."pid" <> '1-9000417'
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."institution_pid" = i."pid")
  AND NOT EXISTS (SELECT 1 FROM "programmes" p WHERE p."institution_pid" = i."pid")
  AND NOT EXISTS (SELECT 1 FROM "uploads" up WHERE up."institution_pid" = i."pid")
  AND NOT EXISTS (SELECT 1 FROM "submissions" s WHERE s."institution_pid" = i."pid");
