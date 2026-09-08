# Diriyah Day-1 Go-Live Playbook

**Platform:** Diriyah Strategic Governance  
**Audience:** Release Manager, Azure Platform Ops, PMO Data Steward  
**Go-Live window:** Coordinate with Change Advisory Board (CAB) — recommended maintenance window with PMO freeze on Excel edits  

---

## 0. Preconditions (T−24h)

| # | Check | Owner | Status |
| --- | --- | --- | --- |
| 1 | CAB / change ticket approved; rollback window agreed | Release Manager | ☐ |
| 2 | Production Bicep stack deployed (`infra/`); Key Vault secrets present | Azure Ops | ☐ |
| 3 | GitHub Actions secrets/vars set (`AZURE_*`); OIDC federation on `main` | DevOps | ☐ |
| 4 | Entra ID app redirect URIs point to prod FQDN; `AUTH_MODE=sso` in Container App | IAM | ☐ |
| 5 | Final approved legacy CSV/Excel export frozen and checksummed by PMO | PMO | ☐ |
| 6 | k6 soak against staging passed (500 VUs, p95 &lt; 800 ms, 0% errors) | SRE | ☐ |
| 7 | UAT sign-off recorded; no Sev-1/2 defects open | PMO / QA | ☐ |

**Do not** run `prisma db seed` against production. Seed IDs (`TECH-2027-*`, `DEM-2027-*`, `BUD-2027-*`) are POC-only.

---

## 1. Zero-Hour Deployment

### 1.1 Final pipeline cut

1. Confirm release tag / commit SHA on `main` (merge freeze after this SHA).
2. Trigger production deploy via push to `main` (workflow: `.github/workflows/main.yml` → job `deploy`):
   - Lint → Build → Playwright (CI MySQL) → Azure OIDC login  
   - `az acr build` → image tag = short SHA + `latest`  
   - `az containerapp update` with new image  
3. Monitor Actions until **Deploy to Azure** is green. Record:
   - Image: `<acr>.azurecr.io/atlas:<sha>`
   - Container App revision name
   - Deploy UTC timestamp

Manual fallback (if Actions unavailable):

```bash
az login
az acr login -n "$AZURE_ACR_NAME"
az acr build --registry "$AZURE_ACR_NAME" --image "atlas:golive" --file Dockerfile .
LOGIN_SERVER=$(az acr show -n "$AZURE_ACR_NAME" --query loginServer -o tsv)
az containerapp update \
  --name "$AZURE_CONTAINER_APP" \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --image "$LOGIN_SERVER/atlas:golive"
```

### 1.2 Application readiness

```bash
# Replace with production HTTPS base URL
export PROD_URL="https://<container-app-fqdn>"

curl -fsS "$PROD_URL/api/health"
# Expect HTTP 200: {"status":"healthy","database":"connected",...}
```

Confirm Container Apps probes (if configured) target `/api/health`.

### 1.3 Verify production database is pristine (no POC seed)

Connect via jump host / private endpoint to MySQL Flexible Server (public access is disabled).

```bash
# Example — prefer Azure Cloud Shell + private networking / bastion
mysql -h <mysql-fqdn> -u atlas_app -p atlas_db -e "
  SELECT COUNT(*) AS seed_masters
  FROM master_trace
  WHERE master_trace_id IN ('TECH-2027-0001','TECH-2027-0014')
     OR created_by = 'seed.atlas';
"
```

**Pass criteria:** `seed_masters = 0` (and no `DEM-2027-0001` / `BUD-2027-0001` rows).

If seed data is present (misconfigured pipeline):

```bash
# STOP — do not hydrate until purged. Escalate to DBA.
# Prefer point-in-time restore to pre-seed timestamp (see RUNBOOK.md)
# rather than ad-hoc DELETE in production without CAB approval.
```

### 1.4 Schema only (no seed)

From a secured runner with `DATABASE_URL` from Key Vault:

```bash
export DATABASE_URL="$(az keyvault secret show --vault-name <kv-name> --name DATABASE-URL --query value -o tsv)"
npx prisma generate
npx prisma db push
# Explicitly DO NOT run: npx prisma db seed
```

---

## 2. Data Hydration (Legacy → Production)

PMO delivers the final approved export as CSV compatible with `scripts/migrate-legacy-data.ts` (see `scripts/fixtures/legacy_demands.csv` for column contract).

### 2.1 Pre-hydration

1. Copy final file to a secured path, e.g. `./golive/legacy_demands_FINAL.csv`.
2. Record SHA-256:

```bash
# Linux / macOS / Git Bash
sha256sum golive/legacy_demands_FINAL.csv
# Windows PowerShell
Get-FileHash golive/legacy_demands_FINAL.csv -Algorithm SHA256
```

3. Dry-run validation against a **staging** clone first (recommended). On failure the script rolls back and writes `migration-errors.json`.

### 2.2 Production hydration command sequence

```bash
# 1) Authenticate and obtain production DATABASE_URL (Key Vault)
az login
export DATABASE_URL="$(az keyvault secret show --vault-name <kv-name> --name DATABASE-URL --query value -o tsv)"

# 2) Confirm pristine DB (section 1.3) and healthy app
curl -fsS "$PROD_URL/api/health"

# 3) Run migration (transactional; errors → migration-errors.json)
npm run db:migrate-legacy -- golive/legacy_demands_FINAL.csv
# Equivalent:
# npx ts-node --compiler-options '{"module":"CommonJS"}' \
#   scripts/migrate-legacy-data.ts golive/legacy_demands_FINAL.csv

# 4) Verify counts
# Expect MasterTrace / Demand rows matching approved sheet row counts
```

### 2.3 Post-hydration checks

| Check | Command / action |
| --- | --- |
| Error file absent or empty | Confirm no blocking `migration-errors.json` |
| Sample Master Trace | Open `/en/traceability/<id>` for a known production ID |
| Cockpit KPIs non-zero | `/en/home` — Open Master Records & budget figures |
| Cache | Soft-refresh; portfolio metrics revalidate ~300s (`unstable_cache`) |

**Rollback:** If hydration corrupts business data, execute MySQL Flexible Server PITR per `docs/RUNBOOK.md` § Database Restores — do not re-seed.

---

## 3. Sanity Testing — Release Manager 5-Point Checklist

Execute immediately after hydration, before declaring “Users may enter.”

| # | Test | Pass criteria | ☐ |
| --- | --- | --- | --- |
| 1 | **Entra ID SSO login** | Navigate to prod URL with `AUTH_MODE=sso`. Sign in via Diriyah tenant. Land on localized home (`/en/home` or `/ar/home`). Session shows mapped enterprise role (not demo persona). | ☐ |
| 2 | **SAP integration health** | `curl -H "X-API-Key: $SAP_INTEGRATION_API_KEY" "$PROD_URL/api/integration/sap?masterTraceId=<prod-id>"` returns 200 JSON (or intentional 404 for unknown ID — **not** 401/503). Confirm Key Vault secrets `SAP-INTEGRATION-*` mounted. | ☐ |
| 3 | **App + DB health probe** | `GET /api/health` → `{"status":"healthy","database":"connected"}`. Container Apps probe green. | ☐ |
| 4 | **Submit a test demand & CTO approval route** | As Business Owner: create/open a Demand, submit for gate. Switch / use CTO Office Entra group user: Demand appears in pending approval path; Approve/Return actions available on gate UI. ApprovalTransaction row written (`decision` PENDING → APPROVED/RETURNED). | ☐ |
| 5 | **Executive one-pager & budget lines** | Open `/en/reports/one-pager` — matrix rows & scorecard populated (not SAR 0.00 for known funded lines). Open a Budget Lines workspace for a hydrated submission; Gross/Total display correctly; RTL `/ar/...` layout mirrors. | ☐ |

Optional soak sample (not blocking if staging k6 already signed):

```bash
k6 run -e BASE_URL="$PROD_URL" -e LOAD_TEST_TOKEN="$LOAD_TEST_TOKEN" load-testing/dashboards.js
```

---

## 4. Declare Go-Live

1. Release Manager signs the 5-point checklist and attaches evidence (screenshots + curl outputs) to the change ticket.
2. Send **Project Closure & Handover** email (`docs/EXECUTIVE_HANDOVER_EMAIL.md`) to CTO and PMO Director.
3. Open production support channel; hand primary pager to Diriyah IT Ops per `docs/RUNBOOK.md`.
4. Lift Excel freeze only after PMO confirms Diriyah is system of record for new demands.

---

## 5. Abort / Rollback Triggers

| Trigger | Action |
| --- | --- |
| `/api/health` 503 &gt; 5 minutes | Rollback Container App to previous revision; page P1 |
| Seed / corrupt data detected post-deploy | Halt hydration; PITR MySQL; re-run Zero-Hour from clean backup |
| SSO outage (Entra) | Keep `AUTH_MODE=sso` — do not flip to demo in prod; escalate IAM |
| SAP 401 after secret rotate | Restore Key Vault secret version; restart Container App revision |

Previous Container App revision:

```bash
az containerapp revision list -n "$AZURE_CONTAINER_APP" -g "$AZURE_RESOURCE_GROUP" -o table
az containerapp ingress traffic set \
  -n "$AZURE_CONTAINER_APP" -g "$AZURE_RESOURCE_GROUP" \
  --revision-weight <previous-revision>=100
```

---

## Contacts

| Role | Responsibility |
| --- | --- |
| Release Manager | Playbook execution, checklist sign-off |
| Azure Platform Ops | ACR, Container Apps, Key Vault, MySQL |
| PMO Data Steward | Legacy file, checksums, business validation |
| IAM / Entra | Group membership → Diriyah role mapping |
| SRE / Helpdesk | Post go-live: follow `docs/RUNBOOK.md` |
