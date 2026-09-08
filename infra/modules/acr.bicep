param location string
param namePrefix string
param environment string
param resourceToken string
param tags object

// ACR names must be alphanumeric only
var acrName = take(replace('${namePrefix}${environment}acr${resourceToken}', '-', ''), 50)

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Premium'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    dataEndpointEnabled: false
    networkRuleBypassOptions: 'AzureServices'
  }
}

output name string = acr.name
output loginServer string = acr.properties.loginServer
output id string = acr.id
