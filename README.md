# Diriyah Strategic Governance Platform - POC

Enterprise proof-of-concept for **Diriyah Company** that enforces top-down portfolio traceability from Strategy through Demand, Budget, Procurement, and Project delivery — with gated approvals, Master Trace IDs, and executive visibility.

Diriyah replaces ad-hoc spreadsheet governance with a single spine (`MasterTrace`) so every investment remains auditable from strategic intent to awarded delivery.

---

## Architecture Stack

| Layer             | Technology                             |
| ----------------- | -------------------------------------- |
| Framework         | **Next.js 15+ / 16** (App Router) — POC ships `next@16.3` |
| UI                | **React 19** + **Tailwind CSS v4**     |
| ORM / Schema      | **Prisma ORM**                         |
| Database          | **MySQL 8.0**                          |
| Auth (demo)       | In-app persona switcher (RBAC for POC) |
| E2E               | Playwright                             |
| Runtime packaging | Docker Compose (app + MySQL)           |

> Note: The POC targets the Next.js App Router on the current LTS-aligned Next 16 line used in this repository.

---

## Prerequisites

- Node.js **20+**
- npm **10+**
- MySQL **8.0** (local install **or** Docker)
- Docker Desktop (optional, for containerized demo)

---

## Local Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` so `DATABASE_URL` points at your MySQL instance (see [Environment Variables](#environment-variables)).

### 3. Create schema & generate client

```bash
npx prisma generate
npx prisma db push
```

### 4. Seed demo data

```bash
npx prisma db seed
```

Seeded spines include Master Trace IDs such as `TECH-2027-0001` and `TECH-2027-0014` for Strategy → Demand → Budget → Procurement demos.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home cockpit is available at `/home`.

### Useful scripts

| Script                        | Purpose                       |
| ----------------------------- | ----------------------------- |
| `npm run dev`                 | Next.js development server    |
| `npm run build` / `npm start` | Production build & serve      |
| `npm run lint`                | ESLint (Next.js + TypeScript) |
| `npx prettier --check .`      | Formatting gate               |
| `npm run db:push`             | Push Prisma schema to MySQL   |
| `npm run db:seed`             | Load POC demo dataset         |
| `npm run test:e2e`            | Playwright acceptance tests   |

---

## Docker Instructions

For a reproducible client demonstration (app + MySQL):

### One-command demo

```bash
chmod +x demo-start.sh   # once, on macOS/Linux/WSL/Git Bash
./demo-start.sh
```

The script will:

1. Start the MySQL (`db`) service via Docker Compose
2. Wait 15 seconds for MySQL initialization
3. Run `npx prisma db push` and `npx prisma db seed` against `localhost:3306`
4. Build and start the Next.js (`app`) container

Then open [http://localhost:3000](http://localhost:3000).

### Manual Compose commands

```bash
docker compose up -d db
# wait for healthy MySQL, then:
export DATABASE_URL="mysql://atlas_user:atlas_secret@127.0.0.1:3306/atlas_db"
npx prisma db push && npx prisma db seed
docker compose up -d --build app
```

```bash
docker compose logs -f app
docker compose down          # stop
docker compose down -v       # stop and wipe MySQL volume
```

---

## Environment Variables

| Variable              | Required    | Purpose                                                                                                                                                        |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | Yes         | Prisma connection string. Host tools use `127.0.0.1`; the app container uses hostname `db`. Example: `mysql://atlas_user:atlas_secret@127.0.0.1:3306/atlas_db` |
| `NEXT_PUBLIC_APP_URL` | Recommended | Public base URL of the app (links, Playwright, future SSO). Example: `http://localhost:3000`                                                                   |
| `MYSQL_ROOT_PASSWORD` | Docker      | MySQL root password for the Compose `db` service                                                                                                               |
| `MYSQL_DATABASE`      | Docker      | Database name (default `atlas_db`)                                                                                                                             |
| `MYSQL_USER`          | Docker      | Application DB user (default `atlas_user`)                                                                                                                     |
| `MYSQL_PASSWORD`      | Docker      | Password for `MYSQL_USER`                                                                                                                                      |
| `MYSQL_PORT`          | Optional    | Host port mapped to MySQL (default `3306`)                                                                                                                     |
| `APP_PORT`            | Optional    | Host port mapped to the Next.js app (default `3000`)                                                                                                           |
| `PLAYWRIGHT_BASE_URL` | Optional    | Base URL for E2E tests (default `http://127.0.0.1:3000`)                                                                                                       |
| `NODE_ENV`            | Auto        | Set by Next.js / Compose (`development` / `production`)                                                                                                        |

See `.env.example` for a ready-to-copy template.

---

## CI/CD

GitHub Actions workflow: [`.github/workflows/main.yml`](.github/workflows/main.yml)

On every `push` and `pull_request` to `main`:

| Job      | What it does                                                                            |
| -------- | --------------------------------------------------------------------------------------- |
| `lint`   | `npm run lint` + `npx prettier --check .`                                               |
| `build`  | Node 20, `npm ci`, `prisma generate`, `prisma db push`, `npm run build` (MySQL service) |
| `test`   | Schema + seed against MySQL, then Playwright Chromium E2E                               |
| `deploy` | **main branch only** (after lint + test): OIDC → ACR build/push → Container App update  |

### GitHub configuration for Azure deploy

**Repository secrets (OIDC):**

| Secret                   | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `AZURE_CLIENT_ID`        | Entra app registration (federated credential)|
| `AZURE_TENANT_ID`        | Directory (tenant) ID                        |
| `AZURE_SUBSCRIPTION_ID`  | Target subscription                          |

**Repository variables:**

| Variable                 | Example                |
| ------------------------ | ---------------------- |
| `AZURE_RESOURCE_GROUP`   | `rg-atlas-prod`        |
| `AZURE_CONTAINER_APP`    | `atlas-prod-app`       |
| `AZURE_ACR_NAME`         | `atlasprodacrxxxxx`    |

Create the Entra app federation with subject `repo:<ORG>/<REPO>:ref:refs/heads/main` and grant the identity **AcrPush**, **Container Apps Contributor**, and **Reader** on the resource group.

---

## Cloud Deployment

Diriyah provisions to Azure via **Bicep** under [`infra/`](infra/).

### What gets created

| Resource                         | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| Virtual Network + private DNS    | Isolates MySQL, private endpoints, Container Apps                       |
| Azure Database for MySQL Flexible| Zone-redundant HA (prod), **VNet-only**, 14-day automated backups       |
| Azure Container Registry (Premium)| Stores the Next.js Docker image                                        |
| Azure Container Apps             | Hosts Diriyah; VNet-injected; pulls from ACR via managed identity         |
| Storage Account + `evidence-vault` | Private blob container for Attachment evidence (private endpoint)     |
| Key Vault                        | `DATABASE-URL`, `NEXTAUTH-SECRET`, SAP keys → mounted into the app      |
| User-assigned managed identity   | Key Vault Secrets User, Storage Blob Data Contributor, AcrPull          |

### 1. Prerequisites

```bash
az login
az account set --subscription "<SUBSCRIPTION_ID>"
az group create --name rg-atlas-prod --location westeurope
```

### 2. Deploy the Bicep template

```bash
# Generate strong secrets locally (do not commit)
MYSQL_ADMIN_PW="$(openssl rand -base64 24)"
MYSQL_APP_PW="$(openssl rand -base64 24)"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"

az deployment group create \
  --resource-group rg-atlas-prod \
  --template-file infra/main.bicep \
  --parameters infra/parameters.prod.bicepparam \
  --parameters \
    mysqlAdminPassword="$MYSQL_ADMIN_PW" \
    mysqlAppPassword="$MYSQL_APP_PW" \
    nextAuthSecret="$NEXTAUTH_SECRET" \
    sapIntegrationApiKey="<optional>" \
    sapIntegrationToken="<optional>"

# Capture outputs
az deployment group show \
  --resource-group rg-atlas-prod \
  --name main \
  --query properties.outputs -o json
```

> First deploy uses the Microsoft quickstart image (port 80). The GitHub `deploy` job replaces it with the Diriyah image on port **3000**.

### 3. Initialize the MySQL application user

MySQL is **not** reachable from the public internet. Run from Cloud Shell with VNet access, a jump box, or a temporary VM in `snet-private-endpoints`:

```bash
# See also infra/scripts/init-mysql-app-user.sh
mysql -h "<mysqlFqdn>" -u atlas_admin -p --ssl-mode=REQUIRED <<'SQL'
CREATE DATABASE IF NOT EXISTS atlas_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'atlas_user'@'%' IDENTIFIED BY '<MYSQL_APP_PW>';
GRANT ALL PRIVILEGES ON atlas_db.* TO 'atlas_user'@'%';
FLUSH PRIVILEGES;
SQL
```

Then apply schema from a network path that can reach MySQL (VPN / jump host):

```bash
export DATABASE_URL="mysql://atlas_user:<MYSQL_APP_PW>@<mysqlFqdn>:3306/atlas_db?sslaccept=strict"
npx prisma db push
npx prisma db seed
```

### 4. Assign Entra ID roles to the managed identity

Bicep already assigns the core roles via [`infra/modules/rbac.bicep`](infra/modules/rbac.bicep). To verify or re-apply manually:

```bash
UAMI_OBJECT_ID=$(az identity show \
  --name atlas-prod-uami \
  --resource-group rg-atlas-prod \
  --query principalId -o tsv)

KV_ID=$(az keyvault show --name "<keyVaultName>" --query id -o tsv)
ST_ID=$(az storage account show --name "<storageAccountName>" --query id -o tsv)
ACR_ID=$(az acr show --name "<acrName>" --query id -o tsv)

# Key Vault Secrets User — read DATABASE_URL / NextAuth / SAP secrets
az role assignment create \
  --assignee-object-id "$UAMI_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$KV_ID"

# Storage Blob Data Contributor — evidence vault Attachment uploads
az role assignment create \
  --assignee-object-id "$UAMI_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" \
  --scope "$ST_ID"

# AcrPull — Container Apps pull of atlas:* images
az role assignment create \
  --assignee-object-id "$UAMI_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "AcrPull" \
  --scope "$ACR_ID"
```

After the first successful GitHub deploy, set `appPublicUrl` / Container App env `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to `https://<containerAppFqdn>` (and update Key Vault / Entra redirect URIs accordingly).

### 5. Optional — re-deploy Bicep with the real image

```bash
LOGIN_SERVER=$(az acr show -n "<acrName>" --query loginServer -o tsv)

az deployment group create \
  --resource-group rg-atlas-prod \
  --template-file infra/main.bicep \
  --parameters infra/parameters.prod.bicepparam \
  --parameters \
    mysqlAdminPassword="$MYSQL_ADMIN_PW" \
    mysqlAppPassword="$MYSQL_APP_PW" \
    nextAuthSecret="$NEXTAUTH_SECRET" \
    containerImage="$LOGIN_SERVER/atlas:latest" \
    containerTargetPort=3000 \
    appPublicUrl="https://<containerAppFqdn>"
```

---

## Repository Map (POC)

```
app/(atlas)/          # App Router pages (strategy, demand, budget, …)
components/atlas/     # Shell + domain workspaces
src/actions/          # Server actions (gates, portfolio initiation)
src/providers/        # Demo AuthProvider / personas
prisma/               # schema.prisma + seed.ts
lib/atlas/            # Nav, dashboard data, backgrounds
tests/e2e/            # Acceptance test skeletons (AT-001 / 002 / 010)
infra/                # Azure Bicep (VNet, MySQL, ACA, ACR, Storage, Key Vault)
Dockerfile            # Multi-stage standalone Next.js image
docker-compose.yml    # app + mysql:8.0
demo-start.sh         # Client demo spin-up
```

---

## Demo Personas (RBAC)

Use the header persona switcher:

| Persona                | Typical capability               |
| ---------------------- | -------------------------------- |
| Strategy & Governance  | Strategy draft / objectives      |
| Business Owner         | Demand case editing              |
| Commercial & Budgeting | Budget lines / submit path       |
| CTO                    | Strategy & budget gate decisions |
| PMO                    | PMO registration / activate      |

---

## Support & Handover Notes

- This is a **POC**: persistence and gate wiring continue to harden toward production.
- Do not commit real secrets; use `.env` locally and CI secrets / Key Vault in higher environments.
- Local demos: Docker Compose. Cloud: `infra/main.bicep` + GitHub Actions `deploy` job.

---

© Diriyah Company — Diriyah Strategic Governance Platform (POC)
