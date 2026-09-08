param location string
param namePrefix string
param environment string
param resourceToken string
param tags object
param privateEndpointSubnetId string
param kvPrivateDnsZoneId string

@secure()
param databaseUrl string

@secure()
param nextAuthSecret string

@secure()
param sapIntegrationApiKey string

@secure()
param sapIntegrationToken string

param s3Bucket string
param storageAccountName string

var kvName = take('${namePrefix}-${environment}-kv-${resourceToken}', 24)

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: environment == 'prod'
    publicNetworkAccess: 'Enabled' // CI / operators; PE used by workloads
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'DATABASE-URL'
  properties: {
    value: databaseUrl
    contentType: 'text/plain'
  }
}

resource secretNextAuth 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'NEXTAUTH-SECRET'
  properties: {
    value: nextAuthSecret
    contentType: 'text/plain'
  }
}

resource secretSapApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SAP-INTEGRATION-API-KEY'
  properties: {
    value: !empty(sapIntegrationApiKey) ? sapIntegrationApiKey : 'not-configured'
    contentType: 'text/plain'
  }
}

resource secretSapToken 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SAP-INTEGRATION-TOKEN'
  properties: {
    value: !empty(sapIntegrationToken) ? sapIntegrationToken : 'not-configured'
    contentType: 'text/plain'
  }
}

resource secretStorageAccount 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'S3-BUCKET'
  properties: {
    value: s3Bucket
  }
}

resource secretStorageName 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-STORAGE-ACCOUNT'
  properties: {
    value: storageAccountName
  }
}

resource kvPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${kvName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'kv-connection'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: ['vault']
        }
      }
    ]
  }
}

resource kvDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: kvPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'kv-config'
        properties: {
          privateDnsZoneId: kvPrivateDnsZoneId
        }
      }
    ]
  }
}

output name string = keyVault.name
output uri string = keyVault.properties.vaultUri
output id string = keyVault.id
output databaseUrlSecretUri string = '${keyVault.properties.vaultUri}secrets/DATABASE-URL'
output nextAuthSecretUri string = '${keyVault.properties.vaultUri}secrets/NEXTAUTH-SECRET'
output sapApiKeySecretUri string = '${keyVault.properties.vaultUri}secrets/SAP-INTEGRATION-API-KEY'
output sapTokenSecretUri string = '${keyVault.properties.vaultUri}secrets/SAP-INTEGRATION-TOKEN'
