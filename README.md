# APAAR (SIH 2026 · SIH26263)

Student data management and verification platform for AICTE-approved institutions.

## Run
```bash
npm install
npm test        # 17 checks: rules engine numbers, sample file, signatures, watermark, sign-in rules
npm run dev     # http://localhost:5173
```

## Sign-in and registration
One sign-in page (`/`). The account decides the role and the portal (no role picker).
Password for every demo account: `Demo@2026` (also listed under "Demo accounts" on the sign-in page).
Fields are checked when you leave them; wrong user ID, wrong password and non-AICTE addresses for AICTE roles each get their own message.
"Register an account" opens `/register` in the same design: Student (APAAR ID and mobile number) or Organisation (name, work email, purpose of verification). It returns a reference number such as `REG-2026-53821`; institution and AICTE accounts are issued by AICTE, not self-registered.

| User ID | Role | Lands on |
|---|---|---|
| meena.iyer@aicte-india.org | Regulation Bureau Officer | /aicte |
| rahul.kulkarni@aicte-india.org | Regional Officer (Western) | /aicte/region |
| sysadmin@aicte-india.org | AICTE Administrator | /aicte/admin |
| nodal@aranya-tech.edu.in | Institution Admin (nodal officer) | /inst |
| operator@aranya-tech.edu.in | Data Operator | /inst |
| 4471 2093 6618 (APAAR ID) | Student | /student |
| kabir.menon@tarangsoftware.in | Registered Verifier | /verify |

Rules (`src/auth/directory.ts`):
- AICTE roles only for `@aicte-india.org` accounts, and those accounts only get AICTE roles.
- Each portal route checks the role; opening another portal's URL sends you back to your own.
- Session is shared across tabs (localStorage), so the student and verifier windows stay connected.

## Institution portal
Sign in as `nodal@aranya-tech.edu.in` (or `operator@…`, who cannot submit).

| Page | Route |
|---|---|
| Dashboard | /inst |
| Upload & validate | /inst/upload (drop `public/Aranya_AY2026-27_FirstYear.xlsx`) |
| Seat ledger | /inst/ledger |
| Submit to AICTE | /inst/submit |

`npm test` checks: 509 rows → 481 clean / 18 need action / 10 auto-cleared; after the 12 suggested fixes → 507 records and 3 compliance alerts.

Per rule before fixes: R01 2, R02 4, R03 3, R04 1, R08 1, R09 1, R06 3, R07 2, R10 1 (need action); R03a 6, R04a 2, R05a 2 (auto-cleared).
- Data errors (R01–R04, R08, R09) are fixed by the institution; "Apply 12 suggested fixes" applies them all, or fix one row at a time from its detail panel.
- Compliance alerts (R05, R06, R07, R10) cannot be cleared by the institution and go to AICTE with the submission.
- "Download issues (.xlsx)" exports every flagged row.
- Seat ledger: approved intake vs admitted per programme, supernumerary buckets (FN/OCI/CIWG 15%, TFW 5% only when at least half the seats are filled, PM-USPY 2 per course), excess seats past the intake line.
- Submit: only the nodal officer can submit, after the declaration; the receipt shows a receipt number and a SHA-256 fingerprint of the data.

## AICTE portal
Sign in as `meena.iyer@aicte-india.org`.

| Page | Route | What it shows |
|---|---|---|
| National overview | /aicte | 13,204 institutions in scope, returns submitted, records received, APAAR-linked %, open alerts, cross-institution duplicates, state tile map, deadline |
| Compliance alerts | /aicte/alerts | Every alert with its rows; the college's live submission appears at the top. Review a case, then Refer to Regional Office or Close with no action (reason required) |
| Duplicate rings | /aicte/rings | 38 students enrolled at two institutions (23, 14 and 1 per pair), 9 probable duplicates, risk score 87/100 with its four reasons, masked list of the 38 records, watch-list |
| Reports | /aicte/reports | Report builder with preview; Export PDF (print to PDF), Export Excel, API |

The overview numbers include the college's submission once it is made: 9,845 → 9,846 returns and 1,409 → 1,412 open alerts.
Regional Officer accounts open a placeholder page.

## Audit trail
Sign in as `sysadmin@aicte-india.org` (AICTE Administrator) to open `/aicte/admin`.
- Every action is recorded on the server in order: sign-in (including failed attempts) and sign-out, uploads and fixes, submissions, case referrals and closures, consent requests, decisions and revocations, certificate checks, reports and exports, registrations, and demo resets.
- Each entry stores the SHA-256 of its own contents together with the previous entry's hash, so the entries form a chain. The browser cannot overwrite the log (the server refuses it).
- "Verify integrity" recomputes every hash in the browser. If anyone edits an event in `.data/state.json` and restarts the server, the check fails at that event and marks every later event as untrusted.
- Click an event to see its full hash and the previous event's hash.
- Filter by date, category, user or text, page through 25 events at a time, and export to Excel.
`npm run sample` regenerates the sample Excel file (deterministic).

## Student and verifier
| Account | Pages |
|---|---|
| Student `4471 2093 6618` | /student (record and degree QR), /student/requests (allow or refuse), /student/log |
| Verifier `kabir.menon@tarangsoftware.in` | /verify (camera, image or pasted code), /verify/requests |

Printable certificate: /certificate/GTU-2026-CSE-0417 (use "Altered copy" for the forged version with CGPA 9.42).
The QR holds a compact JWS signed with ES256 (ECDSA P-256). Only the public key is in the app.
`npm run credentials` creates a new university key and new QR codes; reprint certificates after running it.
Consent requests carry a purpose (pre-employment verification, appointment or promotion, admission, education loan or scholarship, professional registration), a reference number for that purpose (offer letter, application number), how long access lasts (7, 15 or 30 days) and how long the verifier keeps the data (30, 90 or 180 days).
The student allows with an OTP (consent number such as `CN-7731`), refuses, or revokes later. The verifier sees name, degree, year and award status only while consent is active; marks, category, address and date of birth are never shared. Every view is written to the student's access log.

## Hidden watermark (steganography)
"Download digital copy" on the certificate page saves a PNG with an invisible watermark in its pixels:
- a hidden message (certificate number and a fingerprint of the signed QR data), stored three times;
- a keyed check for every 16 × 16 pixel area, so any edit is located.
Upload the PNG in the verifier: "Hidden watermark intact". Edit any part of it (for example the CGPA in Paint) and upload again: "Edited after issue", with the changed area boxed in red, even though the QR still verifies.
Printed or photographed copies do not carry the watermark; for those the QR signature is the check.

## Open on a phone
Phone browsers only allow the camera on https. Run `npm run phone` and open the **Network** address it prints (https://<laptop-ip>:5173) on a phone on the same Wi-Fi. The browser warns about the certificate once: tap Advanced, then Proceed. Allow Camera when asked.

## Shared live data
The dev server (`npm run dev` or `npm run phone`) includes a small sync service. Every device and tab that opens the site (laptop, phone, localhost or the network address) shares the same live data: uploads and submissions, consent requests and decisions, and AICTE case decisions. Changes appear on other screens within a second, without reloading. Data is saved in `.data/state.json` on the laptop.
To start a clean take: login page, Demo accounts, Reset demo data (clears every device), or delete `.data/state.json`.
