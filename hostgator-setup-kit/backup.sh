#!/usr/bin/env bash
# Sauvegarde : dump de la base + instantané des sessions WhatsApp.
# Une base gratuite N'A PAS de sauvegarde automatique — lancez ceci dans un cron quotidien.
#
#   crontab -e →  0 3 * * *  cd /chemin/deskcommcrm && bash hostgator-setup-kit/backup.sh
source "$(dirname "$0")/_common.sh"
enter_project

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
mkdir -p "$BACKUP_DIR"
# L'horodatage vient de l'hôte (pas du script) pour garder le kit déterministe.
ts="$(date +%Y%m%d-%H%M%S)"

step "Dump de la base → $BACKUP_DIR/db-$ts.sql.gz"
# Par la connexion de SCHÉMA (url_do_schema), pas par celle de l'app : `pg_dump` ne vide
# que ce que le rôle voit, et avec un rôle restreint — celui que nous recommandons dans le `.env` de
# qui utilise une base auto-hébergée — la sauvegarde sort PARTIELLE et sort verte. Un échec silencieux
# de sauvegarde est le pire des échecs : il n'apparaît qu'au moment de restaurer.
docker run --rm postgres:17-alpine pg_dump "$(url_do_schema)" --no-owner --no-privileges \
  | gzip > "$BACKUP_DIR/db-$ts.sql.gz"
c_grn "✓ base : $(du -h "$BACKUP_DIR/db-$ts.sql.gz" | awk '{print $1}')"

step "Instantané des sessions WhatsApp → $BACKUP_DIR/waha-$ts.tgz"
vol="$(dc config --volumes 2>/dev/null | grep -m1 waha-data || echo '')"
proj="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
docker run --rm -v "${proj}_waha-data:/data:ro" -v "$BACKUP_DIR:/out" alpine:3.20 \
  tar czf "/out/waha-$ts.tgz" -C /data . 2>/dev/null \
  && c_grn "✓ sessions WhatsApp sauvegardées" \
  || c_ylw "⚠ volume waha-data introuvable (le nom peut varier). Ajustez manuellement si nécessaire."

# Rétention : garde les 14 plus récents de chaque type.
step "Nettoyage des anciennes sauvegardes (en garde 14)"
ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$BACKUP_DIR"/waha-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
c_grn "✓ sauvegarde terminée dans $BACKUP_DIR"
