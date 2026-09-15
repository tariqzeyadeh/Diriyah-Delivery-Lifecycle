# Diriyah lifecycle — all steps from start to end

This is the operator walkthrough for **one new record**, from **+ New Record** to a registered project. Use it in demo mode (`AUTH_MODE=demo`) with the persona switcher in the header.

Language: switch **EN / AR** from the header. Sidebar labels below are the English ones.

Every child record on the same initiative shares one **Master Trace** ID (`TECH-YYYY-XXXX`). Do not invent a parallel spreadsheet number.

---

## Personas (switch before each gate)

| Persona | Who | When to use |
| --- | --- | --- |
| **Strategy & Governance** | Sarah Al Mansouri | Strategy drafting, architecture / data reviews |
| **Business Owner** | Ahmed Khalid | Demand / business case |
| **Commercial & Budgeting** | Rami Noor | Budget lines, consolidation, submit to G-B1 |
| **CTO Office** | Mohammed Al Nuaimi | **G-S1**, security review, **G-B1** |
| **PMO** | PMO Admin | Kanban to delivery, **G-PMO1**, project register |

If a gate shows **Awaiting … Approval**, you are on the wrong persona.

---

## Two entry routes

Choose this once, in the **+ New Record** modal.

| Route | What is created | What you skip |
| --- | --- | --- |
| **Strategic Initiative** | Master Trace + Strategy draft (`STR-…`) | Nothing. This is the normal path. |
| **Ad-Hoc Demand** | Master Trace + Demand draft (`DEM-…`) | Strategy workspace and **G-S1**. Ad-hoc justification (≥ 20 characters) is mandatory. |

Ad-hoc still goes through demand reviews (if flagged), validation, budget, G-B1, procurement, and PMO. Bypass is allowed; hiding the bypass from the audit trail is not.

The rest of this file is the **strategic** path. Ad-hoc joins at [Stage 4](#stage-4--demand-business-case).

---

## Stage 0 — Open the platform

1. Open the app (local: `http://localhost:3000`, then `/en/home` or `/ar/home`).
2. Sign in (demo: complete the demo login).
3. Land on **Home** (`/home`): open traces, pending approvals, approved budget SAR, stage health, gate SLA load.
4. Optional first-visit tour: dismiss it; it will not keep blocking you.

From Home you can open an existing row, click **+ New Record**, or use the sidebar.

---

## Stage 1 — Create a new record

1. Click **+ New Record** (Home or header).
2. Choose **Strategic Initiative** or **Ad-Hoc Demand**.
3. Click **Continue** (or Cancel / × / Escape / backdrop to close).

**Strategic:** the system creates `TECH-…` + `STR-…` (`DRAFT`) and opens `/strategy/{strategy_id}`.

**Ad-hoc:** the system creates `TECH-…` + `DEM-…` (`DRAFT`) and opens `/demand/{demand_id}?route=ADHOC`. Skip to Stage 4.

---

## Stage 2 — Write the strategy

**URL:** `/strategy` → `/strategy/{id}`  
**Persona:** Strategy & Governance

1. Open the new draft from the strategy list (newest first).
2. Fill the strategy header: title, type, executive summary, vision, mission, drivers, current / target state, in-scope / out-of-scope.
3. Set the **indicative funding envelope** (CAPEX / OPEX in SAR). This is a ceiling frame, not G-B1 approval.
4. Add **Strategic Objectives**. Each has a weight (%).
5. Under each objective, add **KPIs** (name, unit, target, weight inside that objective, data source, owner).
6. Save as you go.

**Blocks before submit**

- At least one objective (**BR-006**).
- Objective weights sum to **100%** (**BR-007**, 0.01 tolerance). The live total on screen must read 100%.
- If you set KPI weights inside an objective, those weights must also sum to 100%.

Demand and budget are **not** created yet.

---

## Stage 3 — Submit and approve G-S1

### 3.1 Submit (Strategy & Governance)

1. Click **Submit to G-S1** (or equivalent submit-to-CTO control).
2. Strategy locks (`is_locked`). Status becomes submitted / awaiting gate.
3. An `ApprovalTransaction` is opened for gate **G-S1**, pending **CTO Office**.
4. The row appears on `/gates/g-s1`.

### 3.2 Decide (CTO Office)

1. Switch persona to **CTO Office**.
2. Open **Gates → G-S1 Strategy Gate** (`/gates/g-s1`), or the strategy page if you already have CTO rights.
3. Choose one:

| Decision | What happens |
| --- | --- |
| **Approve** | Strategy `APPROVED` and locked. Receipt + version hash written. **Demand draft** and **Budget draft** are created on the same `TECH-…`. |
| **Approve with Conditions** | Same spawn of Demand + Budget. **Conditions text is mandatory** (**BR-012**). |
| **Return for revision** | Unlock for correction. **Comments mandatory**. Status `RETURNED`. Re-submit raises `version_number`. History is kept. |
| **Reject** | Record closed in place (**BR-011**). Not deleted. Do not reopen the same receipt as a new draft; start a new Master Trace if needed. |

After **Approve**, you have one spine with three children: approved Strategy + draft Demand + draft Budget. Demand and budget work **in parallel**.

---

## Stage 4 — Demand (business case)

**URL:** `/demand` → `/demand/{id}`  
**Persona:** Business Owner

Newest demands sit at the top of the list.

### 4.1 Strategic demand

1. Open the demand that was spawned after G-S1 (same Master Trace).
2. Complete **Strategic Alignment**: approved strategy + at least one objective (KPIs recommended) (**BR-005**).
3. Fill the case: title, urgency, business impact, current state, problem / opportunity, in-scope / out-of-scope, strategic contribution.
4. Enter indicative one-off / recurring / TCO costs (SAR).
5. Add **options** (including do-nothing) and expected **benefits**.
6. Add **RAIDC** (risks, assumptions, issues, dependencies, constraints).
7. Set impact flags if true:
   - Architecture impact → later **G-ARCH1**
   - Security / privacy impact → later **G-SEC1**
   - Data governance impact → later **G-DATA1**
8. Fill **Mandate Statement** / **Business Case** tab text (this is what the document-pack check looks for — there is no separate file-upload control for that pack item).
9. **Save**, then **Submit**.

### 4.2 Ad-hoc demand (if you skipped strategy)

1. Strategic alignment fields are hidden.
2. Write **Ad-Hoc Justification** (≥ 20 characters).
3. Complete the rest of the case as in 4.1 (except strategy mapping).
4. Save, then submit.

---

## Stage 5 — Conditional demand reviews (only if a flag is on)

**URL:** `/demand/reviews`  
**Rule:** BR-015

| Flag | Review | Gate | Demo persona |
| --- | --- | --- | --- |
| Architecture | Architecture | G-ARCH1 | Strategy & Governance |
| Security / privacy | Information Security | G-SEC1 | CTO Office |
| Data governance | Data Governance | G-DATA1 | Strategy & Governance |

1. Submit creates a pending approval for each raised flag.
2. The reviewer opens the queue, reads the case, and **Endorse / Approve**, **Approve with conditions**, or **Return** (critical comments stay open).
3. Demand is not “clean” for later funding until open reviews are closed.

If no flags were raised, skip this stage. That skip is recorded in the data.

---

## Stage 6 — Demand validation

**URL:** `/demand/validate`  
**Persona:** typically Strategy & Governance or Commercial & Budgeting (as configured)

1. Open the validation queue.
2. Check **completeness** (required fields: title, problem, scope, indicative cost, start date, …).
3. Check **duplicates** (title similarity vs other submitted / in-review / validated demands). If a candidate appears, merge or justify continuing — do not ignore it (**BR-020**).
4. Record the validation decision: accept, accept with conditions, or return.

Validated demand is what budget lines should hang off.

---

## Stage 7 — Budget lines and consolidation

**URL:** `/budget` → `/budget/{id}/lines` and `/budget/{id}/consolidation`  
**Persona:** Commercial & Budgeting

The budget draft already exists after G-S1 (strategic) or is created on the ad-hoc path when the demand is ready for funding.

### 7.1 Budget lines

1. Open the budget with the same Master Trace (newest at the top of `/budget`).
2. Add at least one line (**BR-022**): description, item type, **OPEX or CAPEX**, category, quantity, unit price, contingency amount or %, requested total SAR.
3. Watch the header cards: Total OPEX, Total CAPEX, contingency, estimated tax, grand total.
4. Requested total must be **> 0** (**BR-023**).
5. If the header shows **Funding Ceiling (SAR)** as `0`, an over-commit warning will not fire. If the ceiling is a real number and requested exceeds it, you get a **warning only** — it does not block submit.
6. Save lines.

### 7.2 Consolidation pack (required before G-B1)

1. From Budget Lines, click **Open Consolidation Pack** (do not hunt only in the ID chips).
2. On `/budget/{id}/consolidation`, fill **Narrative** (CON-018) — **at least 20 characters**.
3. Click **Save Governance**.
4. Confirm requested vs validated vs approved ceiling and the written funding recommendation (**BR-027**).

Without this narrative, G-B1 submit fails the consolidation-pack check (the pack is the on-screen Narrative, not a PDF upload).

### 7.3 Evidence / comments

- Upload gate documents to the evidence vault when the pack asks for files.
- **Validation findings** (comment type `VALIDATION_FINDING`) block G-B1 if they stay OPEN (**BR-027**).
- Ordinary evidence-chat comments do **not** count as blocking findings.
- Resolve remaining findings from the G-B1 workspace if the gate still lists them.

### 7.4 Submit to G-B1

1. Still as **Commercial & Budgeting**, submit the budget to the CTO gate.
2. Budget locks. Status waits for **G-B1**.
3. The row appears on `/gates/g-b1`.

---

## Stage 8 — Approve G-B1

**URL:** `/gates/g-b1`  
**Persona:** CTO Office (only this persona can approve)

1. Switch to **CTO Office**.
2. Open the submitted budget.
3. Confirm unresolved **validation findings** are cleared.
4. Decide:

| Decision | What happens |
| --- | --- |
| **Approve** | Budget `APPROVED` and locked. Hash receipt (**BR-008**). Consolidation snapshot. **Procurement plan + items** created at **PLANNED**, tied to approved lines and the same `TECH-…`. |
| **Approve with Conditions** | Same, with mandatory conditions text. |
| **Return** | Whole pack back to finance; comments mandatory; version number rises on re-submit. |
| **Return selected lines** (**BR-028**) | Only targeted lines go back; the rest stay in the pack. |
| **Reject** | Submission closed. No approved funding. No procurement from this receipt. |

After approval, figures are the legal governance version. Change them only via official Return, not by editing approved cells.

**Do not keep clicking Approve** on the budget gate or on the Kanban evidence panel. Once G-B1 is approved, Approve is hidden and a second Approve is rejected.

---

## Stage 9 — Procurement plan and Kanban

**URL:** `/procurement` → `/procurement/{budget_id}` (plan) and `/procurement/{budget_id}/board`  
**Persona:** PMO or Commercial (execution)

Newest procurement rows are at the top.

### 9.1 Plan header

1. Open **Procurement** and select the budget you just approved.
2. Confirm plan header: title, period, owner, launch authorization, approved funding available, planned value, item count.
3. Items must sit on **approved budget lines** and must not exceed the line ceiling (SAR).

### 9.2 Kanban board

Columns (move **exactly one column** forward or back, or to **Cancelled**):

1. Planned  
2. PR Prep  
3. PR Approval  
4. RFx  
5. Evaluation  
6. Award  
7. Commitment  
8. Delivery  
9. Acceptance  
10. Completed  
11. Cancelled (side path; not from Completed)

**Rules**

- Drag to the **next** column, wait until the board is no longer dimmed, then drag again. Skipping columns is **not saved** (BR-032). If you jump, the card stays where it was (or snaps back).
- Each valid drop writes a procurement status ledger row.
- Forecast / actual commitment must not exceed the approved item budget by more than 5% (**BR-030**).
- From Award / Commitment / Delivery / Acceptance / Completed you can record **Committed** SAR on the card.
- PMO handoff becomes ready at **Acceptance** or **Completed** (legacy **Delivered** also counts).
- The evidence block on this page is **G-B1**. If the budget is already approved, it shows **Already approved at this gate** — do not expect a second Approve.

After a valid move, you can leave the page and come back: the card stays in the saved column.

---

## Stage 10 — PMO registration (G-PMO1)

**URL:** `/pmo/{procurement_item_id}`, `/gates/g-pmo1`, `/projects`  
**Persona:** PMO

Queue shows delivered / accepted / completed items that **do not yet** have a `ProjectRegistration`.

1. Switch to **PMO**.
2. From the Kanban card, click **Open PMO handoff**, or open **Gates → G-PMO1**.
3. Confirm readiness (typical checks):
   - Demand validated (or validated with conditions).
   - Budget approved at G-B1.
   - Procurement at Acceptance or Completed.
   - Document pack complete.
4. Register the project: name, manager, delivery method, planned dates, approved project budget inherited from the item, KPI / objective links.
5. Submit **G-PMO1**. This creates `PRJ-YYYY-XXXX` on the **same** Master Trace.
6. Open **Projects** (`/projects`) and confirm the row.

You cannot register a project while the item is still Planned, in RFx, or only Awarded.

---

## Stage 11 — After registration (same spine, different lenses)

These are not a second workflow. They read the same Master Trace.

| Screen | URL | What you do |
| --- | --- | --- |
| **Projects** | `/projects` | Register list, status, budget |
| **Performance** | `/performance` | Actual vs target KPIs; RAG health (nightly rollup) |
| **Value realization** | `/value-realization` | Benefits promised on the demand vs delivery after `PRJ-…` |
| **Traceability** | `/traceability/{TECH-…}` | Strategy → objective → demand → budget line → procurement item → project |
| **Evidence** | `/traceability/{id}/evidence` | Attachments, comments, gate receipts |
| **Reports / one-pager** | `/reports`, `/reports/one-pager` | Executive pack; do not treat it as approved fact until at least one budget has passed G-B1 |
| **Home** | `/home` | Portfolio cockpit |

---

## Full strategic chain (short)

1. **Strategy & Governance** → Home → **+ New Record** → Strategic Initiative.  
2. Fill strategy; objective weights = 100%; add KPIs.  
3. **Submit to G-S1**.  
4. **CTO Office** → `/gates/g-s1` → **Approve**. Demand + Budget drafts appear.  
5. **Business Owner** → Demand: alignment, case, mandate/business case text, flags → Save → Submit.  
6. If flags: reviewers close `/demand/reviews`.  
7. Validation at `/demand/validate`.  
8. **Commercial & Budgeting** → Budget lines → **Open Consolidation Pack** → Narrative (≥ 20 chars) → **Save Governance** → Submit to **G-B1**.  
9. **CTO Office** → `/gates/g-b1` → **Approve** (once).  
10. **PMO** → Procurement board → move **one column at a time** to **Acceptance** or **Completed**.  
11. **PMO** → G-PMO1 → register `PRJ-…`.  
12. Confirm on **Projects**, **Traceability**, Home / one-pager.

**Ad-hoc** replaces steps 1–4 with: **+ New Record** → Ad-Hoc Demand → justification ≥ 20 characters → then continue from step 5.

---

## IDs you will see

| Prefix | Meaning |
| --- | --- |
| TECH- | Master Trace |
| STR- | Strategy |
| OBJ- | Objective |
| KPI- | KPI |
| DEM- | Demand |
| BUD- | Budget submission |
| BLN- | Budget line |
| CON- | Consolidation pack |
| PLN- | Procurement plan |
| PIT- | Procurement item |
| PRJ- | Registered project |
| APR- | Approval receipt |
| UPD- | Procurement status update |

---

## If something blocks you

| Symptom | What to do |
| --- | --- |
| Submit to G-S1 disabled | Objective weights not 100%, or no objectives. |
| Demand will not save (strategic) | Link approved strategy + at least one objective. |
| Demand will not save (ad-hoc) | Justification shorter than 20 characters. |
| Submit to G-B1 fails CON-018 | Open Consolidation Pack, write Narrative ≥ 20 characters, Save Governance. |
| G-B1: unresolved comments | Resolve **validation findings** only; evidence chat is not a blocker. |
| Over-commit warning | Informational if ceiling > 0 and requested > ceiling. Raise ceiling on Budget Lines while still editable, or ignore / Return first if already submitted. |
| Kanban card jumps back to Planned | You skipped columns, or the drop was not saved. Move **one** column, wait, then leave the page. |
| Approve does nothing / already approved | G-B1 is done. Do not click Approve again. |
| PMO handoff missing | Item is not yet Acceptance / Completed. |
| Wrong gate buttons | Switch persona (CTO for G-S1 / G-B1, PMO for G-PMO1). |
| Database unreachable banner | Aiven / MySQL is down. Wait and retry; Home should not crash. |

---

## What this platform is not

- Not SAP / the general ledger (it can later send approved figures; it is the **governance** source).
- Not day-to-day project delivery (Gantt / Scrum). It **ends at project registration**.
- Not a free-form workflow designer. The path above is fixed: states + gates + roles + business rules.

---

## Briefly put

1. **New Record** → Strategic Initiative (or Ad-Hoc Demand + justification).
2. Fill **strategy** (weights = 100%) → **G-S1 Approve** (CTO).
3. Fill **demand** → reviews if flagged → **validate**.
4. **Budget lines** → Consolidation **Narrative** → **G-B1 Approve** (CTO).
5. **Kanban** — one column at a time → Acceptance / Completed.
6. **G-PMO1** → register project.

Ad-hoc skips step 2.
