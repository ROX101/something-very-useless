# APAAR-Sathi (SIH 2026 · SIH26263)

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
npm test                        # rules engine, sign-in rules, crypto, watermark (17)
npm run test:api                # API against Postgres database apaar_sathi_test (25)
```

## Architecture
```
src/      React + Vite frontend
server/   Express API (TypeScript), bundled with esbuild
  db/       Drizzle schema, SQL migrations, demo seed
  routes/   auth · inst · aicte · student · verifier · public
  lib/      JWT session cookie, role guard, hash-chained audit log
```
- One service serves both `/api/*` and the built frontend, so there is one URL and no CORS.
- The rules engine (`src/inst/engine/rules.ts`) is shared: the browser runs it for instant preview, and the server runs it again on submit. The server's result is the official one.
- Sessions are an httpOnly, Secure, SameSite=Lax cookie holding an HS256 JWT. Roles and the `@aicte-india.org` domain rule are enforced on the server.
- Every write goes to `audit_log`, where each entry holds the SHA-256 of the previous one. `GET /api/aicte/audit/verify` re-checks the chain.
- Migrations run on every boot. Demo data loads on the first boot when the database is empty (`SEED_ON_BOOT`).

## Deploy on Railway
1. **New Project → Deploy from GitHub repo**, and pick this repository/branch. `railway.json` makes Railway build with the `Dockerfile` and health-check `/api/health`.
2. In the same project: **+ New → Database → PostgreSQL**.
3. Open the web service → **Variables** and add:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable; the private network needs no SSL) |
   | `JWT_SECRET` | a long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `NODE_ENV` | `production` |
4. **Settings → Networking → Generate Domain.** Railway sets `PORT` itself.
5. The first deploy migrates and seeds. Sign in with any demo account below.

To wipe and reseed later, run `npm run db:reset` with `DATABASE_URL` set to the Postgres **public** URL and `DATABASE_SSL=true`.

| API | Purpose |
|---|---|
| `POST /api/auth/login` · `/logout` · `GET /me` | Session |
| `GET /api/inst/state` · `POST /uploads` · `PUT /uploads/current/rows` · `GET /validation` · `POST /submissions` | Institution (submit: nodal officer only) |
| `GET /api/aicte/alerts` · `/cases` · `/live` · `/kpis` · `/rings` · `POST /alerts/:id/actions` | AICTE (regional officers see only their states) |
| `GET /api/aicte/audit` · `/audit/verify` | Audit log (bureau, IT cell) |
| `GET /api/student/requests` · `/log` · `/record` · `POST /requests/:id/decide` · `/revoke` | Student consent |
| `GET/POST /api/verifier/requests` · `GET /records/:apaar` | Verifier (records need active consent; every read is logged) |
| `GET /api/public/certificates/:certNo` · `GET /api/health` | Public |

## Sign-in
One login page. The account decides the role and the portal (no role picker).
Password for every demo account: `Demo@2026` (also listed under "Demo accounts" on the sign-in page).

| User ID | Role | Lands on |
|---|---|---|
| meena.iyer@aicte-india.org | Regulation Bureau Officer | /aicte |
| rahul.kulkarni@aicte-india.org | Regional Officer (Western) | /aicte/region |
| sysadmin@aicte-india.org | AICTE Administrator | /aicte/admin |
| nodal@aranya-tech.edu.in | Institution Admin (nodal officer) | /inst |
| operator@aranya-tech.edu.in | Data Operator | /inst |
| 4471 2093 6618 (APAAR ID) | Student | /student |
| kabir.menon@tarangsoftware.in | Registered Verifier | /verify |

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

`npm test` and `npm run test:api` check: 509 rows → 481 clean / 18 need action / 10 auto-cleared; after the 12 suggested fixes → 507 records and 3 compliance alerts. The server must produce the same result as the browser.
`npm run sample` regenerates the sample Excel file (deterministic).

## Student and verifier
| Account | Pages |
|---|---|
| Student `4471 2093 6618` | /student (record and degree QR), /student/requests (allow or refuse), /student/log |
| Verifier `kabir.menon@tarangsoftware.in` | /verify (camera, image or pasted code), /verify/requests |

Printable certificate: /certificate/GTU-2026-CSE-0417 (use "Altered copy" for the forged version with CGPA 9.42).
The QR holds a compact JWS signed with ES256 (ECDSA P-256). Only the public key is in the app.
`npm run credentials` creates a new university key and new QR codes; reprint certificates after running it.
Consent is stored on the server, so the student (phone) and the verifier (laptop) can be on different devices.

## Hidden watermark (steganography)
"Download digital copy" on the certificate page saves a PNG with an invisible watermark in its pixels:
- a hidden message (certificate number and a fingerprint of the signed QR data), stored three times;
- a keyed check for every 16 × 16 pixel area, so any edit is located.
Upload the PNG in the verifier: "Hidden watermark intact". Edit any part of it (for example the CGPA in Paint) and upload again: "Edited after issue", with the changed area boxed in red, even though the QR still verifies.
Printed or photographed copies do not carry the watermark; for those the QR signature is the check.

## Open on a phone
Phone browsers only allow the camera on https. Once deployed on Railway the site is already https, so just open its URL. Locally: run `npm run dev:api` in one terminal and `npm run phone` in another, then open the **Network** address it prints (https://<laptop-ip>:5173) on a phone on the same Wi-Fi. The browser warns about the certificate once: tap Advanced, then Proceed. Allow Camera when asked.
