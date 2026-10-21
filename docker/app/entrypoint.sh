#!/bin/sh
# Démarrage du conteneur app : schéma à jour, puis serveur Next.
set -e
if [ -n "$NEON_DATABASE_ADMIN_URL" ] && [ "${DB_MIGRATE_ON_START:-1}" = "1" ]; then
  node scripts/db-migrate.mjs
else
  echo "db-migrate : ignoré (NEON_DATABASE_ADMIN_URL absent ou DB_MIGRATE_ON_START=0)"
fi
exec node server.js
