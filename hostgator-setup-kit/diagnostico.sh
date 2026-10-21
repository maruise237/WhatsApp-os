#!/usr/bin/env bash
# diagnostico.sh — « cette installation a-t-elle été touchée par le worker qui n'était jamais mis à jour ? »
#
# LECTURE SEULE ABSOLUE. N'écrit aucun fichier, ne tire aucune image, ne démarre ni ne redémarre
# rien, ne touche pas au .env. Il lit seulement l'état et explique. On peut le lancer en production,
# à toute heure, autant de fois qu'on veut — ce qui est exactement ce qui va arriver.
#
# ── Pourquoi il NE consulte PAS /api/v1/health ───────────────────────────────
# Ce serait le chemin évident, et c'est le mauvais : jusqu'à la version qui corrige ceci, le health
# lisait `process.env.npm_package_version`, qui est `undefined` sous `CMD ["node",
# "server.js"]`. TOUTE installation — touchée ou non — répond `0.1.0`. Un détecteur
# qui l'interrogerait donnerait la même réponse dans les deux cas, ce qui revient à
# ne pas demander. Mesuré en production : `version: "0.1.0"` sur une installation
# dont il est prouvé qu'elle est touchée.
#
# ── Pourquoi il est AUTONOME (ne source pas _common.sh) ──────────────────────
# Deux raisons, et les deux sont le même problème : il tourne sur des machines ANCIENNES. Le
# `_common.sh` du disque d'une installation héritée est celui d'il y a deux mois, et
# en dépendre serait diagnostiquer le passé avec l'outil du passé. Et il
# doit pouvoir être téléchargé seul, sans rien cloner :
#
#   curl -fsSL https://raw.githubusercontent.com/melgarafael/DeskcommCRM/main/hostgator-setup-kit/diagnostico.sh | bash
#
# ── Ce qu'il peut supposer présent ───────────────────────────────────────────
# Mesuré sur un vrai VPS : bash 5.1, docker, docker compose, curl, sed/awk/grep.
# NE suppose PAS `jq` ni `node` (node n'existe pas hors des conteneurs).
set -uo pipefail   # sans `-e` : une commande qui échoue est une DONNÉE, pas une raison d'abandonner

COMPOSE_FILE="docker-compose.prod.yml"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; Z=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; D=''; Z=''
fi

titulo() { printf '\n%s%s%s\n' "$B" "$*" "$Z"; }
item()   { printf '  %s\n' "$*"; }

# ── 0. Trouver l'installation ────────────────────────────────────────────────
# install.sh clone dans ./deskcommcrm par défaut, mais l'opérateur peut l'avoir mise
# n'importe où. Nous cherchons dans le cwd, dans le chemin par défaut, et en dernier nous balayons
# — à profondeur limitée, pour ne pas parcourir le disque entier.
achar_projeto() {
  local c
  for c in . ./deskcommcrm /root/DeskcommCRM /root/deskcommcrm /opt/deskcommcrm /var/www/crm; do
    [ -f "$c/$COMPOSE_FILE" ] && { (cd "$c" && pwd); return 0; }
  done
  c="$(find /root /opt /home /var/www -maxdepth 4 -name "$COMPOSE_FILE" 2>/dev/null | head -1)"
  [ -n "$c" ] && { dirname "$c"; return 0; }
  return 1
}

PROJETO="$(achar_projeto)" || {
  printf '%s✖ Aucune installation de DeskcommCRM trouvée sur cette machine.%s\n' "$R" "$Z"
  printf '  Lancez ce script depuis le dossier du projet (celui qui contient %s).\n' "$COMPOSE_FILE"
  exit 2
}
cd "$PROJETO" || exit 2

printf '%s══ Diagnostic de DeskcommCRM ══%s\n' "$B" "$Z"
item "${D}dossier : $PROJETO${Z}"
item "${D}date :    $(date -u '+%Y-%m-%d %H:%M UTC')${Z}"

if ! docker info >/dev/null 2>&1; then
  printf '\n%s✖ Docker n’a pas répondu.%s Sans lui, impossible de diagnostiquer quoi que ce soit.\n' "$R" "$Z"
  printf '  Essayez : sudo systemctl start docker\n'
  exit 2
fi

# ── 1. Collecter les signaux ─────────────────────────────────────────────────
# Chacun a été mesuré sur une installation réellement touchée avant de devenir une règle.

# (a) Le .env connaît-il les nouvelles images ? Une installation héritée n'a pas ces clés —
#     elles sont apparues avec la correction.
ENV_TEM_WORKER=nao
[ -f .env ] && grep -qE '^WORKER_IMAGE=' .env 2>/dev/null && ENV_TEM_WORKER=sim

# (b) Quelle image chaque service utilise MAINTENANT.
#     `compose ps --format` fonctionne dans les versions qu'installe le kit ; en cas d'échec,
#     nous retombons sur le `docker inspect` du conteneur par le nom du projet.
PROJ_NOME="$(basename "$PROJETO" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
PROJ_NOME="${PROJ_NOME#"${PROJ_NOME%%[!_-]*}"}"

imagem_do_servico() {  # imagem_do_servico <service>
  local svc="$1" img
  img="$(docker compose -f "$COMPOSE_FILE" ps --format '{{.Service}}|{{.Image}}' 2>/dev/null \
        | awk -F'|' -v s="$svc" '$1==s{print $2; exit}')"
  [ -z "$img" ] && img="$(docker inspect "${PROJ_NOME}-${svc}-1" --format '{{.Config.Image}}' 2>/dev/null)"
  printf '%s' "$img"
}

IMG_WORKER="$(imagem_do_servico worker)"
IMG_APP="$(imagem_do_servico app)"

# (c) L'image du worker vient-elle de NOTRE CI, ou a-t-elle été construite sur cette machine ?
#
#     Le signal est `org.opencontainers.image.revision`, et ce choix n'est pas
#     arbitraire : c'est le SEUL label que seule la CI produit. Mesuré sur les deux
#     images côte à côte —
#
#       publiée par la CI : created, description, licenses, revision, source,
#                           title, url, version
#       construite ici    : licenses, source, title
#
#     `source`, `licenses` et `title` viennent du `LABEL` du Dockerfile, donc une
#     image locale les porte aussi ; `revision` (et `version`) viennent de
#     docker/metadata-action, qui ne tourne qu'en CI.
#
#     La première version de ce détecteur décidait par le NOM de l'image (« il a un hôte,
#     donc il vient d'un registre ») et ne consultait les labels que quand le nom n'avait pas
#     d'hôte. Un sabotage a fait tomber cela en une commande : construit en local, tagué
#     `ghcr.io/melgarafael/deskcomm-worker:falsificado`, et le diagnostic a
#     répondu « NON touchée » sur une installation touchée. Pire : le commentaire à côté du
#     code affirmait que les labels attraperaient ce cas — la prose décrivait une
#     protection que le code n'implémentait pas.
LABEL_SOURCE=""
LABEL_REVISION=""
CRIADA_WORKER=""
CRIADA_APP=""
if [ -n "$IMG_WORKER" ]; then
  LABEL_SOURCE="$(docker image inspect "$IMG_WORKER" \
                  --format '{{index .Config.Labels "org.opencontainers.image.source"}}' 2>/dev/null)"
  [ "$LABEL_SOURCE" = "<no value>" ] && LABEL_SOURCE=""
  LABEL_REVISION="$(docker image inspect "$IMG_WORKER" \
                    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null)"
  [ "$LABEL_REVISION" = "<no value>" ] && LABEL_REVISION=""
  # ATTENTION à utiliser `docker image inspect`, et non `docker inspect <conteneur>` :
  # le `.Created` du CONTENEUR est l'heure à laquelle il a été recréé, et un `up -d`
  # les recrée tous ensemble — en production les deux tombaient à la même seconde alors que
  # les IMAGES avaient 13 jours d'écart. Interroger le conteneur donnerait un
  # faux négatif justement dans le cas réel.
  CRIADA_WORKER="$(docker image inspect "$IMG_WORKER" --format '{{.Created}}' 2>/dev/null | cut -c1-10)"
fi
[ -n "$IMG_APP" ] && CRIADA_APP="$(docker image inspect "$IMG_APP" --format '{{.Created}}' 2>/dev/null | cut -c1-10)"

# La décision revient au `revision`, seul. Le nom de l'image n'entre qu'après, seulement dans
# l'explication — il est suggestif et falsifiable, le label non.
WORKER_DO_CI=nao
[ -n "$LABEL_REVISION" ] && WORKER_DO_CI=sim

# Deux saveurs de « construite ici », avec des conséquences différentes pour le texte :
#   legado      → aucun label : ancien Dockerfile.worker, antérieur à la correction
#   build local → a `source` mais pas `revision` : Dockerfile actuel, compilé
#                 sur cette machine (docker-compose.build.yml). Peut être délibéré.
SABOR_LOCAL=legado
[ -n "$LABEL_SOURCE" ] && SABOR_LOCAL=build_local

# ── 2. Le verdict ────────────────────────────────────────────────────────────
# Touchée = le worker NE vient PAS d'un registre. Les autres signaux entrent comme
# corroboration et comme explication, pas comme critère — l'un d'eux seul peut
# varier selon l'installation, l'origine de l'image non.
AFETADO=nao
[ "$WORKER_DO_CI" = "nao" ] && AFETADO=sim

titulo "Ce qui tourne"
item "app     : ${IMG_APP:-(introuvable)}${CRIADA_APP:+   ${D}image du $CRIADA_APP${Z}}"
item "worker  : ${IMG_WORKER:-(introuvable)}${CRIADA_WORKER:+   ${D}image du $CRIADA_WORKER${Z}}"

if [ -z "$IMG_WORKER" ]; then
  printf '\n%s⚠ Conteneur du worker introuvable.%s\n' "$Y" "$Z"
  printf '  Soit la stack est arrêtée, soit cette installation n’a pas l’agent IA.\n'
  printf '  Démarrez-la avec : docker compose -f %s up -d   et relancez ce diagnostic.\n' "$COMPOSE_FILE"
  exit 2
fi

if [ "$AFETADO" = "nao" ]; then
  titulo "${G}✓ Cette installation N'est PAS touchée.${Z}"
  item "Le worker fait tourner une image publiée (${IMG_WORKER})."
  item "Il reçoit les corrections de chaque version, comme le reste du système."
  # Ce n'est pas l'incident du worker figé — c'est pourquoi l'exit reste 0 —, mais c'est
  # un état que la doctrine interdit (invariant 3 : une installation client ne
  # pointe pas vers une tag mobile) et que U6-c a mesuré se produire pour de vrai : la première
  # exécution d'update.sh sur une installation héritée apporte le worker publié et le
  # laisse suivre `stable`. À la release suivante ce canal bouge, et un
  # `up -d` emmènerait le worker seul vers la nouvelle version pendant que l'app reste sur
  # l'ancienne. Un avertissement en gris clair, c'était trop peu pour cela.
  if [ "$ENV_TEM_WORKER" = "nao" ]; then
    tag_do_worker="${IMG_WORKER##*:}"
    case "$tag_do_worker" in
      latest|main|stable)
        printf '\n'
        item "${Y}⚠ Mais la version de l'agent est FLOTTANTE.${Z}"
        item "  Il suit le canal '${tag_do_worker}', pas une version fixe — il peut donc"
        item "  sauter tout seul à la prochaine version lors d'un redémarrage, pendant que le reste du"
        item "  serveur reste là où il est."
        item "  ${B}Lancez 'bash hostgator-setup-kit/update.sh' une fois de plus${Z} pour tout fixer sur la"
        item "  même version. C'est rapide : il n'y a rien à retélécharger."
        ;;
      *)
        item "${D}(le .env ne fixe pas WORKER_IMAGE, mais l'image n'est pas sur un canal mobile)${Z}"
        ;;
    esac
  fi
  exit 0
fi

titulo "${R}✗ Cette installation EST touchée.${Z}"
item "Le worker — le processus qui fait répondre l'agent IA — fait tourner une"
item "image ${B}construite sur ce serveur${Z}, et non celle publiée par le projet."
printf '\n'
item "${B}Comment nous le savons :${Z}"
item "  • l'image '${IMG_WORKER}' n'a pas la marque de révision que notre CI"
item "    appose sur chaque image publiée (org.opencontainers.image.revision)"
if [ "$SABOR_LOCAL" = "build_local" ]; then
  item "  • elle a les autres étiquettes du projet, donc elle a été construite à partir"
  item "    du code actuel — cela a pu être un choix de votre part (build local)"
fi
[ "$ENV_TEM_WORKER" = "nao" ] && item "  • le .env de cette installation ne fixe pas la version du worker"

if [ -n "$CRIADA_WORKER" ] && [ -n "$CRIADA_APP" ] && [ "$CRIADA_WORKER" != "$CRIADA_APP" ]; then
  printf '\n'
  item "${B}À quel point il est resté en arrière :${Z}"
  item "  l'app date du ${CRIADA_APP} et le worker du ${CRIADA_WORKER}."
  # `date -d` est GNU ; sur un VPS Ubuntu il existe. S'il n'existe pas, le texte ci-dessus a déjà
  # donné les deux dates — le calcul est un confort, pas la donnée.
  if command -v date >/dev/null 2>&1 && date -d "$CRIADA_APP" +%s >/dev/null 2>&1; then
    DIAS=$(( ( $(date -d "$CRIADA_APP" +%s) - $(date -d "$CRIADA_WORKER" +%s) ) / 86400 ))
    [ "$DIAS" -gt 0 ] && item "  ce sont ${B}${DIAS} jours${Z} de corrections que l'agent n'a pas reçues."
  fi
fi

cat <<TEXTO

  ${B}Ce que cela signifie en pratique${Z}
  Le reste du système s'est mis à jour normalement. Seul l'agent IA est resté figé
  sur le code du jour où vous avez installé — y compris des corrections de choses que votre
  client ressent : réponse envoyée en double, audio et image envoyés par le client qui ne
  deviennent pas du contenu pour l'IA, et classification du sentiment qui échoue en silence.

  Rien n'a été perdu : conversations, contacts et connexion WhatsApp sont intacts.
  Ce qui a manqué, c'est que l'agent reçoive les améliorations.

  ${B}Que faire${Z}
  La correction est une mise à jour normale, et ${B}c'est vous qui décidez quand${Z} :

      cd $PROJETO
      bash hostgator-setup-kit/update.sh

  Elle fait une sauvegarde de la base avant, et la marche à suivre — avec comment revenir en arrière — est
  dans docs/runbooks/remediar-worker-congelado.md.

  ${D}Ce diagnostic n'a rien changé à votre installation. Il a seulement regardé.${Z}
TEXTO
exit 1
