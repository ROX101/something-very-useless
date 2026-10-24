# APAAR-Sathi (SIH 2026 · SIH26263)

Student data management and verification platform for AICTE-approved institutions.

## Run
```bash
npm install
npm test        # sign-in and role rules
npm run dev     # http://localhost:5173
```

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
`npm run sample` regenerates the sample Excel file (deterministic).

## Student and verifier
| Account | Pages |
|---|---|
| Student `4471 2093 6618` | /student (record and degree QR), /student/requests (allow or refuse), /student/log |
| Verifier `kabir.menon@tarangsoftware.in` | /verify (camera, image or pasted code), /verify/requests |

Printable certificate: /certificate/GTU-2026-CSE-0417 (use "Altered copy" for the forged version with CGPA 9.42).
The QR holds a compact JWS signed with ES256 (ECDSA P-256). Only the public key is in the app.
`npm run credentials` creates a new university key and new QR codes; reprint certificates after running it.
Consent is shared between browser tabs on the same computer, so open the student and verifier in two tabs of the same browser.

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
