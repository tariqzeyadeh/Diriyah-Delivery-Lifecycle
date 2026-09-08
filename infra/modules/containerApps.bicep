param location string
param namePrefix string
param environment string
param tags object
param infrastructureSubnetId string
param acrLoginServer string
param acrName string
param containerImage string
param containerCpu string
param containerMemory string
param managedIdentityId string
param managedIdentityPrincipalId string
param keyVaultUri string
param databaseUrlSecretUri string
param nextAuthSecretUri string
param sapApiKeySecretUri string
param sapTokenSecretUri string
param appPublicUrl string
param storageAccountName string
param evidenceContainerName string
param targetPort int = 3000

var envName = '${namePrefix}-${environment}-cae'
var appName = '${namePrefix}-${environment}-app'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${namePrefix}-${environment}-law'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource cae 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
      registries: startsWith(containerImage, acrLoginServer)
        ? [
            {
              server: acrLoginServer
              identity: managedIdentityId
            }
          ]
        : []
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: databaseUrlSecretUri
          identity: managedIdentityId
        }
        {
          name: 'nextauth-secret'
          keyVaultUrl: nextAuthSecretUri
          identity: managedIdentityId
        }
        {
          name: 'sap-api-key'
          keyVaultUrl: sapApiKeySecretUri
          identity: managedIdentityId
        }
        {
          name: 'sap-token'
          keyVaultUrl: sapTokenSecretUri
          identity: managedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'atlas'
          image: containerImage
          resources: {
            cpu: json(containerCpu)
            memory: containerMemory
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'HOSTNAME', value: '0.0.0.0' }
            { name: 'AUTH_MODE', value: 'sso' }
            { name: 'NEXTAUTH_URL', value: appPublicUrl }
            { name: 'NEXT_PUBLIC_APP_URL', value: appPublicUrl }
            { name: 'AWS_REGION', value: 'westeurope' }
            { name: 'S3_BUCKET', value: evidenceContainerName }
            { name: 'AZURE_STORAGE_ACCOUNT', value: storageAccountName }
            { name: 'KEY_VAULT_URI', value: keyVaultUri }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret' }
            { name: 'SAP_INTEGRATION_API_KEY', secretRef: 'sap-api-key' }
            { name: 'SAP_INTEGRATION_TOKEN', secretRef: 'sap-token' }
          ]
        }
      ]
      scale: {
        minReplicas: environment == 'prod' ? 2 : 1
        maxReplicas: 10
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    acr
  ]
}

output appName string = containerApp.name
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output managedIdentityPrincipalId string = managedIdentityPrincipalId
output environmentId string = cae.id
