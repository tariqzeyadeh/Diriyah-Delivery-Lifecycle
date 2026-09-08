# Diriyah SRE Incident Response Runbook

**Audience:** Diriyah IT Helpdesk (L1), Application Support (L2), DBA / Azure Ops (L3)  
**Platform:** Diriyah Strategic Governance — Next.js on Azure Container Apps + MySQL Flexible Server  
**Related:** `docs/GO_LIVE_PLAYBOOK.md`, `docs/ARCHITECTURE.md`

---

## Severity guide

| Sev | Example | Response |
| --- | --- | --- |
| P1 | Total outage, DB down, SSO broken for all users | Page on-call Azure Ops + App Support immediately |
| P2 | Approval queue wrong for a role / budget SAR 0.00 org-wide | L2 within 30 min; involve SRE for OTel |
| P3 | Single user / single Master Trace issue | L1 triage → L2 if role/data confirmed |

**Always capture before changing data:** user UPN, UTC time, Master Trace / Demand / Budget IDs, browser + locale (`en`/`ar`), screenshot.

---

## Quick health checks (all incidents)

```bash
export PROD_URL="https://<atlas-prod-fqdn>"

# App + database
curl -fsS "$PROD_URL/api/health"
# Pass: HTTP 200, "status":"healthy", "database":"connected"

# Container App status
az containerapp show -n "$AZURE_CONTAINER_APP" -g "$AZURE_RESOURCE_GROUP" \
  --query "{fqdn:properties.configuration.ingress.fqdn,running:properties.runningStatus}" -o json
```

If `/api/health` returns **503** → skip to [Database / app down](#database--app-down-p1) before user-facing symptom work.

---

## Symptom 1 — “User cannot see their Demand in the approval queue”

### Likely causes

1. Entra ID group membership does not map to the Diriyah role required by the gate (e.g. CTO Office).
2. `AUTH_MODE` still `demo` (persona switcher) in a non-prod mix-up — production must be `sso`.
3. Demand not actually submitted / `ApprovalTransaction.decision` not `PENDING`.
4. User looking at wrong locale path or cached session after group change.

### L1 — Verify session & identity

1. Confirm user signs in via **Microsoft Entra ID** (not the demo persona menu).
2. Ask user to sign out, clear site cookies for the Diriyah host, sign in again.
3. Confirm they open the Demand detail / gate page for the correct `demand_id` and Master Trace.
4. Escalate to L2 with UPN + Demand ID if still missing.

### L2 — Check NextAuth role mapping vs Entra groups

Diriyah maps Entra **group claims** → enterprise roles in `src/lib/auth/extract-enterprise-role.ts`.

Default map (override with Key Vault / env `AZURE_AD_GROUP_ROLE_MAP` JSON):

| Entra group (examples) | Diriyah role |
| --- | --- |
| `Tech-CTO-Group` / `Tech-CTO-Office` | CTO Office |
| `Tech-Business-Owner-Group` | Business Owner |
| `Tech-Commercial-Budget-Group` | Commercial & Budgeting |
| `Tech-Gov-Group` | Strategy & Governance |
| `Tech-PMO` | PMO |

**Resolution steps:**

1. In Azure Portal → Entra ID → user → **Groups**: confirm membership in the group that should unlock the gate (CTO approvals → CTO group).
2. Confirm the enterprise app emits **group claims** (App registration → Token configuration → groups claim). Prefer `sAMAccountName` / display names that match the map, or store Object IDs in `AZURE_AD_GROUP_ROLE_MAP`.
3. Inspect Container App env:
   - `AUTH_MODE=sso`
   - `AZURE_AD_CLIENT_ID` / `AZURE_AD_TENANT_ID` / secret present
   - `AZURE_AD_GROUP_ROLE_MAP` valid JSON if custom
4. Have user re-authenticate (token refresh required after group add — can take several minutes for Entra eventual consistency).
5. Data check (L2/L3 with DB access):

```sql
-- Pending approvals for this demand
SELECT approval_id, entity_type, entity_id, gate_code, approver_role,
       decision, approver_user_id, created_at
FROM approval_transaction
WHERE entity_id = '<DEMAND_ID>'
ORDER BY created_at DESC;

SELECT demand_id, record_status, approval_status, master_trace_id, submitted_at
FROM demand
WHERE demand_id = '<DEMAND_ID>';
```

6. If `decision` is not `PENDING`, explain lifecycle (already approved/returned). If role is wrong, fix Entra membership — **do not** manually edit JWT.

### Workaround

Temporary: assign user to correct Entra group; document in ticket. Never enable `AUTH_MODE=demo` in production.

---

## Symptom 2 — “Budget roll-up shows SAR 0.00”

### Likely causes

1. No approved budget lines / `approved_budget_sar` and submission totals are null (data), not a UI bug.
2. Portfolio metrics cache stale after hydration (up to ~300 seconds).
3. Aggregate query failure — inspect OpenTelemetry span `calculate-portfolio-health`.
4. SAP / MuleSoft sync timeout leaving ERP figures out of date (integration path).

### L1 — Quick validation

1. Hard refresh; try `/en/home` and `/en/reports/one-pager`.
2. Open the specific Budget submission Lines page — are line Gross/Total also zero?
3. Confirm the Master Trace / Budget ID the user expects exists (hydration complete).
4. Escalate to L2 with IDs + UTC time of observation.

### L2 — OpenTelemetry + SAP checks

**A. Trace the aggregate**

1. Open APM backend wired to `@vercel/otel` / OTLP (`OTEL_SERVICE_NAME=diriyah`).
2. Filter spans named:
   - `calculate-portfolio-health` (cockpit / executive one-pager)
   - `calculate-budget-consolidation` (budget lines API / gate consolidation)
3. Confirm span status **OK** and duration; note exceptions on child Prisma calls.
4. Hit the JSON surfaces (with load-test or ops token if rate-limited):

```bash
curl -fsS -H "Authorization: Bearer $LOAD_TEST_TOKEN" \
  "$PROD_URL/api/reports/one-pager" | head
curl -fsS -H "Authorization: Bearer $LOAD_TEST_TOKEN" \
  "$PROD_URL/api/budget/lines?id=<BUDGET_SUBMISSION_ID>"
```

If API returns non-zero `lineRollup` / scorecard but UI shows 0 → cache/UI; wait for revalidation or bounce revision.

**B. SAP integration timeout / auth**

```bash
# Should NOT hang > ~10s; 401 = bad secret; 200 = ERP read model OK
curl -sS -m 10 \
  -H "X-API-Key: $SAP_INTEGRATION_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$PROD_URL/api/integration/sap?budgetSubmissionId=<ID>"
```

| Result | Action |
| --- | --- |
| Timeout / 5xx | Check MuleSoft/SAP connectivity; Container App outbound; recent secret rotation |
| 401 | Restore Key Vault `SAP-INTEGRATION-API-KEY` / token; restart app revision |
| 200 with zeros | Data issue — verify Prisma `budget_line` / `procurement_item.approved_budget_sar` |

**C. SQL spot-check**

```sql
SELECT budget_submission_id, total_requested_sar, total_approved_sar,
       capex_total_sar, opex_total_sar, record_status
FROM budget_submission
WHERE budget_submission_id = '<BUD_ID>';

SELECT budget_line_id, requested_total_sar, approved_amount_sar, gross_amount
FROM budget_line
WHERE budget_submission_id = '<BUD_ID>';
```

### Resolution

- Data missing → PMO re-hydrate / correct source sheet (change ticket).  
- Span errors → App Support + SRE; check MySQL CPU/connections.  
- SAP timeout → Integration owner; Diriyah can still show MySQL figures independently.

---

## Database / app down (P1)

1. `curl /api/health` — if `database: disconnected`, MySQL Flexible Server or network path is down.
2. Azure Portal → MySQL Flexible Server → Metrics (connections, storage, CPU) + Service Health.
3. Confirm VNet / private DNS (server has **publicNetworkAccess: Disabled**).
4. Restart Container App revision only after DB is healthy:

```bash
az containerapp revision restart \
  -n "$AZURE_CONTAINER_APP" -g "$AZURE_RESOURCE_GROUP" \
  --revision <active-revision>
```

---

## Database restores (point-in-time recovery)

Use for **catastrophic corruption**, bad hydration, or accidental seed in production. Requires CAB approval. Geo-redundant backup is enabled for prod Flexible Server (14-day retention per `infra/modules/mysql.bicep`).

### Precautions

- Note exact **UTC restore timestamp** (before the bad write).
- PITR creates a **new** server — plan DNS / `DATABASE_URL` cutover and Container App secret update.
- Notify PMO: write freeze during restore.

### Azure CLI — restore Flexible Server to a point in time

```bash
# Variables — fill from Azure Portal / Bicep outputs
RG="<resource-group>"                 # e.g. rg-atlas-prod
SOURCE_SERVER="<mysql-server-name>"   # existing Flexible Server
RESTORED_SERVER="${SOURCE_SERVER}-pitr-$(date +%Y%m%d%H%M)"
LOCATION="<azure-region>"             # e.g. uaenorth
RESTORE_TIME="2026-09-06T10:15:00Z"   # UTC instant BEFORE corruption

# 1) Create restored server from PITR backup
az mysql flexible-server restore \
  --resource-group "$RG" \
  --name "$RESTORED_SERVER" \
  --source-server "$SOURCE_SERVER" \
  --restore-time "$RESTORE_TIME"

# 2) Wait until Ready
az mysql flexible-server show \
  --resource-group "$RG" \
  --name "$RESTORED_SERVER" \
  --query "{state:state,fqdn:fullyQualifiedDomainName}" -o json
```

### Cutover (L3 / Azure Ops)

1. Ensure restored server is integrated with the **same VNet / private DNS** pattern as production (may require additional networking steps if restore does not inherit private access — validate with Platform Networking).
2. Create/verify application login and `atlas_db` (see `infra/scripts/init-mysql-app-user.sh`).
3. Update Key Vault secret `DATABASE-URL` to the restored FQDN.
4. Restart / new revision of Container App so pods pick up the secret:

```bash
az containerapp update \
  -n "$AZURE_CONTAINER_APP" -g "$RG" \
  --set-env-vars "DATABASE_URL=secretref:database-url"
# Or bump a revision after Key Vault reference refresh
```

5. Verify:

```bash
curl -fsS "$PROD_URL/api/health"
# Spot-check Master Trace counts vs PMO expected inventory
```

6. Decommission the corrupted server only after **72h** validation (or per CAB), keeping it stopped for forensics if required:

```bash
az mysql flexible-server stop --resource-group "$RG" --name "$SOURCE_SERVER"
# Later: az mysql flexible-server delete ... (CAB only)
```

### Alternate: restore to existing server name (advanced)

Some orgs use restore + swap. Prefer the **new server + secret cutover** pattern above to avoid irreversible overwrite. Always snapshot / document FQDNs before delete.

---

## Other common tickets (quick ref)

| Symptom | First action |
| --- | --- |
| 429 Too Many Requests | Expected under POC IP limiter; ops/k6 must send `Authorization: Bearer $LOAD_TEST_TOKEN` |
| Offline PWA page | Client network; `/~offline` fallback — not a server incident |
| Arabic layout not flipping | Confirm URL has `/ar/` segment; LanguageSwitcher in header/hamburger |
| Cron failed | Check `CRON_SECRET` Bearer on `/api/cron/*`; Logic Apps schedule |

---

## Escalation matrix

| Level | Team | When |
| --- | --- | --- |
| L1 | IT Helpdesk | Password/SSO redirect, browser, how-to |
| L2 | App Support | Role mapping, approval data, SAR 0.00, SAP auth |
| L3 | Azure Ops / DBA / SRE | Health 503, PITR, networking, OTel backend, Container Apps |

**Evidence pack for L3:** UPN, UTC time, resource IDs, `/api/health` body, OTel trace ID, change ticket number.
