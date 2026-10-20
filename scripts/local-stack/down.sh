#!/usr/bin/env bash
# Arrête la pile locale démarrée par up.sh (données jetées : c'est une VPS fraîche à chaque fois).
docker rm -f wos-local-db wos-local-rest wos-local-s3 >/dev/null 2>&1 || true
pkill -f "scripts/local-stack/auth-server.mjs" 2>/dev/null || true
echo "pile locale arrêtée"
