#!/usr/bin/env bash
# Fonctions partagées par les scripts du kit. Chargé par `source`, jamais exécuté directement.
set -euo pipefail

COMPOSE="docker-compose.prod.yml"
COMPOSE_TRAEFIK="docker-compose.traefik.yml"

# Proxy inverse de cette installation. Vient du .env (load_env), 'caddy' par défaut —
# autrement dit, toute installation existante reste exactement comme elle est.
#
#   caddy   → le kit démarre son propre Caddy sur les ports 80/443 (VPS « nu »)
#   traefik → le VPS a DÉJÀ un Traefik sur ces ports (Hostinger, Coolify,
#             Dokploy...). L'override entre en jeu : il désactive Caddy et publie l'app
#             via des labels. Voir l'en-tête de docker-compose.traefik.yml.
#
# Tout `docker compose` du kit passe par ici : avec un proxy externe, une commande sans
# l'override démarrerait Caddy, qui entrerait en conflit direct avec Traefik.
dc() {
  if [ "${REVERSE_PROXY:-caddy}" = "traefik" ]; then
    docker compose -f "$COMPOSE" -f "$COMPOSE_TRAEFIK" "$@"
  else
    docker compose -f "$COMPOSE" "$@"
  fi
}

# La même liste de -f, en texte, pour les messages qui apprennent la commande au
# propriétaire. Si le message omettait l'override sur une installation avec proxy externe,
# le propriétaire ferait lui-même tomber le site en suivant l'instruction du kit.
dc_files() {
  if [ "${REVERSE_PROXY:-caddy}" = "traefik" ]; then
    printf -- '-f %s -f %s' "$COMPOSE" "$COMPOSE_TRAEFIK"
  else
    printf -- '-f %s' "$COMPOSE"
  fi
}

# ── Le réseau externe par lequel le proxy extérieur atteint l'app ─────────────
# Le nom que docker compose donne au projet quand personne ne passe -p : basename du
# répertoire, en minuscules, seulement [a-z0-9_-] — ET avec les `_`/`-` du DÉBUT retirés
# (NormalizeProjectName fait un TrimLeft). Sans ce retrait, un dossier comme
# `/root/_deskcomm` fait calculer `_deskcomm` au kit alors que les conteneurs
# portent `deskcomm` : l'installation ne se reconnaît plus et se traite
# comme une intruse. Mesuré avec docker compose v2.38.2 sur `_deskcomm`,
# `-deskcomm`, `_-_crm` et `_123` — tous divergeaient.
nome_do_projeto_compose() {  # nome_do_projeto_compose <répertoire>
  local n
  n="$(basename "$1" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
  printf '%s' "${n#"${n%%[!_-]*}"}"
}

nome_do_projeto_atual() {
  printf '%s' "${COMPOSE_PROJECT_NAME:-$(nome_do_projeto_compose "${PROJECT_DIR:-$PWD}")}"
}

# ── Qui est le PROPRIÉTAIRE de ce projet Docker ───────────────────────────────
#
# Deux copies du dépôt sur le même VPS — le clone de production et un clone de test à côté —
# reçoivent le MÊME nom de projet compose : docker le dérive du basename du
# répertoire, et `/root/DeskcommCRM` et `/root/apagar6/DeskcommCRM` donnent tous deux
# `deskcommcrm`. Les conteneurs forment UN SEUL ensemble ; les `.env` sont deux. Chaque
# `up -d` recrée le parc avec les identifiants de SON arborescence, et l'autre continue
# de parler à un transport qui ne la reconnaît plus.
#
# Ce n'est pas une hypothèse. Sur un vrai VPS, le clone de test a recréé le conteneur WhatsApp
# avec sa propre clé à 13h30 ; l'app a été recréée depuis l'arborescence de production à 14h47,
# avec une autre clé ; et pendant TROIS JOURS chaque appel à WAHA a répondu 401 — aucun
# numéro ne se connectait, aucun message n'entrait, et le panneau disait seulement « impossible
# de vérifier la connexion ».
#
# Le `flock` d'agent.sh ne protège pas de cela : il est par RÉPERTOIRE, donc les deux
# arborescences prennent des verrous différents tout en se disputant les mêmes conteneurs. Le
# verrou doit porter sur ce qu'elles partagent réellement — le projet Docker.
#
# Le signal vient de Docker lui-même : tout conteneur créé par compose porte le label
# `com.docker.compose.project.working_dir` avec l'arborescence qui l'a créé.
donos_do_projeto_em_execucao() {  # → un répertoire par ligne, sans doublon
  docker ps -a \
    --filter "label=com.docker.compose.project=$(nome_do_projeto_atual)" \
    --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null \
    | grep -v '^$' | sort -u
}

# Affiche les arborescences ÉTRANGÈRES qui sont encore des installations VIVANTES ; sort 0 s'il en
# existe au moins une. Sans conteneur en marche il n'y a pas de propriétaire, et une nouvelle installation
# prend légitimement la main — c'est pourquoi le silence ici veut dire « on peut continuer », pas « je ne sais pas ».
#
# « Vivante » est le filtre qui empêche ce garde-fou de naître rouge chez qui n'a rien fait
# de mal : qui a DÉPLACÉ l'installation de dossier laisse des conteneurs pointant
# vers un chemin qui n'existe plus. Ce n'est pas un rival qui se dispute le parc —
# c'est l'ancienne adresse de cette même installation, et refuser là bloquerait les
# mises à jour pour toujours, dans un journal que personne ne lit. Seule compte comme rivale
# l'arborescence encore présente sur le disque AVEC un compose : celle d'où un second cron
# peut réellement lancer `up -d`.
projeto_pertence_a_outra_arvore() {
  local dir vivas=""
  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    [ "$dir" != "${PROJECT_DIR:-$PWD}" ] || continue
    [ -f "$dir/$COMPOSE" ] || continue
    vivas="${vivas}${vivas:+$'\n'}${dir}"
  done <<EOF
$(donos_do_projeto_em_execucao)
EOF
  [ -n "$vivas" ] || return 1
  printf '%s' "$vivas"
}

# Le garde-fou qu'agent.sh et update.sh appellent avant de toucher à un conteneur.
#
# Il échoue FERMÉ sur l'action (ne touche pas au parc d'autrui) et OUVERT sur l'information : il dit
# quelle arborescence est propriétaire et comment prendre la main volontairement. S'arrêter en silence
# laisserait le propriétaire du VPS croire que l'agent met à jour, alors qu'il abandonne toutes les 5 minutes.
#
# `DESKCOMM_ASSUMIR_PROJETO=1` est l'issue pour le cas légitime — l'installation
# a changé de dossier et les conteneurs pointent encore vers l'ancien. Elle est explicite
# exprès : prendre la main par erreur est justement le défaut que cette fonction existe
# pour empêcher.
recusar_projeto_de_outra_arvore() {  # recusar_projeto_de_outra_arvore <comment signaler>
  local alheias reportar="${1:-}"
  alheias="$(projeto_pertence_a_outra_arvore)" || return 0
  [ "${DESKCOMM_ASSUMIR_PROJETO:-}" != "1" ] || return 0

  local recado
  recado="les conteneurs du projet '$(nome_do_projeto_atual)' ont été créés par une autre copie du dépôt ($(printf '%s' "$alheias" | tr '\n' ' ')) — celle-ci est $(printf '%s' "${PROJECT_DIR:-$PWD}"). Deux copies avec le même nom de projet se disputent les MÊMES conteneurs et chacune les recrée avec son propre .env, ce qui coupe les connexions WhatsApp et casse les identifiants. Ne laissez qu'UNE seule copie dans le cron (crontab -e) ou, si celle-ci est bien la bonne installation, lancez avec DESKCOMM_ASSUMIR_PROJETO=1"
  if [ -n "$reportar" ] && command -v "$reportar" >/dev/null 2>&1; then
    "$reportar" "$recado"
  else
    printf '%s\n' "$recado" >&2
  fi
  return 1
}

# Le bridge que CE projet réserve au proxy externe. Un `basename` brut
# diverge sur un dossier avec majuscule, point ou underscore initial — et alors le kit
# crée un réseau pendant que compose en cherche un autre.
rede_reservada_do_proxy() { printf '%s_proxy' "$(nome_do_projeto_atual)"; }

# Le compose déclare TRAEFIK_NETWORK comme réseau EXTERNE, et un réseau externe qui
# n'existe pas est refusé AVANT que compose ne crée quoi que ce soit — mesuré avec
# compose v2.38.2 : `up -d` meurt sur « network X declared as external, but could
# not be found », sans dire d'où vient le nom. Le découvrir ici, avec le nom en
# main, fait gagner des dizaines de minutes à la personne qui installe. Une valeur écrite
# à la main dans le .env passe par le même filtre : elle se trompe aussi facilement que la détection.
#
# Le réseau que l'installateur se réserve est le cas où ne pas exister est NORMAL —
# nouvelle installation, ou quelqu'un a lancé `docker network prune`. La réponse est alors de
# créer, pas de mourir : le nom est le nôtre et nous connaissons sa forme.
# Renvoie : ok | criar | inexistente | driver_errado
veredito_rede_do_proxy() {  # veredito_rede_do_proxy <driver trouvé> <réseau> <bridge du projet> [attachable]
  local drv="${1:-}" rede="${2:-}" nossa="${3:-}"
  if [ -z "$drv" ]; then
    [ -n "$nossa" ] && [ "$rede" = "$nossa" ] && { printf 'criar'; return 0; }
    printf 'inexistente'; return 0
  fi
  [ "$drv" = bridge ] && { printf 'ok'; return 0; }
  # $4 = "true" quand le réseau est un overlay attachable (Swarm). Un conteneur
  # compose ordinaire peut y entrer, donc il sert aussi bien qu'un bridge.
  # Sans attachable, le refus demeure : là, `up` mourrait sur
  # « could not attach to network ».
  [ "$drv" = overlay ] && [ "${4:-}" = true ] && { printf 'ok'; return 0; }
  printf 'driver_errado'
}

# Applique le verdict ci-dessus : vérifie dans Docker, crée le nôtre s'il manque, meurt
# en expliquant quand il appartient à quelqu'un d'autre. Vit ici — et non dans install.sh — parce que
# le `dc up -d` d'update.sh court exactement le même risque : le bridge est un artefact
# comme un autre et disparaît avec un `docker network prune`, ou avec le `down -v` que
# le kit lui-même enseigne comme chemin de redémarrage. Sans cette vérification, la mise à jour
# meurt avec le même message opaque de compose, et pire : agent.sh lance
# update.sh tout seul toutes les 5 minutes, donc personne ne regarde l'écran.
# Définit TRAEFIK_NETWORK quand elle est vide — exprès, c'est la même valeur par défaut
# que l'installateur écrit dans le .env.
garantir_rede_do_proxy() {
  [ "${REVERSE_PROXY:-caddy}" = "traefik" ] || return 0
  local nossa drv erro
  nossa="$(rede_reservada_do_proxy)"
  TRAEFIK_NETWORK="${TRAEFIK_NETWORK:-traefik}"
  drv="$(docker network inspect -f '{{.Driver}}' "$TRAEFIK_NETWORK" 2>/dev/null || true)"
  local att
  att="$(docker network inspect -f '{{.Attachable}}' "$TRAEFIK_NETWORK" 2>/dev/null || true)"
  case "$(veredito_rede_do_proxy "$drv" "$TRAEFIK_NETWORK" "$nossa" "$att")" in
  ok) : ;;
  criar)
    # La raison est jointe parce qu'ici on NE SAIT PAS laquelle c'est : la commande est correcte, et
    # c'est Docker qui a refusé (manque de plage d'IP libre sur un VPS avec beaucoup de
    # stacks, c'est un cas connu). Sans transmettre sa réponse, le message
    # demanderait de répéter à la main la commande qui vient d'échouer.
    if ! erro="$(docker network create "$TRAEFIK_NETWORK" 2>&1 >/dev/null)"; then
      die "Impossible de créer le réseau Docker '$TRAEFIK_NETWORK'. Docker a répondu :
  ${erro}"
    fi
    c_dim "  (réseau '$TRAEFIK_NETWORK' créé — c'est par lui que Traefik atteint le CRM)"
    ;;
  inexistente)
    die "Le réseau Docker '$TRAEFIK_NETWORK' n'existe pas.
Lancez 'docker network ls', identifiez le réseau de votre Traefik et mettez
TRAEFIK_NETWORK=<nom> dans le .env avant de réessayer."
    ;;
  driver_errado)
    # Demander à qui est en mode host de « chercher le réseau de votre Traefik », c'est lui demander
    # de chercher ce qui n'existe pas : en mode host, il n'est dans aucun réseau
    # Docker. Pour ce cas, l'issue est d'effacer la ligne et de laisser le kit décider —
    # il crée tout seul le bridge du projet.
    die "Le réseau '$TRAEFIK_NETWORK' a le driver '$drv', et l'app a besoin
d'un bridge pour que Traefik atteigne le conteneur. Si votre Traefik tourne en mode
host (c'est le cas quand 'docker ps' n'affiche aucun port publié pour lui), SUPPRIMEZ la ligne
TRAEFIK_NETWORK du .env : le kit crée et utilise le réseau '$nossa'.
Sinon, lancez 'docker network ls' et mettez le bon bridge dans TRAEFIK_NETWORK du .env.
S'il s'agit d'un overlay Swarm, il doit avoir été créé avec --attachable —
sans cela, un conteneur compose ordinaire ne peut pas y entrer."
    ;;
  esac
}

# Couleur seulement quand il y a un vrai terminal — même règle qu'install.sh (si vous modifiez
# l'une, modifiez l'autre). Ici c'est doublement vrai : update.sh, qui hérite de ces
# fonctions, est lancé par agent.sh avec la sortie redirigée vers un fichier
# (`> "$LOG"`) toutes les 5 minutes, pour toujours, sur chaque installation. C'est de là que
# venait l'échappement ANSI que l'esc() d'agent.sh doit balayer octet par octet avant
# d'envoyer le journal dans le heartbeat ; ne pas l'émettre à la source est la correction de fond.
if   [ -n "${NO_COLOR:-}" ];    then COLOR=0
elif [ -n "${FORCE_COLOR:-}" ]; then COLOR=1
elif [ -t 1 ];                  then COLOR=1
else                                 COLOR=0
fi
paint() { local code="$1"; shift; if [ "$COLOR" = 1 ]; then printf '\033[%sm%s\033[0m\n' "$code" "$*"; else printf '%s\n' "$*"; fi; }
c_red() { paint 31 "$*"; }
c_grn() { paint 32 "$*"; }
c_ylw() { paint 33 "$*"; }
c_dim() { paint 2  "$*"; }
die()   { c_red "✖ $*"; exit 1; }
step()  { printf '\n'; paint 1 "▶ $*"; }

# Jumelle de celle d'install.sh (si vous modifiez l'une, modifiez l'autre) — voir le commentaire là-bas
# pour le défaut qu'elle corrige. Couverte par test-validators.sh.
resposta_sim() {
  local r
  r="$(printf '%s' "${1:-}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
  case "$r" in o|oui|s|sim|y|yes) return 0;; *) return 1;; esac
}

# Santé de l'app via la route qui répond réellement, pas via le port. Le port
# 3000 accepte la connexion dès que Node démarre — AVANT que l'app sache si elle atteint
# la base, Redis et WhatsApp. C'était exactement la différence entre install.sh, qui
# testait le port et affichait « Installation terminée ! » même sans réponse, et
# update.sh, qui ne déclare le succès qu'avec "status":"ok". Un critère, un seul endroit.
# Renvoie DEUX lignes : le statut GLOBAL sur la première, le corps entier sur la seconde.
#
# La séparation existe parce que chercher '"status":"ok"' dans le JSON brut est faux, et
# se trompe en silence : `ok` est le vocabulaire des CHECKS individuels
# (ok|degraded|down), alors que le statut global en utilise un autre (healthy|degraded|
# unhealthy). Mesuré contre l'app réelle : un `grep '"status":"ok"'` correspond au
# `checks.redis`, donc une app avec la BASE HORS SERVICE — statut global « unhealthy » —
# passait pour saine, du moment qu'un autre check était debout. C'est l'app qui
# décide, dans le Node déjà invoqué ; le shell ne répète pas sa
# règle.
app_health_probe() {
  dc exec -T app node -e \
    "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.json()).then(j=>{console.log((j&&j.data&&j.data.status)||'sem_status');console.log(JSON.stringify(j))}).catch(()=>process.exit(1))" \
    2>/dev/null || echo ''
}

# wait_app_healthy [tentatives] [intervalle_s] — 0 quand l'app se déclare
# `healthy` ou `degraded`, 1 sinon. `degraded` est inclus exprès :
# cela signifie qu'un service OPTIONNEL n'a pas encore été configuré (le check
# renvoie degraded/not_configured), et refuser l'installation pour cela recalerait
# un CRM qui est debout et qui répond. `unhealthy`, c'est autre chose — cela veut dire
# check DOWN, et là l'app ne sert à rien. Renvoie le corps lu, pour que l'appelant puisse
# montrer la raison au lieu de dire seulement que ça n'a pas marché.
wait_app_healthy() {
  local tentativas="${1:-20}" intervalo="${2:-3}" saida='' status='' corpo='' i=0
  while [ "$i" -lt "$tentativas" ]; do
    saida="$(app_health_probe)"
    status="$(printf '%s\n' "$saida" | head -1 | tr -d '\r')"
    corpo="$(printf '%s\n' "$saida" | tail -n +2)"
    case "$status" in
      healthy|degraded) printf '%s' "$corpo"; return 0;;
    esac
    i=$((i+1))
    [ "$i" -lt "$tentativas" ] && sleep "$intervalo"
  done
  printf '%s' "$corpo"
  return 1
}

# Code de sortie de qui a REFUSÉ avant de toucher à quoi que ce soit — distinct
# de « j'ai échoué au milieu » (1). agent.sh s'en sert pour ne pas annuler une
# mise à jour qui n'a jamais commencé : redémarrer le conteneur et réécrire le .env
# en « revenant » d'un changement qui n'a pas eu lieu, c'est un dégât inventé de toutes pièces.
REFUSED_RC=3
refuse() { c_red "✖ $*"; exit "$REFUSED_RC"; }

# Installer <ref> serait-il un retour en arrière ? 0 = oui (déjà contenu dans HEAD),
# 1 = non, 2 = JE NE SAIS PAS. « Je ne sais pas » ne devient jamais « on peut ».
#
# install.sh clone avec `--depth 1`, et dans un dépôt superficiel
# `merge-base --is-ancestor` répond 1 (non-ancêtre) pour N'IMPORTE QUOI
# hors de l'unique commit téléchargé — y compris pour une vieille tag qui, dans l'histoire
# réelle, est loin derrière. Autrement dit : la réponse qui autorise est exactement celle que le
# dépôt superficiel donne gratuitement, et `git fetch --tags` ne défait pas le superficiel (vérifié : après
# le fetch, is-shallow-repository reste true). C'est pourquoi nous complétons
# l'historique AVANT de demander, et, si ce n'est pas possible, nous renvoyons 2 — l'appelant
# refuse. Échouer fermé est la bonne chose dans un script qui tourne en root sur la machine de
# quelqu'un qui ne sait pas réparer.
is_already_in_head() {
  local ref="$1"
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo unknown)" = "true" ]; then
    git fetch --unshallow --tags --quiet origin 2>/dev/null || true
  fi
  case "$(git rev-parse --is-shallow-repository 2>/dev/null || echo unknown)" in
    false) : ;;
    *) return 2 ;;   # encore superficiel, ou même pas un dépôt git : impossible de savoir
  esac
  git merge-base --is-ancestor "$ref" HEAD 2>/dev/null && return 0
  return 1
}

# Charge le .env en lisant chaque ligne comme une DONNÉE, sans `source`.
#
# Le `. ./.env` interprétait le fichier comme un script, et alors toute valeur de texte
# libre devenait du code : `APP_NAME=Boutique do Kofi` faisait essayer au shell d'exécuter
# `do` ; un mot de passe avec `#` était tronqué à ce qui ressemblait à un commentaire ; un avec `$`
# était développé et arrivait corrompu. Comme TOUT script du kit passe par ici,
# un nom d'entreprise avec une espace — c'est-à-dire presque tous — faisait tomber reset-mfa,
# reset-password, backup, restore et healthcheck. Justement les outils
# d'urgence, qui ne servent que quand il y a déjà un problème.
#
# Accepte les valeurs avec ou sans guillemets : les anciennes installations (sans guillemets) se mettent à
# fonctionner sans avoir besoin de réécrire le .env.
load_env() {
  local file="${1:-.env}" line key val
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue;; esac
    case "$line" in *=*) ;; *) continue;; esac
    key="${line%%=*}"; val="${line#*=}"
    case "$key" in ''|*[!A-Za-z0-9_]*) continue;; esac
    case "$val" in
      \"*\")
        val="${val:1:${#val}-2}"
        # Retirer les guillemets ne défait pas l'échappement que envq a mis à l'intérieur. Sans ces
        # quatre remplacements, `Boutique P$ss` revient de la relecture comme `Boutique P\$ss` — la
        # valeur arrive altérée et l'erreur n'apparaît que loin d'ici (mesuré).
        #
        # La sentinelle \001 existe à cause de l'ORDRE : un `\\` ramené directement à `\`
        # serait retraité par les remplacements suivants, et `\\$` (barre littérale
        # suivie d'un dollar) deviendrait `$`. En gardant la paire échappée dans un octet qui
        # n'apparaît pas dans un .env, les remplacements de `\"`, `\$` et de l'accent grave ne la voient pas, et
        # elle ne redevient une barre qu'à la fin.
        val="${val//\\\\/$'\001'}"
        val="${val//\\\"/\"}"
        val="${val//\\\$/\$}"
        val="${val//\\\`/\`}"
        val="${val//$'\001'/\\}"
        ;;
      \'*\')
        # RÉTROCOMPATIBILITÉ — ne pas supprimer. Jusqu'en 2026-08, envq écrivait avec
        # des guillemets simples, et la mise à jour NE réécrit PAS le .env : update.sh ne change que
        # APP_IMAGE et APP_PULL_POLICY (:159 et :165, via set_env_var) et laisse les
        # autres clés exactement comme l'ancienne installation les a écrites. Qui
        # supprime cette branche rend le mot de passe et la connection string de toute ancienne installation
        # avec quatre caractères de trop, dès la première mise à jour.
        val="${val:1:${#val}-2}"
        # L'envq de l'époque écrivait le guillemet simple du CONTENU sous la forme '\''
        # (ferme le littéral, échappe le guillemet, rouvre). Retirer les guillemets extérieurs ne
        # défait pas cela : sans ce remplacement, un mot de passe avec guillemet revient de la relecture avec
        # quatre caractères de trop, et l'erreur n'apparaît que loin d'ici (psql
        # refuse la connexion, la connexion ne correspond pas) sans rien qui pointe vers le .env.
        # Trouvé par le test d'aller-retour.
        val="${val//"'\\''"/"'"}"
        ;;
    esac
    printf -v "$key" '%s' "$val"
    export "${key?}"
  done < "$file"
}

# Va dans le répertoire du projet (là où se trouve le compose) et charge le .env.
enter_project() {
  if [ -f "$COMPOSE" ]; then :;
  elif [ -f "deskcommcrm/$COMPOSE" ]; then cd deskcommcrm;
  else die "Introuvable : $COMPOSE. Lancez depuis le dossier du projet."; fi
  [ -f .env ] || die "Le .env est absent (lancez d'abord install.sh)."
  load_env .env
  PROJECT_DIR="$(pwd)"
}

# ── Les DEUX connexions : celle de l'app et celle du schéma ───────────────────
# `NEON_DATABASE_URL` avait deux rôles dans une seule chaîne : elle va dans le `.env` des
# conteneurs (l'app parle à la base par elle) ET c'était la même qui lançait
# `create extension`, le `baseline.sql` et la promotion du propriétaire.
#
# Dans le cloud cela ne fait pas mal — la chaîne du pooler arrive déjà privilégiée. Sur un Supabase
# AUTO-HÉBERGÉ cela fait mal dès la première installation : le baseline exige le propriétaire de la base, l'app
# veut le rôle restreint (c'est ce que `docs/deploy-selfhost/README.md` §2 recommande), et la
# seule issue était d'éditer le `.env` à la main entre deux étapes (issue #192).
#
# Désormais : qui touche au schéma (et qui fait backup/restore, qui doivent
# tout lire) passe par cette fonction ; le `.env` continue de ne recevoir que celle de l'app.
# `NEON_DATABASE_ADMIN_URL` absente OU vide retombe sur l'habituelle — qui a déjà installé
# ne change pas de comportement.
#
# C'est une FONCTION, et non une affectation en haut de ce fichier, parce que `_common.sh` est
# *sourcé* AVANT le `load_env` dans les deux scripts (install.sh et update.sh), et qu'il
# commence par `set -euo pipefail` : une ligne `X="${NEON_DATABASE_ADMIN_URL:-$NEON_DATABASE_URL}"`
# ici meurt sur « variable non liée » et emporte tout le kit avec elle (mesuré : la
# suite shell entière est passée à EXIT=1 avec 0 cas exécutés). Et avec garde
# (`${NEON_DATABASE_URL:-}`) ce serait pire : la valeur se FIGE vide et chaque site de DDL
# se met à lancer `psql ""`. La résolution doit se faire au moment de l'usage.
#
# `:?` et non `:-` : sans AUCUNE des deux, il faut s'arrêter avec une phrase qui dit
# quoi faire, pas continuer vers un `psql ""` qui échoue loin de la cause. La limite est
# honnête — ceci tourne dans une substitution de commande, et un sous-shell ne fait pas tomber le
# parent ; ce que le message garantit, c'est que la cause apparaisse à l'écran avant l'erreur de
# connexion que les appelants traitent déjà.
url_do_schema() {
  printf '%s' "${NEON_DATABASE_ADMIN_URL:-${NEON_DATABASE_URL:?aucune connection string de base dans le .env — lancez install.sh}}"
}

# psql éphémère via conteneur (n'exige pas psql sur l'hôte). Utilise la connexion de schéma :
# les appelants touchent à `auth.mfa_factors` et `private.app_secrets`, hors de
# portée d'un rôle d'app avec des grants seulement sur `public`.
psql_run() { docker run --rm -i postgres:17-alpine psql "$(url_do_schema)" -v ON_ERROR_STOP=1 "$@"; }

# ── Les trois images que NOUS publions ────────────────────────────────────────
# L'espace de noms est constant et littéral exprès : il est écrit dans le .env de
# toute installation vivante, et le dériver d'une variable ferait que l'ancien kit (déjà
# sur le disque du client) et le nouveau construisent des chaînes différentes.
IMG_NS="ghcr.io/melgarafael"
IMG_APP="${IMG_NS}/deskcommcrm"
IMG_WORKER="${IMG_NS}/deskcomm-worker"
IMG_SCHEDULER="${IMG_NS}/deskcomm-scheduler"

# La dernière version publiée (ex. : "1.2.1"), ou vide si impossible de savoir.
#
# Interroge le DÉPÔT DISTANT, pas le clone : install.sh clone avec `--depth 1`, qui ne
# rapporte aucune tag, donc `git tag -l` en local renverrait vide et l'installation
# naîtrait sur `latest` sans que personne ne s'en aperçoive — ce qui est justement le défaut que
# cette fonction existe pour corriger.
#
# Échoue OUVERT exprès : sans réseau, sans git ou sans tag sur le dépôt distant, elle renvoie
# vide et l'appelant retombe sur le canal mobile, comme avant. Bloquer l'installation de
# quelqu'un parce qu'on n'a pas pu résoudre un numéro de version, ce serait échanger un
# problème de prévisibilité contre un problème de disponibilité.
ultima_versao_publicada() {
  local url="${1:-https://github.com/melgarafael/DeskcommCRM.git}" ref
  command -v git >/dev/null 2>&1 || return 0
  # `grep -v -- -` écarte les PRÉVERSIONS (v1.11.0-rc1, v1.1.1-jmpo.1 — cette dernière
  # existe vraiment dans ce dépôt). Le `--sort=-v:refname` de git place la préversion
  # AU-DESSUS de la version finale quand `versionsort.suffix` n'est pas configuré, et
  # une nouvelle installation naîtrait sur une release candidate sans que personne ne l'ait demandé.
  ref="$(git ls-remote --tags --refs --sort=-v:refname "$url" 'v*' 2>/dev/null \
        | awk '{print $2}' | grep -v -- '-' | head -1)" || return 0
  [ -n "$ref" ] || return 0
  printf '%s' "${ref#refs/tags/v}"
}

# Code HTTP du manifest d'une de nos références sur GHCR, anonymement.
#   200 = existe et est publique | 404 = n'existe pas | 403 = paquet PRIVÉ | 000 = pas de réseau
#
# 403 est le cas le plus trompeur : un paquet fraîchement créé sur GHCR naît privé, et
# un dépôt public n'y change rien. Tant que personne ne change la visibilité à la
# main, le `docker compose pull` de chaque VPS est refusé — et comme le `pull` d'un service
# avec `image:` fait échouer toute l'opération, l'installation meurt à l'étape de démarrage.
ghcr_status() {
  local img="$1" tag="$2" tok
  tok="$(curl -fsS --max-time 6 \
          "https://ghcr.io/token?scope=repository:melgarafael/${img}:pull&service=ghcr.io" 2>/dev/null \
        | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')" || true
  if [ -z "$tok" ]; then printf '000'; return 0; fi
  curl -s -o /dev/null --max-time 6 -w '%{http_code}' \
    -H "Authorization: Bearer $tok" \
    -H 'Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json' \
    "https://ghcr.io/v2/melgarafael/${img}/manifests/${tag}" 2>/dev/null || printf '000'
}

# Les TROIS images existent-elles et sont-elles publiques pour cette référence ?
#
# Demander pour les trois ensemble, et pas seulement pour celle de l'app, c'est tout l'intérêt : `deskcomm-worker`
# et `deskcomm-scheduler` sont nées après les releases qui existent déjà, donc
# `deskcomm-worker:1.2.1` n'existera jamais — la v1.2.1 appartient au passé. Épingler les trois
# sur une version sans vérifier écrirait dans le .env du client deux références
# impossibles, et le kit les construirait sur le VPS **en silence**, depuis le sommet de main :
# l'app d'une release + worker/scheduler d'un autre code. Exactement le mélange de
# versions que la doctrine existe pour interdire, sur le chemin de la première impression.
trio_publicado() {
  local tag="$1" i
  for i in deskcommcrm deskcomm-worker deskcomm-scheduler; do
    [ "$(ghcr_status "$i" "$tag")" = "200" ] || return 1
  done
  return 0
}

# Le .env est-il épinglé À MOITIÉ ? (app fixée sur une version, worker/scheduler non)
#
# C'est l'état que la transition produit et que rien ne dénonce. Mesuré en répétition puis
# en production : celui qui exécute la première mise à jour est l'`update.sh` qui était déjà
# sur le disque — l'ancien —, et il ne sait écrire que `APP_IMAGE`. Le worker retombe sur la
# valeur par défaut du compose (`:stable`, un canal MOBILE) et le script finit en disant
# « Mise à jour terminée — app en ligne et en bonne santé », sans un mot là-dessus.
#
# Pourquoi c'est important : à la release suivante, `stable` bouge, et un `up -d` quelconque
# — avec `pull_policy: always`, qui est la valeur par défaut d'une tag mobile — emmènerait le worker
# seul vers la nouvelle version pendant que l'app reste sur l'ancienne. Un mélange de
# versions qui se produit sans que personne ne le demande, et c'est ce que l'invariant 3 interdit.
#
# Renvoie les services non épinglés, séparés par une espace. Vide = tout est correct.
valor_do_env() {  # valor_do_env <fichier> <clé>   (sans guillemets autour)
  # Le `|| true` n'est pas décoratif : `_common.sh` tourne sous `set -euo pipefail`, et
  # un `grep` qui ne trouve rien sort 1 — ce qui, sans cela, tuerait toute la fonction
  # justement dans le cas qui compte (la clé ABSENTE). Cela a coûté deux faux cas verts
  # dans un test avant d'apparaître.
  { grep -E "^$2=" "$1" 2>/dev/null || true; } | head -1 | cut -d= -f2- | sed "s/^['\"]//; s/['\"]\$//"
}

tag_da_imagem() {  # tag_da_imagem <référence>  → la tag, ou vide s'il n'y en a pas
  local ref="${1##*/}"
  case "$ref" in *:*) printf '%s' "${ref##*:}" ;; *) printf '' ;; esac
}

pin_incompleto() {  # pin_incompleto [chemin du .env]
  local envfile="${1:-.env}" app_ref app_tag faltando="" par chave svc img tag
  [ -f "$envfile" ] || return 0

  # Sans APP_IMAGE épinglée il n'y a aucune « moitié » — c'est une autre situation (installation
  # qui n'a jamais lancé update, ou qui a choisi un canal exprès).
  app_ref="$(valor_do_env "$envfile" APP_IMAGE)"
  [ -n "$app_ref" ] || return 0
  app_tag="$(tag_da_imagem "$app_ref")"
  case "$app_tag" in latest|main|stable|"") return 0 ;; esac

  for par in "WORKER_IMAGE:worker" "SCHEDULER_IMAGE:scheduler"; do
    chave="${par%%:*}"; svc="${par##*:}"
    img="$(valor_do_env "$envfile" "$chave")"
    if [ -z "$img" ]; then
      faltando="$faltando $svc"                    # absente : suit la valeur par défaut du compose
    else
      tag="$(tag_da_imagem "$img")"
      case "$tag" in latest|main|stable|"") faltando="$faltando $svc" ;; esac
    fi
  done
  printf '%s' "${faltando# }"
}

# Complète l'épinglage ABSENT dans le .env, avec la version que l'image EN COURS D'EXÉCUTION déclare.
#
# La règle qui rend cela sûr : **ne comble qu'un vide, n'écrase jamais une valeur
# explicite.** Une clé absente est une omission de l'ancien `update.sh` ; une clé présente est une
# décision de l'opérateur — y compris la décision de suivre un canal mobile
# exprès. Un cron qui corrigerait le choix d'autrui serait pire que le défaut.
#
# Et la version écrite est celle que le conteneur fait DÉJÀ tourner (label
# `org.opencontainers.image.version` de l'image en usage), pas celle de l'app. La différence
# compte : si le worker est sur une version différente de l'app, écrire celle de l'app
# CHANGERAIT ce qui tourne au prochain `up -d` — possiblement une rétrogradation. En écrivant
# ce qui est déjà là, l'opération est un pur gel : rien ne change de comportement
# maintenant, et le prochain `update.sh` aligne les trois.
#
# Renvoie les services corrigés, séparés par une espace. Vide = rien à faire.
completar_pin_ausente() {  # completar_pin_ausente [envfile]
  local envfile="${1:-.env}" par chave svc repo img ver corrigidos=""
  [ -f "$envfile" ] || return 0
  # Ce garde vaut pour une exécution non-root et ne coûte rien. Ce n'est PAS lui qui
  # protège le cas réel : le cron tourne en root, et root ignore `chmod`. Ce qui
  # protège, c'est l'atomicité de `set_env_var` (écrit dans un `.tmp` puis fait `mv`) —
  # mesuré avec `chattr +i`, qui bloque même root : l'écriture échoue, la fonction sort 0
  # et le `.env` original arrive intact de l'autre côté, avec les personnalisations.
  [ -w "$envfile" ] || return 0

  for par in "WORKER_IMAGE:worker:deskcomm-worker" "SCHEDULER_IMAGE:scheduler:deskcomm-scheduler"; do
    chave="${par%%:*}"; svc="$(printf '%s' "$par" | cut -d: -f2)"; repo="${par##*:}"

    # Un VIDE seulement. Une valeur explicite (même sur un canal mobile) est intouchable.
    if { grep -qE "^${chave}=" "$envfile" 2>/dev/null; }; then continue; fi

    img="$(docker inspect "$(nome_do_projeto_atual)-${svc}-1" --format '{{.Config.Image}}' 2>/dev/null)" || img=""
    [ -n "$img" ] || continue
    ver="$(docker image inspect "$img" --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null)" || ver=""
    # `<no value>` = image sans le label (build local). Un canal n'est pas une version.
    case "$ver" in ""|"<no value>"|latest|main|stable) continue ;; esac

    set_env_var "$envfile" "$chave" "${IMG_NS}/${repo}:${ver}"
    set_env_var "$envfile" "${chave%_IMAGE}_PULL_POLICY" missing
    corrigidos="$corrigidos $svc"
  done
  printf '%s' "${corrigidos# }"
}

# Écrit dans le .env les trois images de la MÊME version + le pull_policy qui correspond
# à la mutabilité de la tag.
#
# Les trois ensemble parce qu'elles démarrent ensemble : l'app sur une version et le worker sur `latest`
# est la matrice de compatibilité que personne n'a testée. Et le pull_policy n'est pas un
# détail — il a été mesuré qu'avec `always` et le registre qui ne répond pas pour cette
# référence, le `up -d` ÉCHOUE et le conteneur ne démarre pas, même avec l'image déjà sur le
# disque. Sur une tag immuable cela ne protège de rien et lie seulement le démarrage du CRM
# du client à la disponibilité de GHCR.
#
#   gravar_imagens .env 1.2.1   → épinglé, pull_policy=missing
#   gravar_imagens .env latest  → canal,   pull_policy=always
gravar_imagens() {
  local envfile="$1" versao="$2" politica
  case "$versao" in
    latest|main|stable) politica="always" ;;
    *)                  politica="missing" ;;
  esac
  set_env_var "$envfile" APP_IMAGE             "${IMG_APP}:${versao}"
  set_env_var "$envfile" APP_PULL_POLICY       "$politica"
  set_env_var "$envfile" WORKER_IMAGE          "${IMG_WORKER}:${versao}"
  set_env_var "$envfile" WORKER_PULL_POLICY    "$politica"
  set_env_var "$envfile" SCHEDULER_IMAGE       "${IMG_SCHEDULER}:${versao}"
  set_env_var "$envfile" SCHEDULER_PULL_POLICY "$politica"
}

# Écrit (ou réécrit) une clé dans le .env — sans dupliquer la ligne si elle existe déjà.
#   set_env_var .env APP_IMAGE ghcr.io/…:1.1.0
#
# C'est ce qui fait qu'un choix SURVIT au processus qui l'a fait. `export APP_IMAGE=…`
# ne vaut que pendant que le script tourne : docker-compose.prod.yml lit l'image dans le .env,
# donc un `docker compose up -d` lancé à la main par le propriétaire des semaines plus tard (commande
# documentée dans le README) reviendrait à l'APP_IMAGE écrite à l'installation (":latest") et
# DÉFERAIT la mise à jour — l'app du sommet de main sur la base de la version
# installée, exactement le mode de défaillance pour lequel Watchtower a été écarté.
set_env_var() {
  local envfile="$1" key="$2" value="$3" tmp
  [ -f "$envfile" ] || return 0
  tmp="${envfile}.tmp.$$"
  # "|| true" : avec pipefail, un grep -v qui filtre TOUTES les lignes (fichier d'une
  # seule ligne) sort 1 et ferait tomber le script par set -e avant l'ajout.
  { grep -vE "^${key}=" "$envfile" || true; } > "$tmp"
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  chmod 600 "$tmp"   # le .env contient des secrets : le tmp naît avec la même rigueur
  mv "$tmp" "$envfile"
}

# L’administration des utilisateurs passe par Neon Managed Better Auth.
# Aucun endpoint admin supposé n’est appelé depuis le kit : cette opération doit
# échouer explicitement plutôt que de dégrader la sécurité ou retourner un UID vide.
owner_id_by_email() {
  die "La recherche admin d’utilisateur n’est pas disponible dans le kit Neon. Utilisez Neon Auth et le panneau applicatif."
}

# Active (de façon idempotente) le cron qui déclenche le drain d'événements chaque minute. SANS
# cela, aucune automatisation/webhook ne tourne en auto-hébergement : dans ce kit, les workers sont
# lus par cron, pas par trigger→HTTP ni par file gérée (doctrine du
# projet : un trigger Postgres ne fait jamais de HTTP). Appelée par install.sh et
# update.sh — relancer ne duplique pas la ligne du crontab.
# ── Cron : une installation ne touche jamais à la ligne d'une autre ───────────
# Le filtre était `crontab -l | grep -v 'event-log-drain' | crontab -` : il correspondait à
# la ligne de N'IMPORTE QUELLE installation de l'hôte. Installer une seconde instance sur le
# même VPS effaçait les deux lignes de la première — le drain d'événements et l'agent
# de mise à jour — en silence, et le propriétaire ne l'aurait découvert que par ce qui a cessé
# de se produire. Confirmé sur un VPS avec la production en marche : ses lignes auraient été
# emportées par une nouvelle installation dans un autre dossier.
#
# Désormais chaque ligne porte un marqueur avec le répertoire de l'installation, et le
# filtre ne retire que celles qui lui appartiennent.
# Le marqueur identifie l'installation ET LE RÔLE de la ligne. Le rôle n'est pas décoratif :
# avec un seul marqueur par installation, la seconde fonction exécutée effaçait la ligne de la
# première (le filtre retire tout ce qui correspond au marqueur, et les deux lignes
# correspondaient). Mesuré sur le VPS : après l'installation, il ne restait que l'agent et le CRM se retrouvait
# SANS le drain d'événements — toute l'automatisation à l'arrêt, en silence.
cron_tag() { printf '# deskcomm:%s:%s' "${PROJECT_DIR:-$PWD}" "${1:?rôle de la ligne (drain|agent)}"; }

# Pure (testable sans toucher au vrai crontab) : lit le crontab actuel sur stdin et
# affiche le nouveau. Retire les lignes de CETTE installation — par le marqueur, et aussi
# par la `signature` pour les lignes héritées, écrites avant que le marqueur
# n'existe, qui sans cela seraient dupliquées à chaque nouvelle exécution.
cron_merge() {  # cron_merge <marqueur> <signature_héritée> <nouvelle_ligne>
  local marcador="$1" legado="$2" nova="$3"
  { grep -vF -e "$marcador" | grep -vF -e "$legado"; } || true
  printf '%s\n' "$nova"
}

setup_event_log_drain_cron() {
  command -v crontab >/dev/null 2>&1 || { c_ylw "⚠ 'crontab' introuvable — installez le paquet 'cron' et relancez pour activer les automatisations."; return 0; }

  local secret="${INTERNAL_CRON_SECRET:-}"
  [ -n "$secret" ] || secret="${INTERNAL_SECRET:-}"
  [ -n "$secret" ] || { c_ylw "⚠ INTERNAL_SECRET/INTERNAL_CRON_SECRET manquant — cron des automatisations non activé."; return 0; }
  [ -n "${NEXT_PUBLIC_APP_URL:-}" ] || { c_ylw "⚠ NEXT_PUBLIC_APP_URL manquant — cron des automatisations non activé."; return 0; }

  local url_drain="${NEXT_PUBLIC_APP_URL}/api/v1/cron/event-log-drain"
  local marcador; marcador="$(cron_tag drain)"

  # « première fois » concerne CETTE installation, pas l'hôte : avec l'ancien test
  # ('existe-t-il une ligne event-log-drain ?'), une nouvelle installation sur un VPS
  # qui en fait déjà tourner une autre se croyait vétéran et sautait le nettoyage des événements.
  local first_time=1
  if crontab -l 2>/dev/null | grep -qF -e "$url_drain"; then first_time=0; fi

  local cron_line="* * * * * curl -fsS -H \"Authorization: Bearer ${secret}\" \"${url_drain}\" >/dev/null 2>&1 ${marcador}"
  ( crontab -l 2>/dev/null | cron_merge "$marcador" "$url_drain" "$cron_line" ) | crontab -
  c_grn "✓ automatisations actives (cron event-log-drain, chaque minute)"

  if [ "$first_time" = 1 ]; then
    # 1re activation du cron (y compris sur une installation existante qui n'a jamais
    # eu de drain en marche) : il peut y avoir d'anciens événements 'pending' accumulés.
    # Si le 1er drain les traitait, il déclencherait des effets de bord en retard
    # (ex. : webhook d'il y a des jours/semaines) — surprise indésirable pour le propriétaire du
    # CRM. Nous marquons 'done' seulement les vraiment vieux (>7 jours) ; les récents
    # restent 'pending' et sont traités normalement au prochain drain.
    step "Nettoyage des anciens événements en attente (1re activation du cron)"
    psql_run -c "update event_log set status='done', updated_at=now() where status='pending' and created_at < now() - interval '7 days';" \
      >/dev/null 2>&1 \
      && c_grn "✓ événements en attente de plus de 7 jours marqués comme terminés" \
      || c_ylw "⚠ impossible de nettoyer les anciens événements — vérifiez manuellement la table event_log si nécessaire."
  fi
}

# Active (de façon idempotente) le cron de l'agent de mise à jour : toutes les 5 minutes il
# signale à l'app la version installée et, si quelqu'un a cliqué sur « Mettre à jour maintenant » à
# l'écran, lance update.sh tout seul. C'est ce qui fait que le bouton de l'écran existe
# vraiment — sans cron, l'écran affiche « mise à jour automatique indisponible » pour
# toujours. Appelée par install.sh et update.sh (bloc 7) — relancer ne duplique pas
# la ligne du crontab.
setup_update_agent_cron() {
  command -v crontab >/dev/null 2>&1 || { c_ylw "⚠ 'crontab' introuvable — le bouton de mise à jour depuis l'écran ne fonctionnera pas."; return 0; }
  local secret="${INTERNAL_CRON_SECRET:-${INTERNAL_SECRET:-}}"
  [ -n "$secret" ] || { c_ylw "⚠ INTERNAL_SECRET manquant — agent de mise à jour non activé."; return 0; }
  [ -n "${NEXT_PUBLIC_APP_URL:-}" ] || { c_ylw "⚠ NEXT_PUBLIC_APP_URL manquant — agent de mise à jour non activé."; return 0; }

  # `cd` explicite : agent.sh appelle enter_project(), qui trouve le projet par le
  # RÉPERTOIRE COURANT. Dans le cron, le CWD est le home du propriétaire du crontab — sans le cd,
  # la ligne ne fonctionne que par accident (installation standard dans /root/deskcommcrm) et
  # meurt en silence toutes les 5 minutes dans tout REPO_DIR personnalisé ou /opt.
  # La signature héritée inclut le PROJECT_DIR : c'est ce qui distingue la ligne de cette
  # installation de celle d'une voisine, qui lance le même agent.sh dans un autre dossier.
  local legado="cd ${PROJECT_DIR} && bash hostgator-setup-kit/agent.sh"
  local marcador; marcador="$(cron_tag agent)"
  local cron_line="*/5 * * * * ${legado} >/dev/null 2>&1 ${marcador}"
  ( crontab -l 2>/dev/null | cron_merge "$marcador" "$legado" "$cron_line" ) | crontab -
  c_grn "✓ mise à jour depuis l'écran active (agent toutes les 5 minutes)"
}

# Garantit la clé de chiffrement des secrets (webhooks/Nuvemshop) et l'injecte dans la
# base (private.app_secrets, migration 0041). Idempotent : réutilise la clé du
# .env si elle existe (la changer invaliderait des données déjà chiffrées) ; la génère si absente et
# l'ajoute au .env. Appelée par install.sh et update.sh APRÈS l'application du baseline.
ensure_encryption_key() {
  local envfile="${1:-.env}"
  local key="${NUVEMSHOP_OAUTH_ENCRYPTION_KEY:-}"
  if [ -z "$key" ] && [ -f "$envfile" ]; then
    key="$(grep -E '^NUVEMSHOP_OAUTH_ENCRYPTION_KEY=' "$envfile" | head -1 | cut -d= -f2- | tr -d "'\"" || true)"
  fi
  if [ -z "$key" ]; then
    key="$(openssl rand -hex 32)"
    printf '\nNUVEMSHOP_OAUTH_ENCRYPTION_KEY=%s\n' "$key" >> "$envfile"
    c_grn "✓ clé de chiffrement des secrets générée et écrite dans le .env"
  fi
  export NUVEMSHOP_OAUTH_ENCRYPTION_KEY="$key"

  # L'injecte dans la base — c'est là que les fonctions de chiffrement la lisent (Supabase ne
  # permet pas de configurer la clé via un paramètre de base).
  psql_run -c "insert into private.app_secrets (name, value) values ('nuvemshop_oauth_key', '${key}') on conflict (name) do update set value = excluded.value, updated_at = now();" \
    >/dev/null 2>&1 \
    && c_grn "✓ clé de chiffrement active dans la base (les secrets de webhook sont stockés chiffrés)" \
    || c_ylw "⚠ impossible d'injecter la clé de chiffrement dans la base — les secrets de webhook ne pourront pas être enregistrés tant qu'update.sh n'aura pas été relancé."
}
