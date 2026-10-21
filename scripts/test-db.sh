#!/usr/bin/env bash
# Tests d'invariants sur une base jetable identique à la production Neon.
#
# 1. Postgres éphémère (pgvector/pgvector:pg17).
# 2. `db/local/emulation-neon.sql` : ce que Neon fournit avant nous
#    (tables `neon_auth`, `auth.uid()` de pg_session_jwt, rôles de la Data API).
# 3. Installation : `scripts/db-migrate.mjs` applique `db/migrations/` dans un
#    modèle. Puis chaque migration est rejouée avec ON_ERROR_STOP=1 : preuve
#    d'idempotence.
# 4. Vitest (`tests/invariants/**`), une base neuve copiée du modèle par
#    fichier, ordre aléatoire.
# Le conteneur est toujours supprimé à la sortie (avec son volume anonyme).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${TEST_DB_PORT:-54329}"
CONTAINER="whatsapp-os-test-db-$$"
IMAGE="pgvector/pgvector:pg17"
TEMPLATE="inv_modele"

cleanup() { docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> démarrage de $IMAGE ($CONTAINER, port $PORT)"
docker run -d --rm --name "$CONTAINER" -p "127.0.0.1:${PORT}:5432" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -c "select 1" >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "FATAL : postgres pas prêt en 60 s" >&2; exit 1; }

docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "create database $TEMPLATE" >/dev/null
psql_modele() { docker exec -i "$CONTAINER" psql -U postgres -d "$TEMPLATE" -v ON_ERROR_STOP=1 -q -f - "$@"; }

echo "==> émulation Neon (neon_auth, auth.uid(), rôles)"
psql_modele < "$ROOT/db/local/emulation-neon.sql"
# Cas le plus strict : toute fonction créée dans public naît exécutable par
# anon. Une migration qui oublie `revoke … from public, anon` est alors prise
# par tests/invariants/hardening-definer-varredura.test.ts.
psql_modele <<'SQL'
alter default privileges for role postgres in schema public grant all on functions to anon;
alter default privileges for role postgres in schema public grant all on functions to authenticated;
alter default privileges for role postgres in schema public grant all on functions to service_role;
SQL

echo "==> installation : db-migrate"
node "$ROOT/scripts/db-migrate.mjs" "postgresql://postgres:postgres@127.0.0.1:${PORT}/${TEMPLATE}"

echo "==> idempotence : chaque migration rejouée avec ON_ERROR_STOP=1"
for f in "$ROOT"/db/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  psql_modele < "$f"
done
echo "    ✓ aucune erreur à la réapplication"

docker exec -i "$CONTAINER" psql -U postgres -d template1 -q -v ON_ERROR_STOP=1 -f - <<SQL
drop database if exists postgres with (force);
create database postgres template $TEMPLATE;
SQL

echo "==> invariants (vitest, base neuve par fichier, ordre aléatoire)"
TEST_DB_CONTAINER="$CONTAINER" TEST_DB_TEMPLATE="$TEMPLATE" \
  pnpm exec vitest run --config vitest.db.config.ts --sequence.shuffle.files=true "$@"

echo "==> test:db vert"
