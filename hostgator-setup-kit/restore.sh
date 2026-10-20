#!/usr/bin/env bash
# Restaure la base à partir d'un dump généré par backup.sh.
# ATTENTION : écrase le schéma/les données actuels de la base.
#
#   bash hostgator-setup-kit/restore.sh backups/db-20260702-030000.sql.gz
source "$(dirname "$0")/_common.sh"
enter_project

DUMP="${1:-}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || die "Usage : restore.sh <fichier-db-*.sql.gz>"

c_ylw "⚠ Ceci va ÉCRASER la base de $NEON_DATA_API_URL."
read -r -p "Tapez 'RESTAURER' pour confirmer : " a
[ "$a" = "RESTAURER" ] || die "Annulé."

step "Restauration de $DUMP"
gunzip -c "$DUMP" | docker run --rm -i postgres:17-alpine psql "$(url_do_schema)" \
  && c_grn "✓ base restaurée" || die "Échec de la restauration — voir le journal ci-dessus."

c_ylw "Redémarrez l'app : docker compose $(dc_files) restart app"
