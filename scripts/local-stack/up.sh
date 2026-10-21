#!/usr/bin/env bash
# Pile locale « comme une VPS fraîche » pour tester l'app PAR L'ÉCRAN.
#
#   Postgres pg17 + baseline.sql   (le même prélude que scripts/test-db.sh)
#   Neon Auth   → Better Auth local   (scripts/local-stack/auth-server.mjs, :3100)
#   Data API    → PostgREST           (JWT vérifié contre le /jwks du serveur d'auth, :3001)
#   Stockage    → SeaweedFS S3        (:8333)
#
# L'app elle-même se lance à part (`next start`) avec l'env écrit dans
# $LOCAL_STACK_ENV (par défaut .superpowers/local-stack.env, ignoré par git).
#
#   bash scripts/local-stack/up.sh      # démarre tout, écrit l'env
#   bash scripts/local-stack/down.sh    # arrête tout
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=wos-local-db
REST=wos-local-rest
S3=wos-local-s3
PG_PORT=${LOCAL_PG_PORT:-54340}
AUTH_PORT=${LOCAL_AUTH_PORT:-3100}
REST_PORT=${LOCAL_REST_PORT:-3001}
S3_PORT=${LOCAL_S3_PORT:-8333}
ENV_FILE=${LOCAL_STACK_ENV:-.superpowers/local-stack.env}
STATE=.superpowers/local-stack
mkdir -p "$STATE"

DB_URL="postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres"

echo "==> Postgres pg17 ($DB, :$PG_PORT)"
docker rm -f "$DB" "$REST" "$S3" >/dev/null 2>&1 || true
docker run -d --name "$DB" -p "127.0.0.1:${PG_PORT}:5432" \
  -e POSTGRES_PASSWORD=postgres pgvector/pgvector:pg17 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$DB" psql -h 127.0.0.1 -U postgres -c "select 1" >/dev/null 2>&1 && break
  sleep 1
done
psql_db() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - "$@"; }

echo "==> schéma neon_auth complet (Better Auth) + rôle authenticator"
psql_db < scripts/local-stack/neon-auth.sql

echo "==> prélude Supabase (extrait de scripts/test-db.sh, sans copie)"
awk '/==> prélude :/{f=1} f&&/^psql_install <<.SQL.$/{g=1; next} g&&/^SQL$/{exit} g{print}' scripts/test-db.sh | psql_db

echo "==> baseline.sql (mode install, ON_ERROR_STOP=1)"
psql_db < supabase/baseline.sql

echo "==> utilisateurs Better Auth → auth.users (FK mixtes du cutover Neon)"
psql_db <<'SQL'
grant anon, authenticated, service_role to authenticator;

create or replace function neon_auth.espelhar_usuario_no_auth() returns trigger
language plpgsql as $$
begin
  insert into auth.users (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists trg_espelha_neon_no_auth on neon_auth."user";
create trigger trg_espelha_neon_no_auth after insert on neon_auth."user"
  for each row execute function neon_auth.espelhar_usuario_no_auth();
SQL

echo "==> Neon Auth local (Better Auth, :$AUTH_PORT)"
pkill -f "scripts/local-stack/auth-server.mjs" 2>/dev/null || true
LOCAL_AUTH_DATABASE_URL="$DB_URL" LOCAL_AUTH_PORT="$AUTH_PORT" \
  nohup node scripts/local-stack/auth-server.mjs > "$STATE/auth.log" 2>&1 &
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:${AUTH_PORT}/healthz" >/dev/null && break; sleep 1; done
JWKS="$(curl -sf "http://127.0.0.1:${AUTH_PORT}/api/auth/jwks")"
[ -n "$JWKS" ] || { echo "FATAL: /jwks vide"; cat "$STATE/auth.log"; exit 1; }

echo "==> Data API (PostgREST, :$REST_PORT)"
docker run -d --name "$REST" --network host \
  -e PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:${PG_PORT}/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$JWKS" -e PGRST_SERVER_PORT="$REST_PORT" \
  postgrest/postgrest:v12.2.3 >/dev/null

echo "==> stockage (SeaweedFS S3, :$S3_PORT)"
cat > "$STATE/s3.json" <<'JSON'
{"identities":[{"name":"local","credentials":[{"accessKey":"local","secretKey":"local-secret"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON
docker run -d --name "$S3" --network host -v "$PWD/$STATE/s3.json:/etc/s3.json:ro" \
  chrislusf/seaweedfs:3.80 server -dir=/data -ip=127.0.0.1 -master.port=9333 -volume.port=8085 \
  -filer -s3 -s3.port="$S3_PORT" -s3.config=/etc/s3.json >/dev/null

COOKIE_SECRET="local-stack-cookie-secret-0123456789abcdef"
KEY32="$(printf 'local-stack-aes-key-32-bytes!!!!' | base64)"
cat > "$ENV_FILE" <<ENV
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3000
NEON_AUTH_BASE_URL=http://127.0.0.1:${AUTH_PORT}/api/auth
NEON_DATA_API_URL=http://127.0.0.1:${REST_PORT}
NEON_DATABASE_URL=${DB_URL}
NEON_DATABASE_ADMIN_URL=${DB_URL}
NEON_AUTH_COOKIE_SECRET=${COOKIE_SECRET}
INTERNAL_SECRET=local-internal-secret
CPF_ENCRYPTION_KEY=local-cpf-key
WAHA_BYO_ENCRYPTION_KEY=local-waha-key
AI_CRED_AES_KEY=${KEY32}
WHATSAPP_GATEWAY_BASE_URL=http://127.0.0.1:8099
WHATSAPP_GATEWAY_TOKEN=local-gateway-token
SEAWEEDFS_S3_ENDPOINT=http://127.0.0.1:${S3_PORT}
SEAWEEDFS_S3_ACCESS_KEY=local
SEAWEEDFS_S3_SECRET_KEY=local-secret
SEAWEEDFS_MEDIA_BUCKET=media-bucket
ENV

echo "==> prêt. Env de l'app : $ENV_FILE"
