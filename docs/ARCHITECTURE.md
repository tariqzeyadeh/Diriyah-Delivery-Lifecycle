# Diriyah Architecture Guide

Internal technical documentation for Diriyah IT maintainers of the Strategic Governance Platform (Next.js App Router + Prisma + MySQL).

---

## 1. System overview

| Layer         | Choice                                                 |
| ------------- | ------------------------------------------------------ |
| UI / routing  | Next.js App Router (`app/(atlas)/…`)                   |
| Mutations     | Server Actions (`src/actions/*`)                       |
| ORM           | Prisma (`prisma/schema.prisma`)                        |
| Database      | MySQL 8                                                |
| Auth (POC)    | Persona switcher; SSO scaffold via NextAuth + Entra ID |
| Evidence      | S3-compatible vault (`src/lib/storage.ts`)             |
| Observability | Pino audit logs + optional Sentry                      |

The product spine is the **Master Trace ID** (e.g. `TECH-2027-0001`). Every governed child record references it.

---

## 2. Prisma schema relationships (Master Trace cascade)

```
MasterTrace (master_trace_id, entry_route)
 ├── Strategy[]
 │     └── StrategicObjective[] → StrategicKpi[]
 ├── Demand[]
 │     ├── DemandOption[] / DemandBenefit[] / RaidcItem[]
 │     └── BudgetLine[] (via demand_id)
 ├── BudgetSubmission[]
 │     ├── BudgetLine[]
 │     ├── BudgetConsolidation? (1:1 snapshot at approval)
 │     └── ProcurementPlan[] → ProcurementItem[]
 ├── ProcurementItem[]
 │     ├── ProcurementStatusUpdate[]
 │     └── ProjectRegistration?
 ├── ApprovalTransaction[]
 ├── Attachment[]
 └── Comment[]
```

### Cascade rules (logical, not DB `ON DELETE CASCADE`)

- **Create:** `initiatePortfolioRecord` opens `MasterTrace` + first child (`Strategy` for `STRATEGIC`, `Demand` for `ADHOC`).
- **Strategy gate (`approveStrategyGate`):** Approves Strategy, then creates linked `Demand` + `BudgetSubmission` DRAFT rows on the **same** `master_trace_id`.
- **Budget gate (`approveBudgetGate`):** Approves submission, upserts `BudgetConsolidation`, appends `ApprovalTransaction` with `version_hash`.
- **Deletes:** Schema uses `onDelete: Restrict` — no hard deletes of spines; deactivate with `is_active` / lock flags.

### Shared fields (SHR)

Business entities include: `master_trace_id`, `entity_type`, `entry_route`, `record_status`, `version_number`, `created_by`, `is_locked`, etc. Governance tables (`ApprovalTransaction`, `Attachment`, `Comment`) are append-oriented.

---

## 3. Server Actions pattern (atomic gate approvals)

Server Actions live under `src/actions/` and are marked `'use server'`.

### Why `$transaction`?

Gate approvals must not leave half-written state (e.g. Strategy APPROVED without Demand/Budget children, or Budget APPROVED without consolidation + audit row).

```ts
// Pattern used in approveStrategyGate / approveBudgetGate
const result = await prisma.$transaction(async (tx) => {
  // 1. Load + validate invariants (ownership, status, BR-027, …)
  // 2. Update parent record (status, is_locked, …)
  // 3. Create child / ledger rows (Demand, BudgetSubmission, ApprovalTransaction, …)
  return { /* ids for caller */ }
})

revalidateTag('portfolio-metrics', 'max') // dashboard cache
auditLog({ action_type, master_trace_id, active_user_id, … })
```

### Conventions

1. **Validate early** — return `{ ok: false, error }` for business rule failures; throw inside the transaction only for unexpected invariant breaks (triggers rollback).
2. **Idempotency awareness** — reject “already APPROVED” to avoid duplicate children.
3. **Audit** — every success/failure path should call `auditLog` / `captureException` with `master_trace_id` + `active_user_id`.
4. **Cache** — mutating gates call `revalidateTag('portfolio-metrics' | 'strategy-rollup')` so `/home` and one-pager refresh.

Key files:

- `src/actions/portfolio-initiation.ts` — open spine
- `src/actions/gates.ts` — strategy/budget/procurement/PMO/evidence
- `src/actions/uat-feedback.ts` — pilot feedback

---

## 4. State machines

Prisma enums `StrategyStatus` and `DemandStatus` define the vocabulary. Runtime storage often uses `record_status` (`String`) aligned to these values.

### StrategyStatus — valid transitions

| From                  | To                    | Trigger                                                  |
| --------------------- | --------------------- | -------------------------------------------------------- |
| _(new)_               | `DRAFT`               | `initiatePortfolioRecord` / migration                    |
| `DRAFT`               | `SUBMITTED`           | Business submit to CTO (G-S1)                            |
| `SUBMITTED`           | `APPROVED`            | CTO `approveStrategyGate` / gate Approve                 |
| `SUBMITTED`           | `RETURNED`            | CTO Return for Revision                                  |
| `RETURNED`            | `DRAFT` / `SUBMITTED` | Owner revises and resubmits                              |
| `SUBMITTED` / `DRAFT` | `REJECTED`            | CTO reject (terminal for that version)                   |
| `APPROVED`            | —                     | **Locked**; new work continues on Demand/Budget children |

```
DRAFT → SUBMITTED → APPROVED
              ↘ RETURNED → DRAFT/SUBMITTED
              ↘ REJECTED
```

### DemandStatus — valid transitions

| From                        | To                                        | Notes                              |
| --------------------------- | ----------------------------------------- | ---------------------------------- |
| _(new)_                     | `DRAFT`                                   | Strategic or Ad-Hoc create         |
| `DRAFT`                     | `SUBMITTED`                               | Owner submits case                 |
| `SUBMITTED`                 | `UNDER_VALIDATION`                        | Commercial / architecture review   |
| `UNDER_VALIDATION`          | `VALIDATED` / `CONDITIONAL` / `RETURNED`  | Validation outcomes                |
| `VALIDATED` / `CONDITIONAL` | `INCLUDED`                                | Pulled into budget cycle           |
| `INCLUDED`                  | `FUNDED`                                  | Budget approved covering demand    |
| `*`                         | `DEFERRED` / `NOT_FUNDABLE` / `CANCELLED` | Portfolio decisions (terminal-ish) |
| `RETURNED`                  | `DRAFT` / `SUBMITTED`                     | Rework loop                        |

```
DRAFT → SUBMITTED → UNDER_VALIDATION → VALIDATED → INCLUDED → FUNDED
                         ↘ CONDITIONAL ↗
                         ↘ RETURNED → DRAFT/SUBMITTED
              ↘ DEFERRED | NOT_FUNDABLE | CANCELLED
```

**BR-005:** `entry_route = STRATEGIC` requires strategy/objective mapping; `ADHOC` hides alignment and requires justification.

**BR-008:** Budget `APPROVED` writes `version_hash` and sets `is_locked`.

**BR-027:** Unresolved comments block budget approval.

---

## 5. Frontend structure

| Path                             | Role                                             |
| -------------------------------- | ------------------------------------------------ |
| `app/(atlas)/`                   | Route group + Diriyah shell                      |
| `components/atlas/`              | Layout, workspaces, dashboards, Help, GuidedTour |
| `src/providers/AuthProvider.tsx` | Demo personas / RBAC helpers                     |
| `lib/atlas/dashboard-data.ts`    | Cached cockpit / one-pager aggregates            |
| `/help`                          | End-user knowledge base                          |
| Floating UAT widget              | Pilot feedback → `UatFeedback`                   |

### Onboarding

`GuidedTour` (react-joyride) runs on `/home` while `localStorage.atlas_has_completed_onboarding !== "true"`. Clear that key to replay the tour.

---

## 6. Ops cheat-sheet

```bash
npm run dev
npx prisma db push
npx prisma db seed
npm run db:migrate-legacy   # CSV → MasterTrace/Demand/Budget
npm run lint && npm run format:check
npm run test:e2e
```

Cloud: see root `README.md` → **Cloud Deployment** (`infra/main.bicep`).

---

© Diriyah Company — internal architecture notes
