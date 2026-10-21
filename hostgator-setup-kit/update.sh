#!/usr/bin/env bash
# Met à jour DeskcommCRM sur le VPS : nouveau code + base + app — avec une SAUVEGARDE avant et
# une VÉRIFICATION DE SANTÉ après. Une seule commande, pensée pour qui n'est pas technique :
#
#   bash hostgator-setup-kit/update.sh
#
# Options :
#   --force        installe la version demandée même si elle est égale ou ANTÉRIEURE
#                  à celle déjà présente (c'est la façon explicite de revenir en arrière)
#   --skip-backup  saute la sauvegarde automatique (déconseillé)
#   --to <tag>     installe cette tag au lieu de la plus récente publiée
# Absolu et résolu AVANT `enter_project`, qui fait un `cd` : après lui un
# `dirname "$0"` relatif pointerait au mauvais endroit, et le seul symptôme serait
# un script du kit « introuvable » au milieu de la mise à jour.
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$KIT_DIR/_common.sh"
enter_project

FORCE=""; SKIP_BACKUP=""; TARGET_TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    --to) shift; TARGET_TAG="$1" ;;
  esac
  shift
done

# ── 0-. Cette copie du dépôt est-elle propriétaire des conteneurs ? ──────────
# Avant le cron et avant git : une seconde copie qui met à jour par-dessus recrée le
# parc avec SON .env. C'est ce qui a laissé le WhatsApp d'un vrai VPS trois jours
# en 401. Voir `recusar_projeto_de_outra_arvore` dans _common.sh.
recusar_projeto_de_outra_arvore || die "Mise à jour interrompue pour ne pas casser l'installation en ligne."

# ── 0. Active l'agent de l'écran AVANT toute décision de version ─────────────
# Installer le cron ici, et non à la fin, est ce qui permet au bootstrap de se terminer : les
# chemins « déjà sur la version la plus récente » et « cette version est antérieure à la vôtre »
# sortent du script plus bas, et si le cron en dépendait la mise à jour depuis
# l'écran ne s'activerait jamais justement chez qui est déjà à jour. C'est idempotent.
setup_update_agent_cron

# ── 1. Y a-t-il vraiment une mise à jour ? ───────────────────────────────────
step "Recherche de mises à jour"
git fetch --tags --quiet origin 2>/dev/null || c_ylw "⚠ impossible de joindre GitHub — je continue avec le code déjà présent."
[ -n "$TARGET_TAG" ] || TARGET_TAG="$(git tag -l 'v*' --sort=-v:refname | head -1)"
[ -n "$TARGET_TAG" ] || die "Aucune version publiée à installer n'a été trouvée."
git rev-parse --verify --quiet "${TARGET_TAG}^{commit}" >/dev/null \
  || die "Je ne connais pas la version $TARGET_TAG ici. Vérifiez le nom (ex. : v1.1.0) ou réessayez quand le serveur pourra joindre GitHub."
CURRENT_TAG="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"

# Que le code soit à jour NE signifie PAS que l'app l'est : c'est l'image qui tourne.
# Une mise à jour interrompue après le checkout (coupure réseau, manque de
# mémoire au milieu du docker pull) laisse le dépôt neuf et l'image ancienne — et
# à partir de là TOUT update.sh répondait « déjà sur la version la plus récente »,
# bloquant le CRM sur l'ancienne version sans aucune issue visible pour le propriétaire.
# Couvre aussi une image republiée sans nouveau commit (reconstruction de sécurité).
# (Vient de `main` ; la version par tag tombe exactement dans le même piège, parce que la
# comparaison de tags est aussi satisfaite avec l'ancienne image en place.)
image_desatualizada() {
  local img="${APP_IMAGE:-ghcr.io/melgarafael/deskcommcrm:latest}" local_d remote_d
  local_d="$(docker image inspect "$img" --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' 2>/dev/null | sed 's/.*@//')"
  [ -z "$local_d" ] && return 0                 # pas encore téléchargée → mettre à jour
  remote_d="$(docker buildx imagetools inspect "$img" 2>/dev/null | awk '/^Digest:/{print $2; exit}')"
  [ -z "$remote_d" ] && return 1                # aucun moyen de consulter → ne pas forcer
  [ "$local_d" != "$remote_d" ]
}

MESMA_TAG=""
[ "$CURRENT_TAG" = "$TARGET_TAG" ] && MESMA_TAG=1

if [ -n "$MESMA_TAG" ] && [ -z "$FORCE" ] && ! image_desatualizada; then
  c_grn "✓ Vous êtes déjà sur la version la plus récente ($TARGET_TAG). Rien à mettre à jour."
  exit 0
fi

# Une cible DÉJÀ contenue dans ce qui tourne ici = reculer, pas avancer.
# Sur une installation qui suit `main`, `git describe --exact-match` est vide : la
# comparaison de tags ci-dessus passe à côté et, sans ce garde-fou, le script installerait
# allègrement une version PLUS ANCIENNE que celle installée — désactivant ce que le propriétaire
# a déjà (c'est ainsi que ce bouton lui-même s'autodétruirait, en revenant à une
# image qui ne connaît pas l'agent de mise à jour). Refuser est la règle ; revenir
# en arrière reste possible, mais seulement quand quelqu'un le demande exprès.
# Quand la cible est la MÊME tag déjà installée, le garde-fou ne s'applique pas : il n'y a nulle
# part où revenir en arrière — seule l'image est restée derrière.
if [ -z "$FORCE" ] && [ -z "$MESMA_TAG" ]; then
  is_already_in_head "$TARGET_TAG" && CONTIDA=0 || CONTIDA=$?
  case "$CONTIDA" in
    0) refuse "La version $TARGET_TAG est ANTÉRIEURE à celle déjà installée sur ce serveur.
     L'installer reviendrait à remonter le temps et à désactiver des choses que vous avez déjà.
     Je n'ai rien touché : ni la base, ni l'app — tout est comme avant.
     Si vous voulez VRAIMENT revenir à la $TARGET_TAG, lancez :
       bash hostgator-setup-kit/update.sh --to $TARGET_TAG --force" ;;
    2) refuse "Je n'ai pas pu avoir la CERTITUDE que la version $TARGET_TAG est plus récente que celle installée
     ici — la copie du code sur ce serveur est arrivée abrégée et je n'ai pas pu la compléter
     (le serveur doit pouvoir joindre GitHub pour cela).
     Je préfère ne rien toucher plutôt que de risquer de vous ramener à une version antérieure par erreur.
     Je n'ai rien touché. Réessayez dans quelques minutes ; si cela persiste, vérifiez l'internet du
     serveur. Pour installer quand même, à vos risques :
       bash hostgator-setup-kit/update.sh --to $TARGET_TAG --force" ;;
  esac
fi
if [ -n "$MESMA_TAG" ]; then
  c_ylw "Le code est déjà sur la $TARGET_TAG, mais l'app fait tourner une image ancienne. Je vais mettre à jour l'image."
else
  c_ylw "Je vais mettre à jour vers la version $TARGET_TAG en toute sécurité."
fi

# ── 2. Sauvegarde de sécurité AVANT de toucher à la base ─────────────────────
if [ -z "$SKIP_BACKUP" ]; then
  step "Sauvegarde de sécurité (avant de toucher à la base)"
  if bash "$(dirname "$0")/backup.sh"; then
    c_grn "✓ sauvegarde faite — si quelque chose tourne mal, vous pouvez restaurer (restore.sh)."
  else
    c_ylw "⚠ la sauvegarde a échoué. La mise à jour N'efface PAS de données (elle réorganise seulement les contacts),"
    c_ylw "  mais l'idéal est d'avoir une sauvegarde. Ctrl+C pour arrêter et enquêter ; je continue dans 8 s…"
    sleep 8
  fi
fi
# Prévient l'agent de l'hôte (si c'est lui qui pilote) — c'est ce qui fait avancer l'écran
# de mise à jour étape par étape pendant que l'app est encore debout.
[ -n "${DESKCOMM_AGENT_REPORT:-}" ] && eval "${DESKCOMM_AGENT_REPORT_CMD}" backup

# ── 3. Nouveau code ──────────────────────────────────────────────────────────
step "Téléchargement du nouveau code"
if ! git checkout --quiet "$TARGET_TAG" 2>&1; then
  die "Impossible de passer à la version $TARGET_TAG (il semble y avoir des modifications locales divergentes).
     Lancez 'git status' pour voir, ou demandez de l'aide. Je N'ai PAS touché la base — tout est comme avant."
fi
[ -n "${DESKCOMM_AGENT_REPORT:-}" ] && eval "${DESKCOMM_AGENT_REPORT_CMD}" codigo

# ── 4. Base : schéma + corrections de données (schéma AVANT l'app) ───────────
# Le baseline est idempotent et auto-réparateur. Le réappliquer sur une base qui existe DÉJÀ
# produit des erreurs du type « existe déjà » / « multiple primary keys » — c'est ATTENDU et
# inoffensif (ce sont des objets qui étaient déjà là). Nous filtrons ce bruit et ne
# montrons que les vrais problèmes.
# Réappliquer le baseline est du DDL, donc il passe par `url_do_schema` (_common.sh) et non
# par la chaîne de l'app : sur une installation en base auto-hébergée, avec le rôle restreint dans le
# `.env` comme nous le recommandons, cette étape se mettait à échouer en silence à chaque
# mise à jour — et c'est update.sh qui livre les nouvelles migrations au clone (issue #192).
step "Mise à jour de la base de données"
if [ -f neon/migrations/0001_whatsapp_os_baseline.sql ]; then
  # Extensions exigées par le schéma (idempotent ; identiques à install.sh).
  docker run --rm postgres:17-alpine psql "$(url_do_schema)" -c \
    "create extension if not exists vector with schema public; create extension if not exists citext with schema public; create extension if not exists pg_trgm with schema public;" \
    >/dev/null 2>&1 || true

  raw="$(docker run --rm -i -v "$PROJECT_DIR/neon/migrations/0001_whatsapp_os_baseline.sql:/b.sql:ro" \
        postgres:17-alpine psql "$(url_do_schema)" -f /b.sql 2>&1 || true)"

  # Erreurs bénignes en réappliquant sur une base existante :
  benign='already exists|multiple primary keys|multiple default values|is already a member|already a partition'
  unexpected="$(printf '%s\n' "$raw" | grep -iE 'ERROR|FATAL' | grep -viE "$benign" || true)"

  if [ -n "$unexpected" ]; then
    c_ylw "⚠ Des avertissements de base sont apparus qui NE sont PAS ceux attendus :"
    printf '%s\n' "$unexpected" | head -20
    c_ylw "  L'app peut encore fonctionner. Si quelque chose ne va pas, restaurez la sauvegarde (restore.sh)."
    case "$unexpected" in
      *permission\ denied*|*must\ be\ owner*|*droit\ refusé*)
        c_ylw "  Les erreurs sont des erreurs de PERMISSION : la connexion du .env n'est pas propriétaire de la base. Sur une base"
        c_ylw "  auto-hébergée, déclarez NEON_DATABASE_ADMIN_URL dans le .env — c'est elle qui exécute le schéma." ;;
    esac
  else
    c_grn "✓ base mise à jour (et conversations réorganisées, s'il y avait du désordre)."
  fi
else
  c_ylw "⚠ neon/migrations/0001_whatsapp_os_baseline.sql introuvable — partie base sautée."
fi
[ -n "${DESKCOMM_AGENT_REPORT:-}" ] && eval "${DESKCOMM_AGENT_REPORT_CMD}" banco

# ── 4.5 E-mails Neon Auth ────────────────────────────────────────────────────
# Les templates et la confirmation email restent gérés dans Neon Managed Better
# Auth. Aucune mise à jour ne tente d’appeler une API admin beta non validée.
c_ylw "⚠ Vérifiez la configuration des emails Neon Auth dans le panneau Neon si elle a changé."

# ── 5. Nouvelle app ──────────────────────────────────────────────────────────
step "Téléchargement de la nouvelle version de l'app et redémarrage"
# Image de la TAG publiée (pas un "latest" flottant) : garantit que le code (checkout
# ci-dessus) et l'image du conteneur sont toujours de la même version. Écrite dans le .env,
# pas seulement exportée : compose lit l'image depuis là, et un `up -d` lancé à la main
# ensuite reviendrait au ":latest" de l'installation — défaisant la mise à jour.
#
# Les TROIS images sont écrites ensemble, dans la même version. Le worker et le scheduler
# ont reçu une image publiée parce qu'avant, ils étaient `build:`-only dans le compose :
# `dc pull` les SAUTAIT (« Skipped - No image to be pulled ») et le `dc up -d` ci-dessous
# recréait le conteneur sur l'ancienne image, sans `--build`. Résultat : le worker
# — qui est le runtime de l'agent IA — restait figé sur le code du jour de
# l'installation et traversait toutes les mises à jour. C'est la ligne qui corrige
# cela pour le parc déjà installé, sans que personne n'ait à éditer de fichier.
#
# `gravar_imagens` résout aussi le pull_policy selon la mutabilité de la tag : comme
# ici la cible est toujours une tag de version (immuable), cela donne `missing`. En plus de
# tout, cela défait le "missing" qu'un rollback précédent laissait derrière lui — avant il
# restait dans le .env pour toujours, et le `up -d` manuel du propriétaire ne tirait plus jamais rien.
# Lu AVANT que `gravar_imagens` ne corrige — sinon l'information disparaît. C'est l'
# état que l'exécution PRÉCÉDENTE a laissé, et le propriétaire ne l'a jamais su : l'ancien `update.sh`
# n'écrit que `APP_IMAGE`, et le worker suit un canal mobile.
PIN_FALTANDO_ANTES="$(pin_incompleto .env)"

VERSAO_ALVO="${TARGET_TAG#v}"
export APP_IMAGE="${IMG_APP}:${VERSAO_ALVO}"
export WORKER_IMAGE="${IMG_WORKER}:${VERSAO_ALVO}"
export SCHEDULER_IMAGE="${IMG_SCHEDULER}:${VERSAO_ALVO}"
gravar_imagens .env "$VERSAO_ALVO"

# `dc pull` échoue si l'une des trois images n'existe pas encore dans le registre — ce
# qui arrive sur une installation qui se met à jour vers la première version publiée
# après ce changement, ou si une publication a cassé. Dans ce cas le compose
# a toujours `build:` à côté de l'`image:` du worker et du scheduler, donc le
# `up -d` les construit localement : pire que tirer, mieux que ne pas mettre à jour.
if ! dc pull; then
  # Le message distingue les deux cas parce que la conséquence est opposée, et une
  # phrase rassurante sur le mauvais cas est la pire issue possible : le
  # `worker` et le `scheduler` ont `build:` à côté de l'`image:` et le `up -d` les
  # construit ; l'`app` NON, donc si c'est son image qui manque, le `up -d`
  # meurt juste en dessous — et dire « je continue quand même » aurait été un mensonge.
  if dc pull app >/dev/null 2>&1; then
    c_ylw "⚠ Impossible de télécharger toutes les images de la version ${VERSAO_ALVO}."
    c_ylw "  Celle de l'app est arrivée ; ce qui manque est construit ici (plus lent, même résultat)."
  else
    c_ylw "⚠ Impossible de télécharger l'image de l'APP en version ${VERSAO_ALVO}."
    c_ylw "  Causes courantes : la version est encore en cours de publication, ou le paquet est privé sur GHCR."
    c_ylw "  Je vais essayer de démarrer quand même — en cas d'échec, relancez dans quelques minutes."
  fi
fi
# Le réseau du proxy externe est déclaré EXTERNE dans le compose : s'il a disparu
# (un `docker network prune`, ou le `down -v` que le kit lui-même enseigne comme
# chemin de redémarrage), le `up -d` ci-dessous meurt sur « network X declared as
# external, but could not be found » — et ce script tourne seul via agent.sh,
# donc personne ne lit l'écran pour déchiffrer cela. Même fonction qu'install.sh.
garantir_rede_do_proxy
dc up -d

# Le Caddyfile entre dans le conteneur par un bind mount d'UN FICHIER, et un bind mount de
# fichier reste attaché à l'inode. Le `git pull` n'édite pas le fichier : il en écrit un autre et
# renomme, générant un nouvel inode — le conteneur continue de lire l'ancien, pour
# toujours. Mesuré sur ce VPS : inode hôte 3283869, conteneur 3271833, avec
# l'ancien contenu à l'intérieur.
#
# Sans ce force-recreate, TOUT changement de proxy envoyé dans une mise à jour
# (y compris une correction de sécurité en bordure) disparaît en silence : la mise à jour dit
# « terminée » et l'ancienne configuration reste en vigueur.
#
# Avec un proxy externe il n'y a pas de Caddy à recréer — et le profil inactif
# de l'override ne suffit pas : nommer le service explicitement (`up -d ... caddy`) ACTIVE son
# profil dans Compose et démarre quand même le conteneur, en conflit direct
# avec Traefik sur les ports 80/443. Le résultat était un « ⚠ impossible de recréer le
# proxy » à CHAQUE mise à jour de qui utilise un proxy externe : fausse alarme, à un
# moment où le propriétaire doit faire confiance à ce qu'il lit.
if [ "${REVERSE_PROXY:-caddy}" = "traefik" ]; then
  c_grn "✓ proxy externe (Traefik) : Caddy n'est pas utilisé ici — rien à recharger"
else
  dc up -d --force-recreate --no-deps caddy >/dev/null 2>&1 \
    && c_grn "✓ proxy rechargé avec la configuration de cette version" \
    || c_ylw "⚠ impossible de recréer le proxy — lancez : docker compose $(dc_files) up -d --force-recreate caddy"
fi

# ── 6. L'app est-elle revenue en ligne ? ─────────────────────────────────────
step "Vérification du retour en ligne de l'app"
ok=""
wait_app_healthy 20 3 >/dev/null && ok=1
if [ -n "$ok" ]; then
  c_grn "✓ Mise à jour terminée — app en ligne et en bonne santé."
  # Dit à la fin, et non au début, parce que c'est ici que le propriétaire lit. Si l'exécution
  # précédente a laissé l'épinglage à moitié, il ne l'a jamais su — l'écran disait « terminée »
  # et le worker suivait un canal mobile. Maintenant il sait que cela a existé et que c'est fini.
  if [ -n "$PIN_FALTANDO_ANTES" ]; then
    c_ylw "  (au passage : la version de $PIN_FALTANDO_ANTES était flottante et vient d'être fixée)"
  fi
else
  c_ylw "⚠ J'ai mis à jour, mais l'app n'a pas répondu 'ok'. Voir les journaux :"
  c_ylw "  docker compose $(dc_files) logs --tail=50 app"
  # Code de sortie != 0 : c'est ce qu'agent.sh utilise pour savoir qu'il doit revenir
  # à l'image précédente (gardée par lui AVANT le pull). Sans cela, il n'existe aucun
  # filet de protection — la nouvelle app, cassée, resterait en ligne sans que personne ne le sache.
  exit 1
fi

# ── 7. Automatisations (cron du drain d'événements ; celui de l'écran est déjà actif depuis le bloc 0) ──
step "Vérification des automatisations"
ensure_encryption_key .env
setup_event_log_drain_cron
