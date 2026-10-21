#!/usr/bin/env bash
# Agent de mise à jour : tourne par cron toutes les 5 minutes sur l'HÔTE.
#
# Il NE reçoit PAS de commandes de l'app — il reçoit un booléen. Il annonce la version
# installée, lit dans la réponse si quelqu'un a cliqué sur « Mettre à jour maintenant » à l'écran et, si
# oui, lance l'update.sh de la tag publiée. C'est ce qui garde le CRM en conteneur sans
# aucun accès au Docker de l'hôte.
source "$(dirname "$0")/_common.sh"
enter_project

SECRET="${INTERNAL_CRON_SECRET:-${INTERNAL_SECRET:-}}"
[ -n "$SECRET" ] || exit 0
[ -n "${NEXT_PUBLIC_APP_URL:-}" ] || exit 0

API="${NEXT_PUBLIC_APP_URL}/api/v1/system/agent"
LOCK="${PROJECT_DIR}/.update.lock"
LOG="${PROJECT_DIR}/.update.log"
# Journal PERSISTANT (ajout) des échecs de communication/exécution — distinct du
# .update.log ci-dessus, qui est écrasé à chaque exécution d'update.sh. Un POST qui
# échoue en silence est le pire mode d'échec de cette fonctionnalité (le symptôme devient « le
# bouton n'apparaît pas » et personne ne sait pourquoi) ; tout ce qui n'est pas 2xx (ou un
# échec de commande que nous avons choisi de ne pas laisser tuer le script) tombe ici.
ERRLOG="${PROJECT_DIR}/.update-agent.log"

# _common.sh active `set -e -o pipefail`. Avec pipefail, TOUTE substitution de
# commande/pipe dont le statut n'est pas explicitement neutralisé tue le script
# sur place, sans rien afficher — pire encore après avoir répondu à l'app qu'il va
# exécuter (run "dispatched") : l'agent meurt, ne rapporte jamais, et le run reste
# bloqué pour toujours (l'index unique de la migration 0090 refuse toute nouvelle
# demande). Règle suivie ci-dessous : AUCUNE substitution ne peut faire tomber le script —
# soit la commande à l'intérieur a déjà son propre "|| true"/"|| echo" (git
# describe/rev-parse), soit l'affectation entière se termine par "|| true" — et une valeur
# vide résultante est toujours traitée explicitement, jamais laissée au `-e` pour
# décider à notre place.
log_err() {  # log_err <message> — écrit avec horodatage, tronque à ~200 lignes
  printf '%s [agent] %s\n' "$(date -u +%FT%TZ)" "$1" >> "$ERRLOG" || true
  { tail -n 200 "$ERRLOG" > "${ERRLOG}.tmp" && mv "${ERRLOG}.tmp" "$ERRLOG"; } 2>/dev/null || true
}

# Avant toute autre chose : cette copie du dépôt commande-t-elle ce projet Docker ?
#
# Tôt exprès — avant même d'ANNONCER la version. Une copie qui n'est pas propriétaire
# annoncerait la version de son arborescence, et l'app proposerait « Mettre à jour maintenant » sur
# la base d'un numéro qui ne décrit pas ce qui est en ligne.
recusar_projeto_de_outra_arvore log_err || exit 0

post() {  # post <json> → corps de la réponse en 2xx ; VIDE en cas d'échec
  # (l'appelant, ex. la boucle de nouvelle tentative du run_result, utilise « sorti vide » comme signal
  # d'échec — c'est pourquoi le corps n'est affiché que dans la branche de succès).
  local out http_code body
  out="$(curl -sS -X POST "$API" \
    -H "Authorization: Bearer ${SECRET}" \
    -H 'Content-Type: application/json' \
    --max-time 20 -d "$1" \
    -w $'\n%{http_code}' 2>&1)" || true
  http_code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  case "$http_code" in
    2[0-9][0-9])
      printf '%s' "$body"
      ;;
    *)
      log_err "POST ${API} -> ${out}"
      ;;
  esac
}

json_field() {  # json_field <corps> <champ> — sans jq, qui peut ne pas exister sur le VPS
  printf '%s' "$1" | tr ',' '\n' | grep -o "\"$2\":[^,}]*" | head -1 | cut -d: -f2- | tr -d '" '
}

# Échappe du texte pour qu'il tienne dans une chaîne JSON, sans dépendre de jq :
# 1) retire les caractères de contrôle C0 bruts (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F) et DEL — couvre
#    y compris les séquences ANSI (ESC=0x1B), que update.sh LUI-MÊME émet via
#    c_grn/c_ylw/c_red et qui apparaissent donc vraiment dans log_tail, pas seulement
#    en théorie ; \t et \n restent hors du -d parce qu'ils deviennent des marqueurs ci-dessous.
# 2) remplace tab/saut de ligne réels par des octets marqueurs (0x02/0x01 — déjà retirés
#    du texte par l'étape 1, donc ils n'entrent pas en collision avec le contenu réel).
# 3) échappe barre oblique inverse et guillemets du contenu ORIGINAL (avant de réintroduire
#    toute nouvelle barre oblique inverse).
# 4) remplace les marqueurs par les vraies séquences JSON (\t, \n) — via
#    tr/sed sur le FLUX entier, jamais par enregistrement (awk 'ORS=...' joint les
#    sauts de ligne avec un séparateur TOUJOURS ajouté, y compris après
#    le dernier enregistrement — cela inventait un "\n" de trop quand le texte ne
#    se termine pas par un vrai saut de ligne, ex. : troncature au milieu d'une ligne).
#
# `LC_ALL=C` à CHAQUE étage : sous une locale UTF-8 (la valeur par défaut sur Debian/Ubuntu,
# y compris via cron), `tr`/`sed` valident l'entrée comme du texte multioctet et
# ABANDONNENT avec « Illegal byte sequence » en rencontrant un octet invalide — et un octet
# invalide est exactement ce qui reste quand `head -c` coupe au milieu d'un
# caractère UTF-8 (trouvé en reproduisant exprès : le même bug que l'élément 1a,
# par une porte qui n'apparaît que sous locale UTF-8 — ça fonctionne sur la machine de qui
# teste en LC_ALL=C et meurt sur le VPS du client, qui tourne en UTF-8 par défaut). Avec
# `LC_ALL=C`, ces outils traitent l'entrée comme des octets bruts : ils ne
# valident jamais le multioctet, donc n'ont jamais de raison d'abandonner pour séquence illégale, sur
# aucun hôte.
esc() {
  printf '%s' "$1" \
    | LC_ALL=C tr -d '\000-\010\013\014\015\016-\037\177' \
    | LC_ALL=C tr '\t\n' '\002\001' \
    | LC_ALL=C sed 's/\\/\\\\/g; s/"/\\"/g' \
    | LC_ALL=C sed $'s/\002/\\\\t/g; s/\001/\\\\n/g'
}

# ── 1. Quelle version est installée et quelle est la dernière publiée ? ──────
FETCH_OK=1
git fetch --tags --quiet origin 2>/dev/null || FETCH_OK=0

CURRENT_TAG="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
CURRENT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
LATEST_TAG="$(git tag -l 'v*' --sort=-v:refname | head -1)" || true

# Gardé AVANT toute remise à zéro ci-dessous : « j'ai vu une tag » et « je n'ai pas annoncé »
# sont des choses différentes. Sans cela, un fork sans AUCUNE tag `v*` arrive à l'app
# avec la même combinaison qu'une installation qui contient déjà la dernière publiée
# (LATEST_TAG remis à zéro, compare_failed=false) — et l'écran n'a aucun moyen de savoir s'il
# est en avance sur une vraie release ou s'il n'y a jamais eu de release.
if [ -n "$LATEST_TAG" ]; then HAS_KNOWN_RELEASE=true; else HAS_KNOWN_RELEASE=false; fi

if [ -n "$CURRENT_TAG" ]; then
  CURRENT="$CURRENT_TAG"; OFF_RELEASE=false
else
  CURRENT="$CURRENT_SHA";  OFF_RELEASE=true
fi

# Une tag déjà CONTENUE dans ce qui tourne ici n'est pas une mise à jour — c'est un recul, et
# update.sh refuse de l'installer (sans --force). L'annoncer quand même allumerait
# à l'écran un bouton que l'agent est obligé de refuser ensuite : le même test d'
# ascendance aux deux bouts est ce qui empêche l'app de promettre ce que l'hôte
# ne tiendra pas. Sans tag annoncée, l'écran dit que l'installation est en avance
# sur la version publiée.
#
# Dans le doute (dépôt superficiel qu'on n'a pas pu compléter), il N'annonce pas non plus :
# proposer le bouton serait proposer ce qu'update.sh va refuser de l'autre côté.
#
# Mais « je n'ai pas annoncé » et « il n'existe pas de nouvelle version » sont des choses DIFFÉRENTES, et l'app
# n'a aucun moyen de les distinguer en regardant un champ vide — il lirait le
# silence comme une bonne nouvelle et dirait « vous êtes à jour » à une installation
# en retard. C'est pourquoi le « je ne sais pas » voyage explicitement dans le heartbeat.
COMPARE_FAILED=false
if [ -n "$LATEST_TAG" ]; then
  is_already_in_head "$LATEST_TAG" && CONTIDA=0 || CONTIDA=$?
  [ "$CONTIDA" = 2 ] && COMPARE_FAILED=true
  [ "$CONTIDA" = 1 ] || LATEST_TAG=""   # 0 = recul, 2 = je ne sais pas : dans les deux cas, n'annonce pas
fi
# Sans aucune tag connue ET sans avoir réussi à récupérer : impossible aussi
# d'affirmer qu'il n'y a pas de nouvelle version — nous ne savons même pas s'il en existe une publiée.
[ -z "$LATEST_TAG" ] && [ "$FETCH_OK" = 0 ] && COMPARE_FAILED=true

CHANGELOG=""
if [ -n "$LATEST_TAG" ] && [ "$LATEST_TAG" != "$CURRENT" ]; then
  # Coupe à 30000 octets BRUTS, pas 60000 : le plafond Zod (CHANGELOG_MAX_BYTES,
  # lib/system/changelog.ts) est 64000 et vaut sur la chaîne DÉJÀ ÉCHAPPÉE — chaque
  # guillemet/barre/tab/saut de ligne double de taille dans l'esc() ci-dessus. Couper
  # brut à 60000 ne donnait que 6,7 % de marge : un changelog technique (extraits de
  # code, regex) dépasserait 64000 échappé sans jamais atteindre 60000 brut, et le
  # HEARTBEAT ENTIER mourrait en 422 — sans court-circuit, il meurt en silence.
  # 30000 brut garantit ≤60000 échappé même dans le pire cas (100 % du texte
  # échappé 2x), avec de la marge sous le plafond de 64000.
  CHANGELOG="$(git show "${LATEST_TAG}:CHANGELOG.md" 2>/dev/null | head -c 30000 || true)"
  # `head -c` coupe à un octet fixe, et le CHANGELOG a des emoji/accents multioctets
  # (UTF-8) — une coupure au milieu d'un caractère casserait le JSON d'une façon
  # difficile à tracer. `iconv -c` jette l'octet incomplet de la fin sans
  # dépendre de ce que la coupure tombe « juste ». Gardé par `command -v` : s'il manque sur
  # l'hôte, nous sautons le nettoyage (le changelog reste tel quel, brut) au lieu que le
  # changelog entier disparaisse en silence à cause d'une dépendance absente.
  if command -v iconv >/dev/null 2>&1; then
    CHANGELOG="$(printf '%s' "$CHANGELOG" | iconv -f UTF-8 -t UTF-8 -c 2>/dev/null || true)"
  fi
fi

# Ceinture et bretelles : le "LC_ALL=C" ci-dessus rend déjà esc() incapable d'abandonner
# pour séquence invalide, mais la mort de l'agent est assez grave (run
# bloqué pour toujours) pour justifier la redondance explicite du "|| true".
# Épinglage à moitié : l'app fixée sur une version et le worker/scheduler suivant un canal
# mobile. C'est l'état que laisse la PREMIÈRE mise à jour d'une installation héritée —
# mesuré en répétition et en production —, et l'`update.sh` qui le produit est l'ancien, qui
# ne sait pas avertir. Cet agent est le seul qui tourne APRÈS lui avec déjà le nouveau kit
# sur le disque (cron de 5 min, relu à chaque exécution), donc c'est par ici que
# l'information atteint qui s'est arrêté à la première et n'est pas revenu.
#
# Il AVERTIT, il ne corrige pas. Écrire dans le `.env` d'une installation d'autrui est un changement de
# comportement et exige une décision de l'opérateur — pas d'un cron.
# Comble le vide tout seul, et seulement le vide. L'état dure au plus un cycle de
# cron (5 min) au lieu de durer jusqu'à ce que quelqu'un relance la mise à jour — ce qui était ce qui
# arrivait, parce que l'écran disait « terminée » et personne ne revient.
PIN_CORRIGIDO="$(completar_pin_ausente .env)" || PIN_CORRIGIDO=""
[ -n "$PIN_CORRIGIDO" ] && log_err "j'ai fixé la version de $PIN_CORRIGIDO dans le .env (elle n'avait pas de version fixe ; j'ai utilisé celle qui tournait déjà)"

# Ce qui reste après correction : une valeur explicite sur un canal mobile, qui est une décision
# de l'opérateur et à laquelle on ne touche pas. Ici on avertit seulement.
PIN_FALTANDO="$(pin_incompleto .env)" || PIN_FALTANDO=""

BODY="{\"kind\":\"heartbeat\",\"current_version\":\"${CURRENT}\",\"current_sha\":\"${CURRENT_SHA}\",\"off_release\":${OFF_RELEASE},\"latest_version\":\"${LATEST_TAG}\",\"compare_failed\":${COMPARE_FAILED},\"has_known_release\":${HAS_KNOWN_RELEASE},\"changelog\":\"$(esc "$CHANGELOG")\"}" || true

# Seulement dans le journal de l'hôte, exprès. L'envoyer dans le heartbeat serait inutile : le
# schéma de la route est un `z.object` sans `.strict()`, donc Zod JETTE une clé
# inconnue en silence — le champ voyagerait et n'arriverait nulle part,
# ce qui est la définition d'un contrôle décoratif. Quand l'app apprendra le champ, alors
# il entrera dans le BODY avec le reste.
if [ -n "$PIN_FALTANDO" ]; then
  log_err "la version de $PIN_FALTANDO est flottante (elle suit un canal, pas une version fixe) — lancez 'bash hostgator-setup-kit/update.sh' une fois de plus pour la fixer"
fi
RESP="$(post "$BODY")"

[ "$(json_field "$RESP" update_requested)" = "true" ] || exit 0
RUN_ID="$(json_field "$RESP" run_id)" || true
[ -n "$RUN_ID" ] || exit 0

# ── 2. Quelqu'un l'a demandé. Une mise à jour à la fois. ────────────────────
exec 9>"$LOCK"
flock -n 9 || exit 0

report() { post "{\"kind\":\"run_progress\",\"run_id\":\"${RUN_ID}\",\"step\":\"$1\"}" >/dev/null; }

# Garde l'image en cours d'exécution AVANT de tirer la nouvelle : c'est par là qu'on revient
# si la nouvelle app ne démarre pas. `docker compose images -q` peut sortir != 0 chaque
# fois que le daemon hoquette, que l'app n'est pas debout, ou qu'il y a un problème de
# permission — des choses normales sur un VPS qui lance ceci toutes les 5 minutes, pour
# toujours ; sans le "|| true" cela faisait déjà tomber l'agent AVANT même d'appeler
# update.sh (trouvé seulement en lançant exprès avec la commande en échec).
PREV_IMAGE="$(dc images -q app 2>/dev/null | head -1)" || true
# Le worker et le scheduler sont devenus des images publiées et épinglées sur la même
# version que l'app (avant ils étaient `build:`-only et aucune mise à jour ne les atteignait). Cela
# a un coût ici : un rollback qui ne ramènerait QUE l'app laisserait le parc avec
# l'app sur l'ancienne version et worker/scheduler sur la nouvelle — un mélange de versions que la
# doctrine de packaging existe pour empêcher. Donc les trois reviennent ensemble.
#
# SEULEMENT sur une installation déjà passée par le nouvel update.sh — c'est-à-dire dont le .env
# a déjà WORKER_IMAGE/SCHEDULER_IMAGE. Sur une installation HÉRITÉE, `images -q` renvoie
# l'ID de l'ancienne image, et l'écrire dans le .env serait pire que de ne rien ramener : le
# scheduler hérité était `alpine:3.20` avec le crontab monté par une `command:`
# en ligne que ce compose n'a plus. Épingler cet ID laisserait le conteneur
# tourner avec le CMD d'alpine nu — il sort aussitôt, et `restart: unless-stopped` le
# remet en boucle de plantage. Les 16 crons s'arrêteraient, en silence, écrit dans le .env.
if grep -qE '^WORKER_IMAGE=' .env 2>/dev/null; then
  PREV_WORKER_IMAGE="$(dc images -q worker 2>/dev/null | head -1)" || true
fi
if grep -qE '^SCHEDULER_IMAGE=' .env 2>/dev/null; then
  PREV_SCHEDULER_IMAGE="$(dc images -q scheduler 2>/dev/null | head -1)" || true
fi
PREV_WORKER_IMAGE="${PREV_WORKER_IMAGE:-}"
PREV_SCHEDULER_IMAGE="${PREV_SCHEDULER_IMAGE:-}"
if [ -z "$PREV_IMAGE" ]; then
  # Enregistré, pas ignoré : sans image précédente connue, si update.sh
  # échoue plus loin il N'Y A AUCUN moyen de revenir — le statut sortira "failed", jamais
  # "failed_rolled_back", et il est important qu'un humain puisse savoir pourquoi
  # (docker hors service ? première exécution, sans stack encore debout ? etc.)
  # en regardant le journal au lieu de deviner.
  log_err "PREV_IMAGE vide (docker compose images -q app n'a rien renvoyé) — le rollback ne sera pas possible si la mise à jour échoue"
fi

# update.sh tourne dans un processus bash SÉPARÉ (via `bash fichier`, pas `source`).
# report() appelle post(), qui lit à son tour $API/$SECRET/$ERRLOG, et le corps
# même de report() référence $RUN_ID — rien de cela ne traverse vers le processus
# enfant sans export explicite : sans cela, report() « fonctionne » (ne casse pas la
# mise à jour) mais tout run_progress échoue en silence (trouvé en tournant pour de vrai :
# la 1re tentative a donné « post : commande introuvable » ; une fois corrigé, la 2e a donné
# 422 « Invalid UUID » — RUN_ID arrivait vide dans l'enfant). `declare -f` doit aussi
# inclure post, pas seulement report.
export API SECRET ERRLOG RUN_ID
# Sans tag annoncée (installation en avance sur la dernière publiée, ou sans tags),
# lance sans --to : update.sh résout la cible tout seul et refuse en français ce
# qui n'est pas une vraie mise à jour — la raison arrive à l'écran par le log_tail,
# au lieu que le run disparaisse sans explication.
UPDATE_ARGS=()
[ -n "$LATEST_TAG" ] && UPDATE_ARGS=(--to "$LATEST_TAG")
set +e
DESKCOMM_AGENT_REPORT=1 \
DESKCOMM_AGENT_PREV_IMAGE="$PREV_IMAGE" \
DESKCOMM_AGENT_REPORT_CMD="$(declare -f post report log_err); report" \
  bash "$(dirname "$0")/update.sh" "${UPDATE_ARGS[@]+"${UPDATE_ARGS[@]}"}" >"$LOG" 2>&1
RC=$?
set -e

# ── 3. L'app est-elle revenue ? Sinon, ramène l'image précédente. ───────────
STATUS="success"
if [ $RC -eq "$REFUSED_RC" ]; then
  # update.sh a refusé AVANT de toucher à quoi que ce soit (cible antérieure à celle
  # installée, ou impossible d'avoir la certitude). Il n'y a rien à défaire : redémarrer le
  # conteneur et réécrire le .env ici serait inventer un dégât — et rapporter
  # « je suis revenu à la version précédente » serait le mensonge que cette fonctionnalité a passé une
  # vague entière à corriger. La raison en français est déjà dans le journal.
  STATUS="failed"
elif [ $RC -ne 0 ]; then
  STATUS="failed"
  if [ -n "$PREV_IMAGE" ]; then
    # Les services que nous pouvons ramener. Worker et scheduler n'entrent que si leur
    # `images -q` a répondu : sur une installation qui n'avait pas encore les
    # nouvelles images, ramener l'app seule reste le bon comportement,
    # et c'est mieux que de ne rien ramener.
    ROLLBACK_ARGS=(app)
    [ -n "$PREV_WORKER_IMAGE" ] && ROLLBACK_ARGS+=(worker)
    [ -n "$PREV_SCHEDULER_IMAGE" ] && ROLLBACK_ARGS+=(scheduler)

    if APP_IMAGE="$PREV_IMAGE" APP_PULL_POLICY=missing \
       WORKER_IMAGE="${PREV_WORKER_IMAGE:-}" WORKER_PULL_POLICY=missing \
       SCHEDULER_IMAGE="${PREV_SCHEDULER_IMAGE:-}" SCHEDULER_PULL_POLICY=missing \
         dc up -d "${ROLLBACK_ARGS[@]}" >>"$LOG" 2>&1; then
      STATUS="failed_rolled_back"
      # Rend le retour persistant : update.sh a déjà écrit les NOUVELLES images (cassées) dans le
      # .env avant le pull. Sans réécrire ici, le prochain `up -d` — celui du
      # client, des semaines plus tard — ramènerait l'app cassée et déferait le
      # rollback en silence. Les ID gardés sont LOCAUX (pas des tags du
      # registre), donc la politique de pull doit suivre.
      set_env_var .env APP_IMAGE "$PREV_IMAGE"
      set_env_var .env APP_PULL_POLICY missing
      if [ -n "$PREV_WORKER_IMAGE" ]; then
        set_env_var .env WORKER_IMAGE "$PREV_WORKER_IMAGE"
        set_env_var .env WORKER_PULL_POLICY missing
      fi
      if [ -n "$PREV_SCHEDULER_IMAGE" ]; then
        set_env_var .env SCHEDULER_IMAGE "$PREV_SCHEDULER_IMAGE"
        set_env_var .env SCHEDULER_PULL_POLICY missing
      fi
    fi
  fi
fi

TAIL="$(esc "$(tail -40 "$LOG" || true)")" || true

# L'app vient de redémarrer : insiste pendant ~2 min avant d'abandonner.
for _ in $(seq 1 12); do
  OUT="$(post "{\"kind\":\"run_result\",\"run_id\":\"${RUN_ID}\",\"status\":\"${STATUS}\",\"log_tail\":\"${TAIL}\"}")"
  [ -n "$OUT" ] && break
  sleep 10
done
