# Labour Hire Exposure Check — founder sign-off checklist

**Status: DRAFT — awaiting founder (admitted solicitor) sign-off.**
Nothing in the tool is presented to users as authoritative until this is signed;
the tool carries a visible "SIGN-OFF PREVIEW" banner and indicative language
throughout. Source of all values: [`src/lib/exposure/rules.config.ts`](../src/lib/exposure/rules.config.ts)
(facts + weights) and [`src/lib/exposure/questions.ts`](../src/lib/exposure/questions.ts)
(question wording). Licensing facts REUSE the already-verified
[`LICENCE_STATES`](../src/lib/seo/labour-hire-licence.ts).

How to sign off: tick each box (or edit the value in the config and re-tick),
then promote `EXPOSURE_RULESET_VERSION` in `questions.ts` from
`2026-06-28-draft.1` to a released channel (e.g. `2026-06-28-r.1`) and remove
the `preview` prop on `<ExposureCheck>` in the page. Every value below was
drafted and cross-checked against the cited source on 2026-06-28; confirm it is
current and correctly characterised.

---

## 1. Compliance facts (the claims the tool makes)

### Payday Super readiness
- [ ] **Commencement** — Payday Super commences **1 July 2026**; super paid each payday, not quarterly. — *Fair Work Ombudsman, "Payday Super: new rules starting 1 July 2026".*
- [ ] **7 business days** — contributions must be **received by the fund within 7 business days** of payday (QE day), not merely sent. — *ATO, Payday Super.*
- [ ] **New employee 20 days** — first contribution for a new employee due within **20 business days** of first pay. — *ATO, Payday Super.* *(Confirm the window + any exceptions.)*
- [ ] **Director liability** — late/unpaid super → **Super Guarantee Charge** (not deductible); **Director Penalty Notices** can make directors personally liable. — *ATO, super guarantee charge.* *(Confirm framing; confirm any penalty % before the tool ever quotes one — it currently does not.)*
- [ ] **SG rate 12%** — 12% of qualifying earnings from 1 July 2025 (final increase); QE base vs OTE. — *ATO.*
- [x] **SGC administrative uplift 60%** (CONFIRMED 2026-06-29) — uplift starts at 60% of the shortfall, reducible. — *ATO, the new super guarantee charge.*
- [x] **ATO year-1 "low risk"** (CONFIRMED 2026-06-29) — genuine-effort employers a low compliance focus in year one; verified hours = governance evidence. — *ATO, About Payday Super.*

### Labour hire licensing — reuses LICENCE_STATES (verified 2026-06-25)
- [ ] **Scheme states** — QLD, VIC, SA, ACT run mandatory schemes; **NSW, WA, TAS, NT do not.**
- [ ] **Cross-border** — obligation follows where workers are **supplied**, not where the business is based.
- [ ] **NSW safety** — an NSW-only operator is **never** flagged for licensing (enforced in `score.ts`, not just stated). *(Confirm this is the correct treatment.)*

### Records & evidence
- [ ] **7-year retention** — time-and-wages records kept **7 years**, legible, in English, not altered except to correct a genuine error. — *Fair Work Ombudsman, record-keeping.*
- [ ] **s 557C reverse onus** — if a required record is not kept, the employer carries the **burden of disproving** an underpayment claim. — *Fair Work Act s 557C.* *(Solicitor confirm the reverse-onus characterisation + scope.)*
- [x] **5 Sep 2025 FCA direction** (CONFIRMED 2026-06-29) — *FWO v Woolworths Group Ltd & Ors*: roster/clocking data not adequate under regs 3.33–3.34; framed as judicial direction in a retail annualised-salary context, not a labour-hire precedent.

### Wage-claim & Fair Work exposure
- [ ] **Record-keeping obligation** — accurate records of hours (where pay varies), pay, and super; failure attracts penalties and shifts the evidentiary position. *(Confirm; confirm penalty exposure before quoting figures — none quoted currently.)*

### Chain-of-responsibility
- [ ] **Supply-chain accountability** — accountability for entitlements **can extend beyond the direct employer** in a labour hire supply chain; defensible records contain it. *(Solicitor confirm how far this extends and that the wording does not overstate.)*

---

## 2. Question set (wording) — `questions.ts`

- [ ] Q1 states · [ ] Q2 worker band · [ ] Q3 how hours recorded today · [ ] Q4 would records survive a dispute · [ ] Q5 dispute history (12 mo) · [ ] Q6 hold a licence everywhere (scheme states only) · [ ] Q7 super payment cadence · [ ] Q8 aware of director liability · [ ] Q9 head contractors.
- [ ] Wording is plain, trade-literate, asks **current state** (not intentions), sentence case.

---

## 3. Scoring weights (DRAFT calibration) — `rules.config.ts` `WEIGHTS`

Higher = more exposure (0 = clean). Confirm or adjust.

| Question | Choice → points |
|---|---|
| records_method | nothing 10 · memory 10 · paper 8 · spreadsheet 6 · rostering 3 · biometric 1 |
| records_survive | no 10 · unsure 9 · yes 3 — **Option B applied (founder, 2026-06-29)** |
| dispute_history | recent 8 · once 4 · none 0 |
| licence_held | no 10 · unsure 7 · applying 4 · yes 0 |
| super_cadence | quarterly 10 · monthly 6 · each_run 0 · unsure 7 |
| director_aware | no 6 · somewhat 3 · yes 0 |
| head_contractors | multiple 6 · one 4 · no 0 |

- [ ] Weights approved (or edited).

## 4. Band thresholds (normalised 0–100) — `VECTORS[].bands`

| Vector | watch ≥ | exposed ≥ |
|---|---|---|
| payday_super | 30 | 65 |
| licensing | 40 | 70 |
| records | 25 | 55 |
| fair_work | 35 | 70 |
| chain | 50 | 80 |

- [ ] Thresholds approved (or edited).

---

## 5. Credential & disclaimer wording (no holding out)

- [ ] Byline reuses `AUTHOR` ("admitted solicitor (Supreme Court of NSW) · former PwC · Director, FLOSMOSIS") — framed as **background/credibility**, not a current legal-services offer.
- [ ] "Not legal advice" appears on the tool intro, in the result, the page footer (`DEFAULT_DISCLAIMER`), the emailed report, and the PDF.
- [ ] FAQ states FLOSMOSIS does **not** provide legal services and no solicitor–client relationship is formed.

---

## Sign-off

- Reviewed and approved by: ____________________  (Lauren Kate de Mestre, admitted solicitor)
- Date: ____________________
- Action on approval: bump `EXPOSURE_RULESET_VERSION` to released channel; remove `preview`; apply `migrations/20260628120000_exposure_check_tables_and_rls.sql`; set `HUBSPOT_ACCESS_TOKEN` / `APOLLO_API_KEY` / `EXPOSURE_FOUNDER_TO` as desired.
