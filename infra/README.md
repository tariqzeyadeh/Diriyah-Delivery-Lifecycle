# Diriyah Azure Infrastructure (Bicep)

Enterprise landing zone for the Diriyah Strategic Governance Platform.

## Modules

| File | Responsibility |
| --- | --- |
| `main.bicep` | Orchestration + outputs |
| `modules/network.bicep` | VNet, subnets, private DNS |
| `modules/mysql.bicep` | MySQL Flexible Server (HA, VNet-only, backups) |
| `modules/acr.bicep` | Azure Container Registry |
| `modules/storage.bicep` | Private evidence blob vault |
| `modules/keyvault.bicep` | Secrets + private endpoint |
| `modules/identity.bicep` | User-assigned managed identity |
| `modules/rbac.bicep` | Key Vault / Storage / ACR role assignments |
| `modules/containerApps.bicep` | Container Apps Environment + app |

See the root [README — Cloud Deployment](../README.md#cloud-deployment) for `az deployment group create` commands and Entra role assignment steps.
