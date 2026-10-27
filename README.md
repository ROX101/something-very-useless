# APAAR (SIH 2026 · SIH26263)

Student data management and verification platform for AICTE-approved institutions.

## Run locally
Needs Node 20+ and PostgreSQL 14+.
```bash
npm install
cp .env.example .env            # optional: defaults already point at postgres://apaar:apaar@localhost:5432/apaar_sathi
createdb apaar_sathi            # or: docker run -d -p 5432:5432 -e POSTGRES_USER=apaar -e POSTGRES_PASSWORD=apaar -e POSTGRES_DB=apaar_sathi postgres:16
npm run db:seed                 # migrate + load demo data
npm run dev                     # API on :8080, web on http://localhost:5173 (Vite proxies /api)
```
Tests:
```bash
npm test                        # rules engine, sign-in rules, crypto, watermark (18)
npm run test:api                # API against Postgres database apaar_sathi_test (66)
```

## Architecture
```
src/      React + Vite frontend
server/   Express API (TypeScript), bundled with esbuild
  db/       Drizzle schema, SQL migrations, demo seed
  routes/   auth · inst · aicte · student · verifier · public · university · credentials
            regulator · onboarding (registrations) · v1 (integration API with API keys)
  services/ validation · insights · anomalies · credentials · consent · otp · events · reports
  lib/      JWT session cookie, role guard, hash-chained audit log, API keys, ES256 signing
```
- One service serves both `/api/*` and the built frontend, so there is one URL and no CORS.
- The rules engine (`src/inst/engine/rules.ts`) is shared: the browser runs it for instant preview, and the server runs it again on submit. The server's result is the official one.
- Sessions are an httpOnly, Secure, SameSite=Lax cookie holding an HS256 JWT. Roles and the `@aicte-india.org` domain rule are enforced on the server.
- Every write goes to `audit_log`, where each entry holds the SHA-256 of the previous one. `GET /api/aicte/audit/verify` re-checks the chain.
- Migrations run on every boot. On the first boot with an empty database (`SEED_ON_BOOT`), the server loads only what the demo logins need: the 9 accounts, the Aranya institution and its programmes, plus stand-ins for the external systems (a mock APAAR registry and one issued degree). There is no activity data: alerts, consent requests, submissions and national figures all start at zero and come from real use.
- Migration `0001` removes the sample activity data seeded by earlier versions (sample alerts, request RQ-1001, the fake cross-enrolment) from existing databases. `0002` moves the audit trail to the hash-chain format. `0003` adds the integration API, credential issuance, probable duplicates, statutory access, OTPs, erasure tracking and in-year events. On boot, existing databases also get any missing demo accounts, the GTU issuer key and the re-signed demo degree.

## Deploy on Railway
1. **New Project → Deploy from GitHub repo**, and pick this repository/branch. `railway.json` makes Railway build with the `Dockerfile` and health-check `/api/health`.
2. In the same project: **+ New → Database → PostgreSQL**.
3. Open the web service → **Variables** and add:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable; the private network needs no SSL) |
   | `JWT_SECRET` | a long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `NODE_ENV` | `production` |
   | `SIGNING_KEY_SECRET` | another long random string; encrypts the universities' private signing keys (AES-256-GCM). Keep it stable: changing it makes existing keys unreadable |
   | `PUBLIC_URL` | the site's https URL, used in certificate QR links and the W3C status-list URL |
   | `OTP_DEMO` | `true` shows the one-time password on screen (no SMS gateway in this build); set `false` once an SMS provider is connected |
4. **Settings → Networking → Generate Domain.** Railway sets `PORT` itself.
5. The first deploy migrates and seeds. Sign in with any demo account below.

To wipe and reseed later, run `npm run db:reset` with `DATABASE_URL` set to the Postgres **public** URL and `DATABASE_SSL=true`.

| API | Purpose |
|---|---|
| `POST /api/auth/login` · `/logout` · `GET /me` | Session |
| `POST /api/auth/password` | Change password (required after a one-time password) |
| `GET /api/inst/state` · `POST /uploads` · `PUT /uploads/current/rows` · `GET /validation` · `POST /submissions` | Institution (submit: nodal officer only) |
| `GET /api/inst/students` · `POST /students/events` · `GET /verify/:apaar` · `GET/POST/DELETE /api-keys` | In-year updates, prior-enrolment check, ERP keys |
| `GET /api/aicte/alerts` · `/cases` · `/live` · `/kpis` · `/insights` · `/rings` · `/reports/:nirf\|aishe\|nba` · `POST /alerts/:id/actions` | AICTE (regional officers see only their states) |
| `GET /api/aicte/audit` · `/audit/verify` · `/registrations` · `POST /registrations/:ref/decide` | Audit log, onboarding (IT cell) |
| `GET /api/student/requests` · `/log` · `/record` · `POST /requests/:id/otp` · `/decide` · `/revoke` | Student consent (approval needs the OTP) |
| `GET/POST /api/verifier/requests` · `GET /records/:apaar` · `POST /requests/:id/erased` | Verifier (records need active consent; every read is logged) |
| `GET/POST /api/regulator/access` · `GET /access/:id/students[/:apaar]` | Regulator statutory access |
| `GET /api/university/students` · `/students.csv` · `GET/POST /credentials` · `POST /credentials/:certNo/revoke` | University registrar |
| `POST /api/v1/institutions/{pid}/enrolments:batch` · `GET .../enrolments/validation` · `GET /api/v1/students/{apaar}` · `POST /api/v1/aicte/approvals` | Integration API (API key, see `/api/openapi.json`) |
| `GET /api/public/issuers` · `/c/:certNo` · `/certificates/:certNo` · `/status/:issuer` · `POST /registrations` · `GET /api/health` | Public |

## Sign-in and registration
One sign-in page (`/`). The account decides the role and the portal (no role picker).
Password for every demo account: `Demo@2026` (also listed under "Demo accounts" on the sign-in page).
Fields are checked when you leave them; wrong user ID, wrong password and non-AICTE addresses for AICTE roles each get their own message.
"Register an account" opens `/register` in the same design: Student (APAAR ID and mobile number) or Organisation (name, work email, purpose of verification). The request is stored on the server (`registrations` table) and returns a reference number such as `REG-2026-10001`; institution and AICTE accounts are issued by AICTE, not self-registered.

| User ID | Role | Lands on |
|---|---|---|
| meena.iyer@aicte-india.org | Regulation Bureau Officer | /aicte |
| rahul.kulkarni@aicte-india.org | Regional Officer (Western) | /aicte (Maharashtra and Goa only) |
| sysadmin@aicte-india.org | AICTE Administrator | /aicte/admin |
| nodal@aranya-tech.edu.in | Institution Admin (nodal officer) | /inst |
| operator@aranya-tech.edu.in | Data Operator | /inst |
| nodal@meghavarsha-tech.edu.in | Institution Admin, Meghavarsha Institute of Technology, Bhopal (second demo college) | /inst |
| 4471 2093 6618 (APAAR ID) | Student | /student |
| kabir.menon@tarangsoftware.in | Registered Verifier | /verify |
| registrar@godavaritu.edu.in | University Registrar (GTU) | /university |
| assessor@naac.gov.in | Regulator (NAAC) | /regulator |

Registrations are approved by the AICTE Administrator at `/aicte/admin/registrations`. Approval creates the account (students only when the APAAR ID is in the registry) with a one-time password, which the applicant must replace at first sign-in.

Rules (enforced by the API, `server/routes/auth.ts`):
- AICTE roles only for `@aicte-india.org` accounts, and those accounts only get AICTE roles.
- Each portal route checks the role; opening another portal's URL sends you back to your own.
- Data lives in PostgreSQL, so the student and verifier can be on different devices; their pages refresh every few seconds.

## Institution portal
Sign in as `nodal@aranya-tech.edu.in` (or `operator@…`, who cannot submit).

| Page | Route |
|---|---|
| Dashboard | /inst |
| Upload & validate | /inst/upload (drop `public/Aranya_AY2026-27_FirstYear.xlsx`) |
| Seat ledger | /inst/ledger |
| Submit to AICTE | /inst/submit |
| In-year updates | /inst/students (withdrawal, transfer out, name correction, lateral entry, reinstatement) |
| APAAR check | /inst/check (before admission: APAAR ID real, name and DOB match, not still active elsewhere) |
| ERP / API access | Dashboard → API access (keys for the integration API) |

In-year changes update the national register at once (a withdrawn student no longer triggers R10 elsewhere), are logged in the student's access log, and are replayed when the institution resubmits, so a revised Excel file cannot undo them.

On a fresh database the sample file gives 509 rows → 482 clean / 17 need action / 10 auto-cleared; after the 12 suggested fixes → 507 records and 2 compliance alerts (R06, R07). R10 (cross-enrolment) fires only once another institution has submitted the same APAAR ID. The server and the browser preview must agree; `npm run test:api` checks this.

Per rule before fixes: R01 2, R02 4, R03 3, R04 1, R08 1, R09 1, R06 3, R07 2 (need action; R10 1 more once another institution has submitted the same student); R03a 6, R04a 2, R05a 2 (auto-cleared).
- Data errors (R01–R04, R08, R09) are fixed by the institution; "Apply 12 suggested fixes" applies them all, or fix one row at a time from its detail panel.
- Compliance alerts (R05, R06, R07, R10) cannot be cleared by the institution and go to AICTE with the submission.
- "Download issues (.xlsx)" exports every flagged row.
- Seat ledger: approved intake vs admitted per programme, supernumerary buckets (FN/OCI/CIWG 15%, TFW 5% only when at least half the seats are filled, PM-USPY 2 per course), excess seats past the intake line.
- Submit: only the nodal officer can submit, after the declaration; the receipt shows a receipt number and a SHA-256 fingerprint of the data.

### Demo: duplicate rings between two colleges
`public/Meghavarsha_AY2026-27_FirstYear.xlsx` (260 rows) is the second college's file. Submit Aranya's file first, then sign in as `nodal@meghavarsha-tech.edu.in` and upload it: 38 students are flagged R10 (same APAAR ID, also enrolled at Aranya) and 9 R11 (same date of birth, a slightly different spelling, no APAAR ID). After it is submitted, /aicte/rings shows the ring (38 + 9 probable) and Meghavarsha's risk score of 74 (cross-enrolment 30, probable duplicates 20, intake up 65% on last year 12, 48% of admissions in the last week 12). `npm run sample` regenerates both files.

In the preview table, select rows with the checkboxes and use **Remove selected** to drop wrongly entered students (before or after validation). Rows changed since upload are highlighted across the whole row: green for a suggested fix, orange for a hand edit, blue for a student added after upload; the **Updated** filter lists only those.

## AICTE portal
Sign in as `meena.iyer@aicte-india.org`.

| Page | Route | What it shows |
|---|---|---|
| National overview | /aicte | Institutions in scope, returns submitted, records received, APAAR-linked %, open alerts, cross-institution duplicates, state tile map, deadline. All computed from submitted data, starting at zero |
| Compliance alerts | /aicte/alerts | Every alert with its rows; the college's live submission appears at the top. Review a case, then Refer to Regional Office or Close with no action (reason required) |
| Duplicate rings | /aicte/rings | Students enrolled at two institutions at once (from submitted enrolments), the institution's risk score with the alerts behind it, the masked list of records, watch-list |
| Reports | /aicte/reports | Submission and APAAR coverage by state, excess-admission register, and server-built NIRF (intake, student strength by gender, outside country, EWS, SC+ST+OBC, TFW, PM-USPY), AISHE (gender × category, foreign) and NBA SAR enrolment ratio ER = (N1 + N4) / N. Export PDF, Excel |

Regional officers see the same pages, limited on the server to their states.

Duplicate detection: R10 flags the same APAAR ID active at two institutions; R11 flags probable duplicates (same date of birth, Jaro-Winkler name similarity ≥ 0.92, gender not conflicting, APAAR IDs different or missing). The watch-list adds statistical anomalies per institution (modified z-score against peers, ≥ 3.5; fixed thresholds when fewer than 5 peers): intake growth, last-week admissions, missing APAAR IDs, supernumerary share, revisions.

## Audit trail
Sign in as `sysadmin@aicte-india.org` (AICTE Administrator) to open `/aicte/admin`.
- Every action is recorded in PostgreSQL (`audit_log`) in order: sign-in (including failed attempts) and sign-out, uploads, fixes and record edits, submissions, case referrals and closures, consent requests, decisions, revocations and record views, certificate checks, reports and exports, and registrations.
- The server writes server-side events itself. The browser can only add events the server cannot see (certificate checks, report exports, draft entries), only for its own role, and always under the signed-in user.
- Each entry stores the SHA-256 of `seq|time|user|role|organisation|category|event|details|previous hash`, so the entries form a chain.
- "Verify integrity" downloads the trail and recomputes every hash in the browser, independently of the server (`GET /api/aicte/audit/verify` does the same check on the server). If anyone edits a row in the database, the check fails at that event and marks every later event as untrusted.
- Click an event to see its full hash and the previous event's hash.
- Filter by date, category, user or text, page through 25 events at a time, and export to Excel.
`npm run sample` regenerates the sample Excel file (deterministic).

## Stakeholder verification
| Who | How they verify | Safeguard |
|---|---|---|
| Anyone with the certificate | Scan the QR (`/c/<certNo>`) | Public summary only (no marks); W3C status list shows revocation |
| Employer, university admissions (verifier) | Consent request → student approves with OTP | Fields limited to what was asked; erase-by date from first view; erasure confirmed and shown to the student |
| Admitting institution | `/inst/check` | Logged in the student's access log; DOB only as match / no match |
| NAAC, NBA, NIRF, UGC (regulator) | `/regulator`: open access to one institution with a legal basis and reference, up to 30 days | Each student is told who looked and why; every view in the audit trail |
| Universities | `/university`: issue and revoke signed degrees (W3C VC, ES256) with the APAAR ID | Name checked against the APAAR registry; Aadhaar never printed |

## Student and verifier
| Account | Pages |
|---|---|
| Student `4471 2093 6618` | /student (record and degree QR), /student/requests (allow or refuse), /student/log |
| Verifier `kabir.menon@tarangsoftware.in` | /verify (camera, image or pasted code), /verify/requests |

Printable certificate: /certificate/GTU-2026-CSE-0417 (use "Altered copy" for the forged version with CGPA 9.42).
The QR holds a compact JWS signed with ES256 (ECDSA P-256). Only the public key is in the app.
`npm run credentials` creates a new university key and new QR codes; reprint certificates after running it.
Consent is stored on the server, so the student (phone) and the verifier (laptop) can be on different devices.

Consent requests carry a purpose (pre-employment verification, appointment or promotion, admission, education loan or scholarship, professional registration), a reference number for that purpose (offer letter, application number), how long access lasts (7, 15 or 30 days) and how long the verifier keeps the data (30, 90 or 180 days).
The student allows with a one-time password sent to the registered mobile (hashed on the server, valid 5 minutes, 5 tries; shown on screen while `OTP_DEMO=true`), refuses, or revokes later. The verifier sees name, degree, year and award status only while consent is active; marks, category, address and date of birth are never shared. Every view is written to the student's access log.

## Hidden watermark (steganography)
"Download digital copy" on the certificate page saves a PNG with an invisible watermark in its pixels:
- a hidden message (certificate number and a fingerprint of the signed QR data), stored three times;
- a keyed check for every 16 × 16 pixel area, so any edit is located.
Upload the PNG in the verifier: "Hidden watermark intact". Edit any part of it (for example the CGPA in Paint) and upload again: "Edited after issue", with the changed area boxed in red, even though the QR still verifies.
Printed or photographed copies do not carry the watermark; for those the QR signature is the check.

## Open on a phone
Phone browsers only allow the camera on https. Once deployed on Railway the site is already https, so just open its URL. Locally: run `npm run dev:api` in one terminal and `npm run phone` in another, then open the **Network** address it prints (https://<laptop-ip>:5173) on a phone on the same Wi-Fi. The browser warns about the certificate once: tap Advanced, then Proceed. Allow Camera when asked.
