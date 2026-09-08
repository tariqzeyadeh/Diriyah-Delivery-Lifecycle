#!/usr/bin/env bash
# Diriyah POC — one-command demo spin-up
# Starts MySQL, pushes schema + seed from the host, then starts the app container.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> Diriyah demo start"
echo "    Working directory: $ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "==> No .env found — copying .env.example"
  cp .env.example .env
fi

# Host-side Prisma must talk to published MySQL port (not the Docker DNS name `db`)
export DATABASE_URL="${HOST_DATABASE_URL:-mysql://atlas_user:atlas_secret@127.0.0.1:3306/atlas_db}"

echo "==> 1/4  Starting MySQL (db)…"
docker compose up -d db

echo "==> 2/4  Waiting 15 seconds for MySQL to initialize…"
sleep 15

echo "==> 3/4  Applying Prisma schema + seed (host → localhost:3306)…"
echo "    DATABASE_URL=$DATABASE_URL"
npx prisma db push
npx prisma db seed

echo "==> 4/4  Building & starting Next.js app…"
# App container uses compose DATABASE_URL pointing at service hostname `db`
docker compose up -d --build app

echo ""
echo "Diriyah is up."
echo "  App:   http://localhost:${APP_PORT:-3000}"
echo "  MySQL: localhost:${MYSQL_PORT:-3306}  (db=atlas_db user=atlas_user)"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f app"
echo "  docker compose down"
echo "  docker compose down -v   # also wipe MySQL volume"
