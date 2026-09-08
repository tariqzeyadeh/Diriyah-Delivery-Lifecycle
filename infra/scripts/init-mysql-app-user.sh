#!/usr/bin/env bash
# Create atlas_user on Azure MySQL Flexible Server (run from a jump box / Cloud Shell with VNet access)
# Usage: ./infra/scripts/init-mysql-app-user.sh <mysql-fqdn> <admin-user> <admin-password> <app-password>
set -euo pipefail

FQDN="${1:?mysql fqdn}"
ADMIN_USER="${2:?admin user}"
ADMIN_PASS="${3:?admin password}"
APP_PASS="${4:?app password}"

mysql -h "$FQDN" -u "$ADMIN_USER" -p"$ADMIN_PASS" --ssl-mode=REQUIRED <<SQL
CREATE DATABASE IF NOT EXISTS atlas_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'atlas_user'@'%' IDENTIFIED BY '${APP_PASS}';
GRANT ALL PRIVILEGES ON atlas_db.* TO 'atlas_user'@'%';
FLUSH PRIVILEGES;
SQL

echo "atlas_user ready on ${FQDN}"
