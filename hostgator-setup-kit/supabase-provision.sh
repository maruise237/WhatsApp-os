#!/usr/bin/env bash
#
# Crée le projet Supabase via la Management API et renvoie les 4 identifiants dont
# install.sh a besoin — au lieu que la personne crée le projet dans le navigateur et copie
# quatre champs à la main.
#
# POURQUOI CECI EXISTE
# --------------------
# Sur une installation mesurée de bout en bout, le script a pris ~3 minutes et la
# préparation ~59. La plus grosse part a été de créer le projet Supabase et de copier
# URL, anon, service_role et connection string — l'étape la plus lente et la plus
# facile à rater (copier la « Direct connection », qui est IPv6 uniquement et ne se connecte pas
# depuis un VPS IPv4, était le piège numéro un).
#
# USAGE
#   export NEON_MANAGEMENT_TOKEN=sbp_...      # Personal Access Token
#   bash supabase-provision.sh "Nom du Projet" [region]
#
# Écrit les 4 variables sur stdout au format `CLÉ='valeur'`, prêtes à être
# concaténées dans un .env. Rien n'est affiché dans un journal.
#
# ⚠️ LE JETON EST UNE CLÉ MAÎTRESSE : il donne accès à TOUS les projets du compte. Il est
# lu depuis l'environnement, jamais écrit sur disque par ce script, et ne doit pas rester dans le
# .env du serveur du client. Qui installe pour des tiers : utilisez le jeton DU
# CLIENT, ou lancez ce script sur votre machine et n'emportez que les 4 identifiants.
#
# LIMITE DE L'OFFRE GRATUITE : 2 projets gratuits par UTILISATEUR, comptés sur
# toutes les organisations où il est Owner/Admin. Impossible d'héberger N clients
# sur un seul compte — chaque client a besoin de son compte (ou d'une offre payante).
#
# Dépendances : les mêmes que le kit (bash + curl). Sans jq, sans python.

set -euo pipefail

API="https://api.supabase.com/v1"
PROJECT_NAME="${1:-DeskcommCRM}"
REGION="${2:-${NEON_REGION:-sa-east-1}}"

c_red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
c_grn() { printf '\033[32m%s\033[0m\n' "$*" >&2; }
c_ylw() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
c_dim() { printf '\033[2m%s\033[0m\n' "$*" >&2; }
die()   { c_red "✖ $*"; exit 1; }

# Mot de passe de la base : 32 alphanumériques, sans les caractères qui cassent une URL
# (@ : / ? # &) — il entre dans la connection string, et un '@' ici coupe l'hôte.
#
# Avant, c'était une AFFECTATION AU NIVEAU DU SCRIPT :
#   DB_PASS="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
# et le script mourait là, à chaque fois. head ferme le pipe après avoir réuni les 32
# caractères, `tr` — qui continuerait à lire /dev/urandom pour toujours — reçoit
# SIGPIPE et sort 141, et avec pipefail ce 141 devient le statut de l'affectation, qui
# sous `set -e` tue le script entier APRÈS que le mot de passe existe. Mesuré sur le VPS et
# reproduit hors de lui : la création automatique de la base échouait toujours, et
# l'installateur disait seulement « Impossible de créer le projet Supabase », sans raison.
#
# Ce qui bouche le trou, c'est que CETTE fonction existe : le statut de `$(gen_db_pass)` devient
# celui du `printf` final, pas celui du pipe à l'intérieur (mesuré : avec l'ancien pipe
# dans une fonction, le script survit ; au niveau du script, il sort 141). Lire un bloc
# FINI est une défense en profondeur — cela ne dépend pas de ce détail de propagation, et
# vaut si quelqu'un remet un jour l'appel en ligne. 4096 octets donnent ~980
# alphanumériques (24 % des octets), une large marge pour 32.
# Couverte par test-validators.sh, au point d'appel — là où vivait le bug.
gen_db_pass() {
  local p
  p="$(LC_ALL=C tr -dc 'A-Za-z0-9' < <(head -c 4096 /dev/urandom))"
  printf '%s' "${p:0:32}"
}

# Charge seulement les fonctions ci-dessus, sans rien provisionner — c'est ainsi que
# test-validators.sh exerce le générateur de mot de passe.
if [ "${SUPABASE_PROVISION_LIB:-}" = "1" ]; then return 0; fi

# Étape numérotée : qui installe doit savoir OÙ il en est et COMBIEN il reste. « ▶ Création
# du projet » seul ne dit pas si c'est le début ou la fin.
TOTAL_PASSOS=6
PASSO=0
step() {
  PASSO=$((PASSO + 1))
  printf '\n\033[1m[%d/%d] %s\033[0m\n' "$PASSO" "$TOTAL_PASSOS" "$*" >&2
}

# Affiche un secret sans le faire fuir dans le terminal (ni dans la capture d'écran que la personne envoie
# pour demander de l'aide) : 6 premiers et 4 derniers.
mascara() {
  local v="$1"
  if [ "${#v}" -le 14 ]; then printf '%s' "••••••"; else printf '%s…%s' "${v:0:6}" "${v: -4}"; fi
}

moldura() {
  local txt="$1" larg=60 pad
  # `printf %-60s` compte des OCTETS, et accent/·/tiret cadratin occupent 2+ en UTF-8 : la bordure
  # droite sortait de travers sur tout titre avec accent — c'est-à-dire presque tous
  # en français. `${#txt}` compte des CARACTÈRES, donc le remplissage sort juste.
  pad=$(( larg - ${#txt} )); [ "$pad" -lt 0 ] && pad=0
  printf '\033[36m╭%s╮\033[0m\n' "$(printf '─%.0s' $(seq 1 $((larg + 2))))" >&2
  printf '\033[36m│\033[0m \033[1m%s%*s\033[0m \033[36m│\033[0m\n' "$txt" "$pad" '' >&2
  printf '\033[36m╰%s╯\033[0m\n' "$(printf '─%.0s' $(seq 1 $((larg + 2))))" >&2
}

moldura "DeskcommCRM · création de votre base sur Supabase"

if [ -z "${NEON_MANAGEMENT_TOKEN:-}" ]; then
  c_red "✖ Le jeton d'accès Supabase est absent."
  printf '\n' >&2
  c_dim "  1. Ouvrez https://supabase.com/dashboard/account/tokens"
  c_dim "  2. Generate new token, donnez un nom (ex. : deskcommcrm) et copiez"
  c_dim "  3. Lancez :  export NEON_MANAGEMENT_TOKEN=sbp_...  et réessayez"
  printf '\n' >&2
  exit 1
fi

# Extrait un champ chaîne d'un JSON PLAT. Même style que le jwt_claim() de
# install.sh : le kit promet de ne dépendre que de bash+curl, donc ni jq ni python.
# Ne sert qu'aux champs simples que renvoie l'API (ref, id, name, status).
#
# Le `|| true` à la fin n'est pas de la paresse — c'est ce qui garde les messages d'erreur
# ATTEIGNABLES. Un champ absent fait sortir `grep` en 1 ; avec `pipefail`, cela fait tomber la
# substitution, et avec `set -e` tout le script meurt en silence sur la ligne de l'
# affectation — avant le `die` qui expliquerait le problème. Mesuré avec un jeton
# invalide : l'API répondait {"message":"Unauthorized"} et le terminal revenait
# simplement, sans un mot. En échouant vide, c'est le `die` qui décide quoi dire.
json_str() { grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" <<<"$1" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true; }

api() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $NEON_MANAGEMENT_TOKEN" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $NEON_MANAGEMENT_TOKEN"
  fi
}

# ── 1. Organisation ─────────────────────────────────────────────────────────
step "Découverte de l'organisation"
ORG_ID="${SUPABASE_ORG_ID:-}"
if [ -z "$ORG_ID" ]; then
  orgs="$(api GET /organizations)"
  ORG_ID="$(json_str "$orgs" id)"
  [ -n "$ORG_ID" ] || die "Aucune organisation trouvée. Vérifiez le jeton."
  c_grn "✓ organisation : $(json_str "$orgs" name) ($ORG_ID)"
fi

# ── 2. Mot de passe de la base ──────────────────────────────────────────────
# Sans caractères qui cassent une URL (@ : / ? # &) — le mot de passe entre dans la
# connection string, et un '@' ici coupe l'hôte en deux.
DB_PASS="$(gen_db_pass)"
[ "${#DB_PASS}" -eq 32 ] || die "impossible de générer le mot de passe de la base (seulement ${#DB_PASS} caractères). Relancez."

# ── 3. Crée le projet ───────────────────────────────────────────────────────
step "Création du projet '$PROJECT_NAME' dans $REGION"
created="$(api POST /projects "{\"name\":\"$PROJECT_NAME\",\"organization_id\":\"$ORG_ID\",\"region\":\"$REGION\",\"db_pass\":\"$DB_PASS\"}")"
REF="$(json_str "$created" ref)"
[ -n "$REF" ] || { c_red "Réponse de l'API :"; printf '%s\n' "$created" >&2; die "Impossible de créer le projet."; }
c_grn "✓ projet créé : $REF"

# ── 4. Attend qu'il soit debout ─────────────────────────────────────────────
# Un nouveau projet NE naît PAS prêt : il passe par COMING_UP jusqu'à ACTIVE_HEALTHY. Sans
# attendre, l'étape du schéma échoue avec « connection refused » et l'installation
# meurt au milieu sans expliquer pourquoi.
step "Attente du démarrage de la base"
c_dim "      Un nouveau projet met 2 à 5 minutes à être debout. Laissez tourner."
ok=""
inicio=$SECONDS
LIMITE=60   # 60 x 10 s = 10 minutes
for i in $(seq 1 $LIMITE); do
  st="$(json_str "$(api GET "/projects/$REF")" status)"
  case "$st" in
    ACTIVE_HEALTHY) ok=1; break;;
    INACTIVE|REMOVED|RESTORE_FAILED)
      printf '\n' >&2
      die "Le projet est passé en '$st' — vérifiez sur supabase.com/dashboard/project/$REF";;
  esac
  # Une ligne qui se réécrit : barre + état RÉEL venant de l'API + temps
  # écoulé. Un point isolé pendant 10 minutes ressemble à un blocage ; voir COMING_UP
  # changer et l'horloge avancer montre que c'est vivant.
  preenchido=$((i * 24 / LIMITE))
  # `printf 'x%.0s' $(seq 1 0)` N'affiche PAS rien — il affiche UNE fois, parce que
  # printf sans arguments exécute quand même le format une fois. Sans ce garde-fou la barre
  # naissait avec 1 bloc de trop au début et à la fin (25 sur 24).
  barra=""; [ "$preenchido" -gt 0 ] && barra="$(printf '█%.0s' $(seq 1 "$preenchido"))"
  vazio="";  [ $((24 - preenchido)) -gt 0 ] && vazio="$(printf '░%.0s' $(seq 1 $((24 - preenchido))))"
  printf '\r      \033[36m%s%s\033[0m  %-16s %dm%02ds' \
    "$barra" "$vazio" "${st:-consultation…}" $(( (SECONDS-inicio)/60 )) $(( (SECONDS-inicio)%60 )) >&2
  sleep 10
done
printf '\r%*s\r' 70 '' >&2
[ "$ok" = 1 ] || die "Pas prêt en 10 minutes. Voir sur supabase.com/dashboard/project/$REF"
c_grn "✓ base en ligne (a pris $(( (SECONDS-inicio)/60 ))m$(( (SECONDS-inicio)%60 ))s)"

# ── 5. Clés ─────────────────────────────────────────────────────────────────
step "Récupération des clés d'API"
keys="$(api GET "/projects/$REF/api-keys")"
# `|| true` pour la même raison que json_str() : sans lui, une réponse inattendue de l'API
# tue le script sur l'affectation et la ligne du dessous — qui affiche la réponse brute et
# explique ce qui s'est passé — ne tourne jamais.
ANON="$(grep -o '"name"[[:space:]]*:[[:space:]]*"anon"[^}]*' <<<"$keys" | grep -o '"api_key"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)"
SERVICE="$(grep -o '"name"[[:space:]]*:[[:space:]]*"service_role"[^}]*' <<<"$keys" | grep -o '"api_key"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)"
[ -n "$ANON" ] && [ -n "$SERVICE" ] || { printf '%s\n' "$keys" >&2; die "Impossible de lire anon/service_role."; }
c_grn "✓ anon et service_role obtenues"

# ── 6. Découvre l'hôte du POOLER — en testant, pas en devinant ──────────────
# L'hôte est `aws-<N>-<region>.pooler.supabase.com`, et ce <N> VARIE selon le projet
# (0, 1, …). Le construire à l'aveugle se trompe, et l'erreur est justement ce qui gêne le plus
# qui installe : la Direct connection (`db.<ref>.supabase.co`) n'existe qu'en IPv6 et
# ne se connecte jamais depuis un VPS IPv4, mais échoue avec un message réseau générique.
#
# Donc : construit les candidats et PROUVE chacun avec une vraie connexion, via le même
# postgres:17-alpine qu'install.sh utilise déjà pour appliquer le schéma. On garde celui qui
# répond — sans deviner.
step "Découverte de l'hôte du pooler (test de connexion réelle)"
DB_URL=""
for n in 0 1 2; do
  cand="postgresql://postgres.${REF}:${DB_PASS}@aws-${n}-${REGION}.pooler.supabase.com:5432/postgres"
  if docker run --rm postgres:17-alpine psql "$cand" -c 'select 1' >/dev/null 2>&1; then
    DB_URL="$cand"; c_grn "✓ pooler : aws-${n}-${REGION}"; break
  fi
done
[ -n "$DB_URL" ] || die "Aucun hôte de pooler n'a répondu. Récupérez le Session pooler dans Settings > Database."

# ── 7. Sortie ───────────────────────────────────────────────────────────────
printf '\n' >&2
moldura "Projet Supabase prêt"
# Le résumé est MASQUÉ : qui installe envoie souvent une capture pour demander de l'aide, et un
# service_role entier dans une capture d'écran, c'est un accès total à la base, sans RLS.
printf '  %-14s %s\n' "Projet"   "$PROJECT_NAME ($REF)" >&2
printf '  %-14s %s\n' "Région"   "$REGION" >&2
printf '  %-14s %s\n' "URL"      "https://$REF.supabase.co" >&2
printf '  %-14s %s\n' "anon"     "$(mascara "$ANON")" >&2
printf '  %-14s %s\n' "service"  "$(mascara "$SERVICE")" >&2
printf '  %-14s %s\n' "base"     "$(mascara "$DB_PASS") @ $(sed 's|.*@||; s|:5432.*||' <<<"$DB_URL")" >&2
printf '\n' >&2
c_ylw "  ⚠ Le mot de passe de la base N'est PAS récupérable par l'API ensuite. Gardez-le maintenant."
c_dim "     Panneau : https://supabase.com/dashboard/project/$REF"
printf '\n' >&2
c_grn "  Collez les 4 lignes ci-dessous dans votre .env (ou redirigez : >> .env)"
printf '\n' >&2

# stdout propre : seulement les 4 lignes, pour que `bash supabase-provision.sh ... >> .env`
# fonctionne. Tout le visuel ci-dessus est allé sur stderr exprès.
printf "NEON_DATA_API_URL='https://%s.supabase.co'\n" "$REF"
printf "NEON_TEST_JWT='%s'\n" "$ANON"
printf "NEON_SERVICE_ROLE_JWT='%s'\n" "$SERVICE"
printf "NEON_DATABASE_URL='%s'\n" "$DB_URL"
