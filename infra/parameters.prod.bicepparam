using './main.bicep'

param location = 'westeurope'
param namePrefix = 'atlas'
param environment = 'prod'
param mysqlSkuName = 'Standard_D2ds_v4'
param mysqlStorageSizeGB = 64
param mysqlHighAvailability = true
param containerCpu = '1.0'
param containerMemory = '2.0Gi'
param containerTargetPort = 80
param containerImage = 'mcr.microsoft.com/k8se/quickstart:latest'
param appPublicUrl = ''

// Pass secure params on the CLI (do not commit secrets):
//   mysqlAdminPassword=... mysqlAppPassword=... nextAuthSecret=...
