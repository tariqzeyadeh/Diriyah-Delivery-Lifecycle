@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short name prefix (lowercase alphanumeric, 3-10 chars)')
@minLength(3)
@maxLength(10)
param namePrefix string = 'atlas'

@description('Environment name (dev | uat | prod)')
@allowed(['dev', 'uat', 'prod'])
param environment string = 'prod'

@secure()
@description('MySQL administrator password')
param mysqlAdminPassword string

@secure()
@description('Application database password for atlas_user')
param mysqlAppPassword string

@secure()
@description('NextAuth secret (32+ chars)')
param nextAuthSecret string

@secure()
@description('SAP integration API key')
param sapIntegrationApiKey string = ''

@secure()
@description('SAP integration bearer token')
param sapIntegrationToken string = ''

@description('Public HTTPS URL of the Diriyah app (NEXTAUTH_URL / NEXT_PUBLIC_APP_URL)')
param appPublicUrl string = ''

@description('MySQL Flexible Server SKU')
param mysqlSkuName string = 'Standard_D2ds_v4'

@description('MySQL storage size in GB')
param mysqlStorageSizeGB int = 64

@description('Enable zone-redundant high availability for MySQL')
param mysqlHighAvailability bool = true

@description('Container Apps CPU cores')
param containerCpu string = '1.0'

@description('Container Apps memory')
param containerMemory string = '2.0Gi'

@description('Container image (push to ACR before switching off the bootstrap image)')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Ingress target port (80 for bootstrap image, 3000 for Diriyah)')
param containerTargetPort int = 80

var resourceToken = uniqueString(resourceGroup().id, namePrefix, environment)
var tags = {
  application: 'Diriyah'
  environment: environment
  managedBy: 'bicep'
}

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    namePrefix: namePrefix
    environment: environment
    tags: tags
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    namePrefix: namePrefix
    environment: environment
    tags: tags
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  params: {
    location: location
    namePrefix: namePrefix
    environment: environment
    resourceToken: resourceToken
    tags: tags
  }
}

module mysql 'modules/mysql.bicep' = {
  name: 'mysql'
  params: {
    location: location
    namePrefix: namePrefix
    environment: environment
    resourceToken: resourceToken
    tags: tags
    administratorLogin: 'atlas_admin'
    administratorPassword: mysqlAdminPassword
    skuName: mysqlSkuName
    storageSizeGB: mysqlStorageSizeGB
    highAvailability: mysqlHighAvailability
    delegatedSubnetId: network.outputs.mysqlSubnetId
    privateDnsZoneId: network.outputs.mysqlPrivateDnsZoneId
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    namePrefix: namePrefix
    environment: environment
    resourceToken: resourceToken
    tags: tags
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    blobPrivateDnsZoneId: network.outputs.blobPrivateDnsZoneId
    vnetId: network.outputs.vnetId
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    namePrefix: namePrefix
    environment: environment
    resourceToken: resourceToken
    tags: tags
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    kvPrivateDnsZoneId: network.outputs.kvPrivateDnsZoneId
    databaseUrl: 'mysql://atlas_user:${mysqlAppPassword}@${mysql.outputs.fqdn}:3306/atlas_db?sslaccept=strict'
    nextAuthSecret: nextAuthSecret
    sapIntegrationApiKey: sapIntegrationApiKey
    sapIntegrationToken: sapIntegrationToken
    s3Bucket: storage.outputs.evidenceContainerName
    storageAccountName: storage.outputs.storageAccountName
  }
}

// RBAC before Container App so Key Vault refs + ACR pull succeed
module rbac 'modules/rbac.bicep' = {
  name: 'rbac'
  params: {
    keyVaultName: keyVault.outputs.name
    storageAccountName: storage.outputs.storageAccountName
    acrName: acr.outputs.name
    principalId: identity.outputs.principalId
  }
}

module containerApps 'modules/containerApps.bicep' = {
  name: 'containerApps'
  params: {
    location: location
    namePrefix: namePrefix
    environment: environment
    tags: tags
    infrastructureSubnetId: network.outputs.containerAppsSubnetId
    acrLoginServer: acr.outputs.loginServer
    acrName: acr.outputs.name
    containerImage: containerImage
    containerCpu: containerCpu
    containerMemory: containerMemory
    managedIdentityId: identity.outputs.id
    managedIdentityPrincipalId: identity.outputs.principalId
    keyVaultUri: keyVault.outputs.uri
    databaseUrlSecretUri: keyVault.outputs.databaseUrlSecretUri
    nextAuthSecretUri: keyVault.outputs.nextAuthSecretUri
    sapApiKeySecretUri: keyVault.outputs.sapApiKeySecretUri
    sapTokenSecretUri: keyVault.outputs.sapTokenSecretUri
    appPublicUrl: !empty(appPublicUrl) ? appPublicUrl : 'https://placeholder.azurecontainerapps.io'
    storageAccountName: storage.outputs.storageAccountName
    evidenceContainerName: storage.outputs.evidenceContainerName
    targetPort: containerTargetPort
  }
  dependsOn: [
    rbac
  ]
}

output vnetName string = network.outputs.vnetName
output mysqlFqdn string = mysql.outputs.fqdn
output acrLoginServer string = acr.outputs.loginServer
output acrName string = acr.outputs.name
output containerAppName string = containerApps.outputs.appName
output containerAppFqdn string = containerApps.outputs.fqdn
output resourceGroupName string = resourceGroup().name
output keyVaultName string = keyVault.outputs.name
output storageAccountName string = storage.outputs.storageAccountName
output evidenceContainerName string = storage.outputs.evidenceContainerName
output managedIdentityPrincipalId string = identity.outputs.principalId
output managedIdentityName string = identity.outputs.name
