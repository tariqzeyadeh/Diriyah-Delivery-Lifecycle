param location string
param namePrefix string
param environment string
param resourceToken string
param tags object

@secure()
param administratorPassword string

param administratorLogin string
param skuName string
param storageSizeGB int
param highAvailability bool
param delegatedSubnetId string
param privateDnsZoneId string

var serverName = take('${namePrefix}-${environment}-mysql-${resourceToken}', 63)

resource mysql 'Microsoft.DBforMySQL/flexibleServers@2023-12-30' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: 'GeneralPurpose'
  }
  properties: {
    version: '8.0.21'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    highAvailability: highAvailability
      ? {
          mode: 'ZoneRedundant'
        }
      : {
          mode: 'Disabled'
        }
    storage: {
      storageSizeGB: storageSizeGB
      autoGrow: 'Enabled'
      iops: 360
    }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: environment == 'prod' ? 'Enabled' : 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
  }
}

resource atlasDb 'Microsoft.DBforMySQL/flexibleServers/databases@2023-12-30' = {
  parent: mysql
  name: 'atlas_db'
  properties: {
    charset: 'utf8mb4'
    collation: 'utf8mb4_unicode_ci'
  }
}

// App login is created post-deploy via az mysql flexible-server execute / init script.
// Password is stored in Key Vault as part of DATABASE_URL.
output name string = mysql.name
output fqdn string = mysql.properties.fullyQualifiedDomainName
output databaseName string = atlasDb.name
