#!/usr/bin/env bash
#
# DeskcommCRM — installateur auto-hébergé pour VPS (HostGator).
#
# Idempotent : peut être relancé sans rien casser. Dépendances sur l'hôte :
# seulement docker, docker compose, git, openssl, curl. psql/bootstrap tournent via Docker.
#
# Usage :
#   bash install.sh            # interactif (demande ce qui manque)
#   bash install.sh --yes      # non interactif (utilise le .env déjà rempli)
#
set -euo pipefail

# Répertoire où vivent ce script (et _common.sh, son frère) — capturé AVANT
# tout 'cd' (l'étape 2 peut entrer dans un dépôt cloné à part).
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

REPO_URL="${REPO_URL:-https://github.com/melgarafael/DeskcommCRM.git}"
# Une constante, deux usages (la fin heureuse et la fin bloquée) — et comecar.sh a sa
# jumelle. Un lien répété à la main devient un lien divergent au premier changement.
COMUNIDADE_URL="https://lp-comunidade.automatiklabs.com.br"
REPO_DIR="${REPO_DIR:-deskcommcrm}"
COMPOSE="docker-compose.prod.yml"
COMPOSE_TRAEFIK="docker-compose.traefik.yml"
NONINTERACTIVE=0
[ "${1:-}" = "--yes" ] && NONINTERACTIVE=1

# Ce script est autonome exprès (il tourne avant le clone, donc impossible
# d'utiliser _common.sh). Les deux fonctions ci-dessous sont les jumelles de celles de là-bas — si vous
# modifiez l'une, modifiez l'autre.
dc() {
  if [ "${REVERSE_PROXY:-caddy}" = "traefik" ]; then
    docker compose -f "$COMPOSE" -f "$COMPOSE_TRAEFIK" "$@"
  else
    docker compose -f "$COMPOSE" "$@"
  fi
}
dc_files() {
  if [ "${REVERSE_PROXY:-caddy}" = "traefik" ]; then
    printf -- '-f %s -f %s' "$COMPOSE" "$COMPOSE_TRAEFIK"
  else
    printf -- '-f %s' "$COMPOSE"
  fi
}

# ── Apparence ───────────────────────────────────────────────────────────────
# Couleur seulement quand il y a un vrai terminal. Avant, l'ANSI sortait toujours, y compris
# quand la sortie va dans un fichier — agent.sh redirige update.sh (`>
# "$LOG"`) et l'esc() de là-bas doit balayer octet par octet pour retirer ces échappements
# du heartbeat. Couper à la source est la correction de fond. NO_COLOR est la
# convention qu'attend qui tourne en CI ; FORCE_COLOR est la soupape de qui veut
# de la couleur même dans un pipe.
if   [ -n "${NO_COLOR:-}" ];    then COLOR=0
elif [ -n "${FORCE_COLOR:-}" ]; then COLOR=1
elif [ -t 1 ];                  then COLOR=1
else                                 COLOR=0
fi

# paint <code ANSI> <texte…>. Sans couleur, affiche le texte brut — il ne disparaît jamais.
paint() { local code="$1"; shift; if [ "$COLOR" = 1 ]; then printf '\033[%sm%s\033[0m\n' "$code" "$*"; else printf '%s\n' "$*"; fi; }
c_red() { paint 31 "$*"; }
c_grn() { paint 32 "$*"; }
c_ylw() { paint 33 "$*"; }
c_dim() { paint 2  "$*"; }
die()   { c_red "✖ $*"; exit 1; }
step()  { printf '\n'; paint 1 "▶ $*"; }

# La réponse est-elle oui ? Accepte ce que les gens tapent vraiment : o, O, oui, OUI, y,
# yes, avec des espaces autour (s/sim restent acceptés pour les anciens scripts). Chaque invite comparait la réponse à une chaîne
# exacte, donc « O » et « oui » — la bonne réponse, avec la mauvaise touche — tombaient dans la
# branche du NON. Au contrôle DNS, cela terminait l'installation avec une phrase qui ne
# correspondait même pas au choix de la personne. Jumelle de celle de _common.sh : si vous modifiez l'une,
# modifiez l'autre. Couverte par test-validators.sh.
resposta_sim() {
  local r
  r="$(printf '%s' "${1:-}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
  case "$r" in o|oui|s|sim|y|yes) return 0;; *) return 1;; esac
}

# ── Phases du parcours ──────────────────────────────────────────────────────
# Les étapes techniques (step) sont nombreuses et certaines sont conditionnelles — les numéroter
# donnerait un « 7 sur 11 » qui change selon le chemin de chaque installation. Les PHASES
# sont stables : c'est la carte que la personne suit pour savoir où elle en est et
# combien il reste, dans un processus qui prend des minutes et qui est son premier contact avec
# le produit.
FASE_TOTAL=4
fase() { printf '\n'; paint 1 "━━━ Phase $1/$FASE_TOTAL · $2"; }

# ── Marque ──────────────────────────────────────────────────────────────────
# Logo en blocs (police ANSI Shadow). Les blocs sortent dans le MÊME vert que le « ✓ » déjà
# utilisé ici, et le relief (═╗║╝╚╔) en atténué : ce duo se lit aussi bien sur un terminal à
# fond sombre que clair, sans avoir besoin de détecter le thème — une couleur d'accent
# claire disparaîtrait dans le blanc de qui utilise un terminal clair.
#
# La peinture se fait par substitution littérale de chaîne (${x//…}), pas par classe de
# caractères dans sed/awk : sous LC_ALL=C ces outils traitent l'entrée comme des
# OCTETS, et tous ces glyphes commencent par 0xE2 — une classe [╗║…] correspondrait
# à un morceau de █ et brouillerait le dessin sur le VPS de qui tourne en locale C.
LOGO_COLS=71
banner() {
  local cols linha ch
  cols="$(tput cols 2>/dev/null || echo 80)"
  case "$cols" in ''|*[!0-9]*) cols=80;; esac
  printf '\n'
  # Un terminal étroit reçoit la version sur une ligne : un logo cassé au milieu est
  # pire que pas de logo du tout.
  if [ "$COLOR" != 1 ] || [ "$cols" -lt $((LOGO_COLS + 2)) ]; then
    paint 1 "  DESKCOMM"
  else
    # Écran propre : retire le bruit du clone/apt au-dessus du logo. Exige un vrai
    # TTY (COLOR=1 ne suffit pas) : avec FORCE_COLOR sur une sortie redirigée, un
    # « effacer l'écran » au milieu du fichier est un déchet que personne n'a demandé.
    [ -t 1 ] && printf '\033[2J\033[H'
    while IFS= read -r linha; do
      linha="${linha//█/$'\033[32m'█$'\033[0m'}"
      for ch in ═ ╗ ║ ╝ ╚ ╔; do linha="${linha//$ch/$'\033[2m'$ch$'\033[0m'}"; done
      printf '  %s\n' "$linha"
    done <<'LOGO'
██████╗ ███████╗███████╗██╗  ██╗ ██████╗ ██████╗ ███╗   ███╗███╗   ███╗
██╔══██╗██╔════╝██╔════╝██║ ██╔╝██╔════╝██╔═══██╗████╗ ████║████╗ ████║
██║  ██║█████╗  ███████╗█████╔╝ ██║     ██║   ██║██╔████╔██║██╔████╔██║
██║  ██║██╔══╝  ╚════██║██╔═██╗ ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║
██████╔╝███████╗███████║██║  ██╗╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║
╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝
LOGO
  fi
  printf '\n'
  c_dim "  Des agents qui vendent sur WhatsApp, au cœur de votre CRM."
  c_dim "  Open source · tourne sur votre serveur · vos données restent à vous."
}

# ── Filet de sécurité : aucune sortie silencieuse ───────────────────────────
# Avant, toute commande qui échouait sous `set -e` faisait tomber le script sans
# rien dire (le cas réel : un psql avec une connection string erronée sortait avec
# le code 2 dans une substitution, et la personne voyait seulement le terminal revenir).
# L'installation est le premier contact avec le produit : mourir en silence ici, c'est perdre
# l'utilisateur. Ce trap garantit que TOUTE sortie != 0 explique quoi faire.
show_recovery() {
  local dir="${PROJECT_DIR:-$(pwd)}"
  c_red ""
  c_red "═══════════════════════════════════════════════════════"
  c_red " L'installation s'est arrêtée. Rien n'est resté à moitié sans remède."
  c_red "═══════════════════════════════════════════════════════"
  printf '\n%s\n\n' "Comment revenir en arrière et tout recommencer :"
  printf '  %s\n' "cd ${dir}"
  printf '  %s\n' "rm -f .env                                    # efface la configuration saisie"
  printf '  %s\n' "docker compose $(dc_files) down -v          # arrête ce qui a démarré"
  printf '  %s\n' "bash ${KIT_DIR:-hostgator-setup-kit}/install.sh   # recommence"
  printf '\n%s\n' "Si le schéma a déjà été appliqué et que vous voulez de nouveau une base propre,"
  printf '%s\n'   "ouvrez Supabase > SQL Editor et lancez (ATTENTION : efface toutes les données) :"
  printf '  %s\n\n' "drop schema public cascade; create schema public;"
}
trap 'rc=$?; [ "$rc" -ne 0 ] && show_recovery; exit $rc' EXIT

# ── Validateurs ─────────────────────────────────────────────────────────────
# Chaque validateur reçoit la valeur, affiche l'explication du problème en français
# et renvoie != 0. Ils tournent AVANT que la valeur n'entre dans le .env — c'est le seul moment où
# la personne peut encore corriger sans rien défaire. Une donnée erronée qui passe
# d'ici n'apparaît que des minutes plus tard, comme erreur technique ailleurs.

# Lit une claim d'un JWT (clés héritées 'eyJ...'). Ne sert qu'à
# donner un meilleur message d'erreur — c'est l'appel HTTP réel qui décide vraiment.
jwt_claim() {
  local p="${1#*.}"; p="${p%%.*}"
  p="${p//-/+}"; p="${p//_//}"
  case $(( ${#p} % 4 )) in 2) p="${p}==";; 3) p="${p}=";; esac
  printf '%s' "$p" | base64 -d 2>/dev/null \
    | grep -o "\"$2\":\"[^\"]*\"" | head -1 | cut -d'"' -f4
}
# Référence du projet (le 'abcdef' de https://abcdef.supabase.co)
sb_ref() { local u="${1#https://}"; printf '%s' "${u%%.*}"; }

v_domain() {
  case "$1" in
    http*) echo "Tapez seulement le domaine, sans https:// — ex. : crm.votreentreprise.com"; return 1;;
    */*)   echo "Tapez seulement le domaine, sans barre ni chemin — ex. : crm.votreentreprise.com"; return 1;;
    *.*)   return 0;;
    *)     echo "Cela ne ressemble pas à un domaine (il manque le point) — ex. : crm.votreentreprise.com"; return 1;;
  esac
}

v_email() {
  case "$1" in *@*.*) return 0;; esac
  echo "E-mail invalide — il faut un @ et un domaine, ex. : vous@votreentreprise.com"
  return 1
}

# La couleur de la marque. N'accepte QUE `#` + 6 chiffres hex, et cette étroitesse est mesurée, pas
# une question de goût : `marca-emails.sh:125` reconnaît exactement cette forme et retombe en silence sur le
# vert du produit pour toute autre (`case "$ACCENT" in \#[0-9a-fA-F]x6`),
# alors que l'`ehHexValido` de `lib/branding/rampa.ts:49` accepte quatre formes de plus
# (`#abc`, `abc`, `aabbcc` en plus de `#aabbcc`) et colore l'écran avec. Un
# validateur laxiste produirait la pire issue possible : la couleur du revendeur à
# l'ÉCRAN et le vert du produit dans le PREMIER e-mail que reçoit son client — et
# une marque coupée en deux, personne ne la remarque, parce que chaque moitié semble correcte seule.
#
# Le vide passe parce que le champ est optionnel. Dans l'entretien, `ask_one` n'appelle même pas
# le validateur dans ce cas (il traite `-z "$input"` avant), donc le `''` ici est
# pour qui réutiliserait la fonction ailleurs — et pour que retirer l'`opcional` du champ
# demain ne devienne pas une installation bloquée chez qui ne veut aucune couleur.
v_hex() {
  case "$1" in ''|'#'[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) return 0;; esac
  echo "Utilisez un code couleur comme #7a5cd6 — dièse et 6 chiffres —, ou Entrée pour la couleur du système"
  return 1
}

v_url() {
  case "$1" in
    https://*) ;;
    *) echo "L’URL doit commencer par https://."; return 1;;
  esac
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$1" 2>/dev/null)" || code=000
  if [ "$code" = "000" ]; then
    echo "Impossible d’atteindre $1 — vérifiez le domaine et le réseau du VPS."
    return 1
  fi
  return 0
}

# Neon Auth JWT : la signature et les claims sont vérifiés par Neon. Ici le kit
# refuse seulement les valeurs manifestement tronquées et ne tente jamais un
# endpoint admin beta avec un secret fourni par l’opérateur.
v_neon_jwt() {
  case "$1" in
    eyJ*.*.*) return 0;;
    *) echo "Le JWT Neon semble tronqué (format attendu : trois segments séparés par des points)."; return 1;;
  esac
}
v_anon()    { v_neon_jwt "$1"; }
v_service() { v_neon_jwt "$1"; }

v_db_url() {
  case "$1" in
    postgres://*|postgresql://*) ;;
    *) echo "La connection string commence par postgresql:// — copiez-la dans Settings > Database > Connection string, format URI."; return 1;;
  esac
  case "$1" in
    *"[YOUR-PASSWORD]"*|*"[SUA-SENHA]"*|*"[your-password]"*)
      echo "Vous avez collé la chaîne avec [YOUR-PASSWORD] au milieu — remplacez-le par le mot de passe de la base (celui défini à la création du projet)."; return 1;;
  esac
  case "$1" in
    *db.*.supabase.co*)
      echo "C'est la « Direct connection » de Supabase — elle n'existe qu'en IPv6 et le VPS est en IPv4, donc elle ne se connecte jamais."
      echo "   👉 Retournez dans Settings > Database et copiez celle du Session pooler (l'hôte se termine par .pooler.supabase.com)."
      return 1;;
  esac
  # Même famille de projet ? (l'utilisateur du pooler est 'postgres.<ref>')
  local dbref="${1#*://}"; dbref="${dbref%%:*}"; dbref="${dbref#postgres.}"
  # Seul le CLOUD a un <ref> à comparer. Et la décision se fait par l'HÔTE, jamais par la chaîne
  # entière : `case "$url" in *.supabase.co)` ne correspond que si l'URL SE TERMINE ainsi, et
  # elle arrive avec une barre finale, un chemin ou une espace collée — c'est ce que livre la barre d'adresse
  # du navigateur. Mesuré : avec `https://<ref>.supabase.co/` la comparaison était
  # sautée et une connection string d'un AUTRE projet passait, ce qui installe le
  # baseline.sql dans une base et laisse l'app parler à une autre.
  local sbhost="${NEON_DATA_API_URL:-}"
  sbhost="${sbhost#*://}"; sbhost="${sbhost%%/*}"
  sbhost="${sbhost%%[[:space:]]*}"; sbhost="${sbhost%%:*}"
  case "$sbhost" in
    *.supabase.co)
      if [ "$dbref" != "postgres" ] \
         && [ "$dbref" != "$(sb_ref "$NEON_DATA_API_URL")" ]; then
        echo "Cette connection string est celle du projet '${dbref}', mais l'URL que vous avez donnée est celle du projet '$(sb_ref "$NEON_DATA_API_URL")'. Ce doit être le même projet."
        return 1
      fi;;
  esac
  local out
  if out="$(docker run --rm postgres:17-alpine psql "$1" -tAc 'select 1' 2>&1)"; then
    return 0
  fi
  echo "Impossible de se connecter à la base. Postgres a répondu :"
  printf '   %s\n' "$(printf '%s' "$out" | head -2)"
  case "$out" in
    *"could not translate host name"*)
      echo "   👉 C'est presque toujours le mot de passe avec un caractère spécial : dans l'URL il doit être encodé."
      echo "      Remplacez  @ par %40   :  par %3A   /  par %2F   ?  par %3F   #  par %23";;
    *"password authentication failed"*)
      echo "   👉 Mauvais mot de passe de la base. C'est le mot de passe du PROJET (défini à sa création), pas celui de votre compte Supabase."
      echo "      Vous pouvez le réinitialiser dans Settings > Database > Reset database password.";;
    *"Network is unreachable"*|*"Cannot assign requested address"*)
      echo "   👉 C'est le problème d'IPv6 : utilisez la connection string du Session pooler, pas la Direct connection.";;
  esac
  return 1
}

v_anthropic() {
  case "$1" in sk-ant-*) ;; *) echo "La clé Anthropic commence par 'sk-ant-'. Récupérez-la sur console.anthropic.com > API Keys."; return 1;; esac
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://api.anthropic.com/v1/models \
    -H "x-api-key: $1" -H "anthropic-version: 2023-06-01" 2>/dev/null)" || code=000
  case "$code" in
    2*) return 0;;
    000) c_ylw "  ⚠ impossible de vérifier la clé en ligne ; je continue avec elle."; return 0;;
    401) echo "Anthropic a refusé cette clé (401). Vérifiez qu'elle est active et copiée en entier."; return 1;;
    *)   c_ylw "  ⚠ Anthropic a répondu ${code} au test de la clé ; je continue avec elle."; return 0;;
  esac
}

# OpenRouter est entré dans la liste des fournisseurs (option [1] de la question sur l'IA
# qui répondra) sans que ce validateur existe. `ask_one` appelle le validateur
# par son NOM — `"$validator" "$input"` —, donc un nom inexistant devient exit 127
# et la boucle répète la question à l'infini : la personne qui choisit [1] ne peut pas
# terminer l'installation. Et sur le chemin `--yes` la même absence devient
# « OPENROUTER_API_KEY invalide » suivi de « Corrigez le .env et relancez » —
# instruction impossible à suivre, parce que le .env est correct.
v_openrouter() {
  case "$1" in sk-or-*) ;; *) echo "La clé OpenRouter commence par 'sk-or-'. Récupérez-la sur openrouter.ai/keys."; return 1;; esac
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://openrouter.ai/api/v1/key \
    -H "Authorization: Bearer $1" 2>/dev/null)" || code=000
  case "$code" in
    2*) return 0;;
    000) c_ylw "  ⚠ impossible de vérifier la clé en ligne ; je continue avec elle."; return 0;;
    401) echo "OpenRouter a refusé cette clé (401). Vérifiez qu'elle est active et copiée en entier."; return 1;;
    *)   c_ylw "  ⚠ OpenRouter a répondu ${code} au test de la clé ; je continue avec elle."; return 0;;
  esac
}

v_openai() {
  [ -z "$1" ] && return 0   # optionnel
  case "$1" in sk-*) ;; *) echo "La clé OpenAI commence par 'sk-'. Récupérez-la sur platform.openai.com > API keys (ou laissez vide)."; return 1;; esac
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://api.openai.com/v1/models \
    -H "Authorization: Bearer $1" 2>/dev/null)" || code=000
  case "$code" in
    2*) return 0;;
    000) c_ylw "  ⚠ impossible de vérifier la clé en ligne ; je continue avec elle."; return 0;;
    401) echo "OpenAI a refusé cette clé (401). Vérifiez qu'elle est active et copiée en entier."; return 1;;
    *)   c_ylw "  ⚠ OpenAI a répondu ${code} au test de la clé ; je continue avec elle."; return 0;;
  esac
}

v_password() {
  [ "${#1}" -ge 8 ] && return 0
  echo "Mot de passe trop court (${#1} caractères). Utilisez-en au moins 8 — c'est le mot de passe admin de votre CRM."
  return 1
}

# ── Pose une question, valide, et accepte 'retour' ──────────────────────────
# Renvoie 0 quand la valeur a été acceptée, 2 quand la personne a demandé à revenir en arrière.
# Répète la question tant que le validateur refuse : l'installateur ne laisse plus
# personne avancer avec une donnée erronée.
ask_one() {
  local var="$1" prompt="$2" default="${3:-}" validator="${4:-}" secret="${5:-}" optional="${6:-}"
  local cur="${!var:-}"
  [ -n "$cur" ] && return 0
  if [ "$NONINTERACTIVE" = 1 ]; then
    if [ -n "$default" ]; then printf -v "$var" '%s' "$default"; return 0; fi
    [ -n "$optional" ] && return 0
    die "$var manquant (le mode --yes exige un .env rempli)."
  fi
  local input
  while :; do
    if [ "$secret" = "secret" ]; then
      if ! read -r -s -p "$prompt${default:+ [$default]}: " input; then
        die "L'entrée s'est terminée avant que je reçoive $var. Lancez l'installateur dans un terminal interactif."
      fi
      echo
    else
      if ! read -r -p "$prompt${default:+ [$default]}: " input; then
        die "L'entrée s'est terminée avant que je reçoive $var. Lancez l'installateur dans un terminal interactif."
      fi
    fi
    { [ "$input" = "retour" ] || [ "$input" = "voltar" ]; } && return 2
    input="${input:-$default}"
    if [ -z "$input" ]; then
      [ -n "$optional" ] && { printf -v "$var" '%s' ""; return 0; }
      c_red "  Ce champ est obligatoire. (tapez 'retour' pour refaire la question précédente)"
      continue
    fi
    # Un champ secret n'affiche pas ce qui a été collé — la personne ne voit pas si elle a collé, donc
    # elle a tendance à recoller « pour être sûre », et colle deux fois sur la même ligne
    # (sans séparateur, cela devient une seule valeur, doublée). Cela produit des clés/connection
    # strings invalides avec une erreur cryptique plus loin.
    if [ "$secret" = "secret" ]; then
      local len=${#input} half=$(( ${#input} / 2 ))
      if [ $((len % 2)) -eq 0 ] && [ "${input:0:half}" = "${input:half}" ]; then
        c_red "  Cette valeur semble avoir été collée 2 fois de suite (le champ est secret et n'affiche pas ce que vous collez). Collez-la une seule fois."
        continue
      fi
    fi
    if [ -n "$validator" ]; then
      printf '  … vérification\r'
      local msg
      if ! msg="$("$validator" "$input" 2>&1)"; then
        printf '            \r'
        printf '\033[31m  ✖ %s\033[0m\n' "$(printf '%s' "$msg" | head -1)"
        printf '%s\n' "$(printf '%s' "$msg" | tail -n +2)" | grep -v '^$' || true
        c_dim "  (tapez 'retour' pour refaire la question précédente)"
        continue
      fi
      [ -n "$msg" ] && printf '%s\n' "$msg"
      printf '            \r'
    fi
    if [ "$secret" = "secret" ]; then c_grn "  ✓ reçu (${#input} caractères)"; else c_grn "  ✓"; fi
    printf -v "$var" '%s' "$input"
    save_partial "$var"
    return 0
  done
}

# Le seuil n'est PAS 4 Go, et la différence compte : `MemTotal` est ce qui reste après
# ce que le noyau se réserve, toujours moins que ce qui a été vendu. Mesuré sur un
# noyau avec 8 Gio configurés : 8025284 Ko, soit 95,7 % — dans la même proportion un
# VPS de 4 Gio rapporte ~4 012 000 Ko, 0,3 % au-dessus de 4 000 000. Et qui vend « 4
# Go » en Go décimaux livre 3 906 250 Ko, qui rapporte ~3 735 000. Autrement dit : avec
# la coupure à 4 000 000 l'avertissement tombait sur qui venait d'ACHETER
# exactement le VPS recommandé — le pire moment possible pour dire à quelqu'un que son
# serveur est trop petit. 3 500 000 Ko (3,34 Gio) laisse 4 Go dehors dans
# toute convention et attrape largement ceux de 2 et 3 Go, qui souffrent vraiment.
RAM_MINIMA_KB=3500000
ram_abaixo_do_recomendado() { [ "${1:-0}" -lt "$RAM_MINIMA_KB" ]; }

# Une ligne de .env avec la valeur entre guillemets DOUBLES et `\`, `"`, `$` et accent grave
# échappés — ce qui fait survivre nom d'entreprise et mot de passe à la relecture.
#
# L'encodage doit servir TROIS consommateurs, chacun avec son propre parseur, et
# aucun d'eux n'est le même shell : le `load_env` de _common.sh (lecture manuelle, par
# où passe tout script du kit), le `env_file: .env` de docker-compose.prod.yml
# (:34 et :71) et le `source .env && curl …` qu'enseigne le README (:143).
#
# C'étaient des guillemets SIMPLES, avec le guillemet du contenu écrit `'\''` — du shell valide,
# et c'est tout. Le parseur dotenv de Compose n'est pas un shell : il lit cette barre comme
# début de nom de variable et refuse le FICHIER ENTIER. Mesuré avec compose
# v2.38.2 avec `APP_NAME=Sant'Ana Odontologia` :
#
#   failed to read .env: line 1: unexpected character "\" in variable name
#   "\''Ana Odontologia'"
#   config → rc=1 ; ps → rc=1 ; pull → rc=1   (le même .env sans apostrophe : rc=0)
#
# Ces noms sont courants — « L'Atelier », « Chez N'Diaye », « Boutique D'Or » —, APP_NAME
# est la dernière question de l'entretien et n'a pas de validateur. L'issue était le pire
# type de casse : base provisionnée, schéma appliqué, admin créé, et TOUTE
# commande docker du kit morte, sans rien qui pointe vers le .env.
#
# RÉSIDU MESURÉ, et le choix derrière : Compose défait `\"`, `\\` et `\$`
# dans les guillemets doubles, mais NE défait PAS l'accent grave échappé — une valeur avec accent grave
# arrive au conteneur avec les barres (mesuré : `Boutique \`date\` SARL`). L'échapper
# quand même est délibéré : sans la barre, le `source .env` du README EXÉCUTE ce qui
# se trouve entre accents graves. Un caractère moche dans le conteneur coûte moins qu'une exécution
# de commande sur la machine de qui installe. Les deux autres bouts (load_env et
# source) reçoivent l'accent grave intact.
#
# Reste ici en haut (et non avec le bloc qui écrit le .env) parce que le
# save_partial ci-dessous écrit pendant l'ENTRETIEN, bien avant ce bloc.
envq() { printf '%s="%s"\n' "$1" "$(printf '%s' "${2-}" | sed 's/[\\"$`]/\\&/g')"; }

# Garde chaque réponse à l'instant où elle est acceptée. Avant, les 12 réponses
# ne devenaient un fichier qu'à la FIN : qui bloquait sur la connection string — la question
# la plus difficile, et la dernière des identifiants — perdait tout ce qu'il avait déjà tapé
# et recommençait de zéro à la tentative suivante. Justement, qui a le plus besoin
# d'une seconde tentative est celui qui a le moins de patience pour retaper 11 champs.
# Même permission que le .env (600) : le contenu est le même, secrets compris.
PARTIAL_FILE="${PARTIAL_FILE:-.env.partial}"
save_partial() {
  local var="$1" val="${!1-}" tmp="${PARTIAL_FILE}.tmp.$$"
  umask 077
  { [ -f "$PARTIAL_FILE" ] && grep -vE "^${var}=" "$PARTIAL_FILE" || true; } > "$tmp"
  envq "$var" "$val" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$PARTIAL_FILE"
}

# Qui publie 80 ou 443 SUR L'HÔTE ? Lit des lignes "nom|projet|image|ports" (le
# format de docker ps) et renvoie "nom|image" du premier qui correspond.
#
# Le côté qui compte dans la colonne Ports est celui AVANT la flèche — "0.0.0.0:80->80/tcp" est
# l'hôte 80 ; "0.0.0.0:8080->80/tcp" est l'hôte 8080 et NE dispute rien. La première
# version de ceci regardait `docker port` ancré sur le port INTERNE, et se trompait des deux
# côtés : elle interrompait l'installation à cause d'un phpMyAdmin en `-p 8080:80` (avec
# 80/443 libres, en demandant au propriétaire de faire tomber son site), et laissait passer un vrai
# proxy en `-p 80:8080`, qui est la façon de démarrer Traefik sans privilège.
#
# Le séparateur est "|", pas TAB : tab est un blanc IFS, donc deux tabs consécutifs deviennent
# un seul et le champ vide du milieu DISPARAÎT — un proxy démarré avec `docker run` (sans
# label compose) perdait l'image, et le Traefik de l'hébergeur appelé
# "coolify-proxy" était classé comme intrus.
dono_das_portas() {  # dono_das_portas  < lignes   → renvoie "nom|projet|image"
  local nome proj img ports
  while IFS='|' read -r nome proj img ports; do
    [ -n "$nome" ] || continue
    case "${ports// /}" in
      *:80-\>*|*:443-\>*) printf '%s|%s|%s' "$nome" "$proj" "$img"; return 0;;
    esac
  done
  return 1
}

# `nome_do_projeto_compose` et la vérification du réseau externe du proxy vivent dans
# _common.sh : update.sh a besoin des deux mêmes choses et les dupliquer, c'était
# garantir que l'une des copies vieillisse. Ce fichier les utilise après le
# `source` du bloc 2 (rien au-dessus n'en dépend).

# La question qui décide est « Docker peut-il publier le port ? », et la réponse
# vient d'ESSAYER — pas de déduire. Toute heuristique sur `docker port` ou `ss`
# se trompe dans un cas réel (proxy sans privilège publiant 80:8080, app en
# 8080:80, bind seulement sur loopback, `ss` hors du PATH, userland-proxy désactivé), et
# se trompe dans les deux sens : soit elle interrompt une bonne installation, soit elle livre le conflit de
# ports plus loin. Publier pour de faux utilise exactement le mécanisme que
# Caddy va utiliser, donc il n'y a pas d'écart entre le test et la réalité.
# Le conteneur sort aussitôt ; l'image est la même que celle déjà utilisée par le compose du kit.
porta_publicavel() {  # porta_publicavel <port>
  docker run --rm -p "$1:$1" --entrypoint /bin/true alpine:3.20 >/dev/null 2>&1
}

# La décision finale, isolée pour pouvoir être exercée sans Docker : c'est le point
# qui s'est déjà trompé deux fois (une fois en traitant son propre Caddy comme intrus, une autre en
# laissant passer un proxy qui n'était pas Traefik), et les deux fois l'erreur n'est apparue qu'en
# tournant pour de vrai sur un VPS.
# Renvoie : caddy | traefik | bloqueia
decide_proxy() {  # decide_proxy <ports_occupés> <projet_du_propriétaire> <projet_actuel> <image> <nom> [arbo_du_propriétaire] [arbo_actuelle]
  local ocupadas="${1:-}" dono_proj="${2:-}" meu_proj="${3:-}" img="${4:-}" nome="${5:-}"
  local dono_dir="${6:-}" meu_dir="${7:-}"
  [ -z "$ocupadas" ] && { printf 'caddy'; return 0; }
  # Les ports sont tenus par CETTE MÊME installation, déjà en ligne : c'est la réexécution, que le
  # kit lui-même enseigne comme chemin pour corriger une réponse.
  #
  # Sauf que « même installation » N'est PAS la même chose que « même nom de projet » : le nom
  # est le basename du dossier, et toute copie du dépôt s'appelle DeskcommCRM. Deux
  # arborescences sœurs (/root/DeskcommCRM et /root/apagar7/DeskcommCRM) entrent en collision sur le
  # nom `deskcommcrm` et cette ligne les déclarait réexécution l'une de l'autre —
  # exactement le cas que le balayage des ports a été écrit pour attraper. Mesuré
  # sur un VPS de production le 2026-08-24 : l'installation d'un cours est passée par
  # ici, a recréé les conteneurs du CRM en ligne avec son .env et a changé la base
  # de l'installation de production, sans un avertissement. Ce qui sépare les deux, c'est l'ARBORESCENCE.
  #
  # Une arborescence inconnue (conteneur sans le label, ou créé hors de compose) retombe
  # sur le comportement antérieur exprès : impossible d'AFFIRMER une copie sœur, et
  # fermer à l'aveugle casserait la réexécution légitime que le kit enseigne.
  if [ -n "$dono_proj" ] && [ "$dono_proj" = "$meu_proj" ]; then
    if [ -n "$dono_dir" ] && [ -n "$meu_dir" ] && [ "$dono_dir" != "$meu_dir" ]; then
      printf 'bloqueia'; return 0
    fi
    printf 'caddy'; return 0
  fi
  eh_traefik "$img" "$nome" && { printf 'traefik'; return 0; }
  printf 'bloqueia'
}

# Est-ce un Traefik ? Compare en minuscules le couple image+nom. La version précédente utilisait
# `*[Tt]raefik*`, qui n'a de classe d'équivalence que sur le premier caractère :
# un conteneur "TRAEFIK-PROXY" échappait et était traité comme intrus.
eh_traefik() {  # eh_traefik <image> <nom>
  case "$(printf '%s %s' "${1:-}" "${2:-}" | tr '[:upper:]' '[:lower:]')" in
    *traefik*) return 0;;
  esac
  return 1
}

# L'UNIQUE Traefik d'une liste `docker ps` — et seulement quand il est unique.
#
# Existe parce que la recherche par port publié NE voit PAS un proxy en mode host :
# en partageant la pile réseau de la machine, il écoute 80/443 sans rien publier et
# la colonne Ports de `docker ps` sort VIDE. Mesuré avec docker 28.3.2 : un conteneur
# en `--network host` sort avec Ports=[] même démarré avec `-p 80:80` (le daemon
# avertit « Published ports are discarded when using host network mode ») ; contrôle
# positif, le même nginx sur un bridge avec `-p 8080:80` sort avec
# "0.0.0.0:8080->80/tcp". C'est le cas d'Hostinger, et sans ce chemin le propriétaire des
# ports reste « non identifié » — l'installation meurt sur le panneau de blocage.
#
# Échoue FERMÉ au pluriel : avec deux Traefik impossible de savoir lequel tient les
# ports, et deviner publie le CRM derrière le mauvais proxy — un site qui « s'installe avec
# succès » et ne répond pas. Dans ce cas personne n'est élu et le panneau de blocage, qui
# dit au moins quoi faire, redevient l'issue.
unico_traefik() {  # unico_traefik  < lignes "nom|projet|image|ports"  → renvoie "nom|projet|image"
  local nome proj img ports achado="" n=0
  while IFS='|' read -r nome proj img ports; do
    [ -n "$nome" ] || continue
    eh_traefik "$img" "$nome" || continue
    achado="$nome|$proj|$img"; n=$((n + 1))
  done
  [ "$n" = 1 ] || return 1
  printf '%s' "$achado"
}

# Quel réseau écrire dans TRAEFIK_NETWORK. Isolé de Docker pour pouvoir être
# exercé : c'est ici que vivent DEUX conclusions opposées, et chacune a déjà été la
# seule implémentée à un moment du kit.
#
#   Traefik sur un bridge PROPRE  → son réseau (l'app y est rattachée).
#     Mesuré avec un vrai Traefik v3.3 : avec le label pointant vers le réseau du projet
#     la requête reste en HTTP 000 (timeout) même avec le conteneur dans les deux
#     réseaux ; seulement en pointant vers le réseau du PROXY elle devient HTTP 200.
#
#   Traefik en mode HOST         → un bridge À NOUS, que l'installateur crée.
#     Ici le proxy n'est dans aucun réseau Docker (`.NetworkSettings.Networks`
#     renvoie la chaîne "host", qui existe dans `docker network ls` mais avec le driver
#     `host` et n'accepte pas de conteneur à côté d'un bridge). En partageant la pile
#     de l'hôte il atteint n'importe quel bridge par IP — mesuré sur cette machine : un conteneur
#     en `--network host` fait un `curl` sur l'IP d'un conteneur dans un bridge séparé et
#     reçoit HTTP 200. Donc le réseau à désigner est un bridge où se trouve l'app, et
#     nous en utilisons un dédié au lieu du `_internal` du projet pour deux raisons
#     mesurées : (1) compose refuse un `external` pointant vers le réseau qu'il
#     créerait lui-même — « network <projet>_internal declared as external, but could
#     not be found » sur une nouvelle installation ; (2) l'`internal` a le redis SANS MOT DE PASSE,
#     et le réseau du proxy est le seul qui peut un jour recevoir un conteneur extérieur.
rede_do_traefik() {  # rede_do_traefik <NetworkMode du conteneur> <réseaux du conteneur> <bridge du projet>
  local netmode="${1:-}" redes="${2:-}" nossa="${3:-}"
  [ "$netmode" = host ] && { printf '%s' "$nossa"; return 0; }
  printf '%s' "$redes" | awk '{print $1}'
}

# Un Traefik élu par le balayage en MODE HOST est un soupçon, pas une preuve. L'élection
# par port publié a la preuve en main — la colonne Ports dit `:80->`. Le
# balayage par `--network host` n'en a aucune : en mode host la colonne sort vide
# pour TOUT le monde, donc ce qu'il répond est « il existe un unique Traefik en mode
# host sur cette machine », et non « c'est lui qui tient les ports ». Il suffit d'un nginx ou
# apache NATIF tenant 80/443 et d'un Traefik en mode host servant autre chose
# pour que l'installateur publie le CRM derrière un proxy qui ne répond pas : « installé
# avec succès » et le site muet — l'issue silencieuse que tout ce bloc
# existe pour éviter.
#
# Fermé sur l'ACTION, ouvert sur l'INFORMATION : qui est devant le terminal
# confirme (et la question dit ce qui a été trouvé) ; qui a lancé --yes reçoit un
# refus qui enseigne l'issue, à savoir déclarer REVERSE_PROXY=traefik dans le .env. La
# déclaration explicite reste valable — là, le choix appartient à qui installe, ce n'est pas
# une supposition de l'installateur.
# Renvoie : segue | pergunta | recusa
confianca_no_dono_das_portas() {  # confianca_no_dono_das_portas <venu_du_balayage_host> <noninteractive>
  local varredura="${1:-0}" nao_interativo="${2:-0}"
  [ "$varredura" = 1 ] || { printf 'segue'; return 0; }
  [ "$nao_interativo" = 1 ] && { printf 'recusa'; return 0; }
  printf 'pergunta'
}

# Masque le cœur d'un secret pour l'écran de vérification.
mask() {
  local v="$1"
  if [ -z "$v" ]; then printf '(vide)'; return; fi
  if [ "${#v}" -le 12 ]; then printf '%s' "****"; else printf '%s…%s (%d caractères)' "${v:0:8}" "${v: -4}" "${#v}"; fi
}

# Lit les 4 identifiants que supabase-provision.sh affiche (`CLÉ='valeur'`) SANS
# interpréter le contenu.
#
# Pourquoi pas `eval` : les valeurs sortent de `printf "%s='%s'"` sans échapper le guillemet
# simple, donc une valeur qui contient `'` ferme le littéral et le reste de la ligne
# redevient du CODE — et `NEON_REGION`, qui vient de l'environnement, est interpolée
# dans la connection string qui en sort. Même posture que `load_env`
# (_common.sh) : compare la clé à une liste fixe et copie la valeur comme du texte.
# Une clé hors liste est ignorée, donc la sortie ne crée jamais de variable arbitraire.
sb_carrega_credenciais() {
  local linha val
  while IFS= read -r linha; do
    val="${linha#*=\'}"; val="${val%\'}"
    case "$linha" in
      NEON_DATA_API_URL=\'*\')      NEON_DATA_API_URL="$val";;
      NEON_TEST_JWT=\'*\') NEON_TEST_JWT="$val";;
      NEON_SERVICE_ROLE_JWT=\'*\')     NEON_SERVICE_ROLE_JWT="$val";;
      NEON_DATABASE_URL=\'*\')               NEON_DATABASE_URL="$val";;
    esac
  done <<<"$1"
}

# Charge seulement les fonctions ci-dessus, sans rien installer — c'est ainsi que
# `test-validators.sh` exerce les validateurs :  INSTALL_SH_LIB=1 . install.sh
if [ "${INSTALL_SH_LIB:-}" = "1" ]; then trap - EXIT; return 0; fi

banner

# ── 1. Vérifications préalables ─────────────────────────────────────────────
fase 1 "Préparation du serveur"
step "Vérification des dépendances"

# Un VPS « nu » (Hetzner, DigitalOcean, Contabo…) ne vient pas avec Docker. Avant c'était
# une impasse : le script mourait en disant « installez avant de continuer » et la
# personne — qui par définition n'est pas technique — ne savait pas comment faire. Les hébergements
# avec modèle (Hostinger, HostGator) ont déjà Docker, donc le cas n'apparaissait jamais
# pour qui a écrit le kit.
#
# L'installateur officiel de Docker est la même commande que dans leur documentation ; nous
# n'inventons rien. En mode interactif il DEMANDE (installer quelque chose sur le serveur de
# quelqu'un sans prévenir est un abus de confiance) ; avec --yes il continue directement, c'est le
# contrat de ce mode.
if ! command -v docker >/dev/null 2>&1; then
  c_ylw "⚠ Docker n'est pas installé — c'est le moteur qui fait tourner le CRM."
  instalar=1
  if [ "$NONINTERACTIVE" = 0 ]; then
    read -r -p "  Puis-je l'installer maintenant ? (O/n) " r
    case "${r:-S}" in [Nn]*) instalar=0;; esac
  fi
  if [ "$instalar" = 1 ]; then
    c_dim "  Installation (get.docker.com — l'installateur officiel). Compter 1 à 2 minutes…"
    # La sortie va dans un journal au lieu de /dev/null : faire taire stderr laissait aussi
    # l'échec MUET (disque plein, apt bloqué, architecture sans paquet
    # devenaient tous la même phrase générique) — exactement ce que le trap plus haut
    # existe pour empêcher. Écran propre sur le chemin heureux, vraie cause sur le mauvais chemin.
    _docker_log="$(mktemp)"
    if ! curl -fsSL https://get.docker.com | sh >"$_docker_log" 2>&1; then
      c_red "  Dernières lignes de l'installateur Docker :"; tail -15 "$_docker_log" >&2
      die "Impossible d'installer Docker (journal dans $_docker_log). Lancez 'curl -fsSL https://get.docker.com | sh' et réessayez."
    fi
    rm -f "$_docker_log"; unset _docker_log
    command -v docker >/dev/null 2>&1 || die "Docker s'est installé mais n'est pas dans le PATH. Rouvrez le terminal et relancez."
    c_grn "✓ Docker installé"
  else
    die "Sans Docker, impossible de continuer. Installez-le avec : curl -fsSL https://get.docker.com | sh"
  fi
fi

for bin in docker git openssl curl; do
  command -v "$bin" >/dev/null 2>&1 || die "'$bin' introuvable. Installez-le avant de continuer."
done
docker compose version >/dev/null 2>&1 || die "'docker compose' (v2) introuvable."
docker info >/dev/null 2>&1 || die "Le daemon Docker ne tourne pas (ou votre utilisateur n'a pas la permission)."
c_grn "✓ docker, git, openssl, curl ok"

# RAM : l'image est pré-construite, donc la stack DÉMARRE avec 2 Go. Mais le runbook de production
# déclare 4 Go comme minimum d'exploitation : 7 conteneurs, et WAHA utilise ~150 Mo par session
# en plus de ~300 Mo de surcoût Node. Avertir seulement sous 1,5 Go laissait l'opérateur
# installer sur 2 Go en croyant être dans les recommandations.
if [ -r /proc/meminfo ]; then
  mem_kb=$(awk '/MemTotal/{print $2}' /proc/meminfo)
  if ram_abaixo_do_recomendado "$mem_kb"; then
    c_ylw "⚠ Ce serveur a ~$((mem_kb/1024)) Mo de RAM. Le CRM démarre, mais il est à la limite :"
    c_ylw "  il y a 7 conteneurs et WhatsApp utilise ~150 Mo par numéro connecté."
    c_ylw "  Ajoutez du swap avant de l'exploiter — voir docs/runbooks/waha-hostgator.md."
  fi
fi

# ── 2. Dépôt ────────────────────────────────────────────────────────────────
step "Localisation du projet"
if [ -f "$COMPOSE" ]; then
  c_grn "✓ exécution depuis l'intérieur du dépôt"
elif [ -f "$REPO_DIR/$COMPOSE" ]; then
  cd "$REPO_DIR"; c_grn "✓ dépôt dans ./$REPO_DIR"
else
  c_ylw "Clonage de $REPO_URL ..."
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi
PROJECT_DIR="$(pwd)"
source "$KIT_DIR/_common.sh"

# ── L'invariant 8 vaut aussi pour qui INSTALLE ──────────────────────────────
#
# `recusar_projeto_de_outra_arvore` protégeait déjà `update.sh` (:33) et
# `agent.sh` (:45), mais pas ce fichier — la porte par laquelle l'incident
# est entré. Le panneau de copie sœur, plus bas, couvre le cas où l'installation
# en ligne est PROPRIÉTAIRE des ports 80/443 ; ce garde-fou est celui qui vaut toujours, parce qu'il
# interroge les CONTENEURS du projet, pas le proxy :
#
#   - VPS avec le Traefik du panneau (Coolify/Hostinger) : là `decide_proxy` sort par
#     `traefik` avant de comparer l'arborescence, et le panneau n'est jamais atteint ;
#   - dossier qui a déjà terminé une installation : install.sh lui-même écrit
#     REVERSE_PROXY dans le .env (:1413), et au tour suivant le `if [ -z ... ]` qui
#     enveloppe le panneau est faux — l'installateur désactivait son propre garde-fou ;
#   - ports 80/443 libres : `decide_proxy` renvoie `caddy` dès la première ligne.
#
# Dans les trois cas, `docker compose ... up -d` démarrait par-dessus le parc de production avec le
# .env de ce dossier (autre base, autres clés) — le symptôme mesuré a été le mot de passe qui
# « cesse de fonctionner » et les connexions WhatsApp qui tombent.
#
# ICI et non dans les vérifications préalables : `projeto_pertence_a_outra_arvore` compare avec
# `PROJECT_DIR`, qui n'existe qu'à partir de la ligne ci-dessus. Et avant la collecte de
# configuration, pour ne demander aucune donnée à qui va être refusé.
#
# Une NOUVELLE installation n'est pas affectée : sans conteneur du projet en ligne, la fonction
# renvoie vide et le garde-fou laisse passer. Réexécuter dans le MÊME dossier pareil — l'
# arborescence est la même. `DESKCOMM_ASSUMIR_PROJETO=1` est l'issue pour qui déplace
# l'installation exprès, et c'est la même que pour les deux autres points d'appel.
recusar_projeto_de_outra_arvore || die "Installation interrompue pour ne pas faire tomber le CRM déjà en ligne sur ce VPS."

# ── 3. Collecte de la configuration ─────────────────────────────────────────
fase 2 "Vos informations"
step "Configuration"
# Si un .env existe déjà, le charger pour ne pas répéter les questions (idempotence).
if [ -f .env ]; then load_env .env; c_grn "✓ .env existant chargé"; fi
# Réponses gardées d'une tentative qui n'est pas allée au bout. Chargées APRÈS le
# .env exprès : si les deux sources ont la clé, la plus récente est celle-ci.
if [ -f "$PARTIAL_FILE" ]; then
  load_env "$PARTIAL_FILE"
  c_grn "✓ reprise : $(grep -c '=' "$PARTIAL_FILE" 2>/dev/null || echo 0) réponse(s) gardée(s) de la tentative précédente"
  c_dim "  (pour tout reprendre de zéro : rm $PARTIAL_FILE)"
fi

# ── Proxy inverse : qui tient les ports 80 et 443 ? ─────────────────────────
# Reste ICI, juste après la lecture du .env et AVANT toute chose coûteuse : c'était la
# dernière étape de la phase 2, donc qui butait sur ce problème avait déjà créé un
# projet de base de données, tout répondu et attendu le clone — pour qu'ensuite seulement le
# `docker compose up` meure avec « Bind for 0.0.0.0:80 failed: port is already
# allocated ». Le découvrir avant d'exiger le moindre travail, c'est le minimum.
#
# Le balayage NE cherche PAS « traefik » : il cherche QUI PUBLIE les ports, et
# seulement ensuite demande de quoi il s'agit. La version précédente ne reconnaissait que Traefik, donc un
# Caddy — y compris celui d'un autre DeskcommCRM installé sur le même VPS — passait
# inaperçu et l'installation choisissait `caddy`, garantissant le conflit de ports.
# Mesuré sur un VPS avec la production en marche : exactement cette erreur, en phase 4.
#
# Les conteneurs de CETTE installation sont ignorés : lors d'une réexécution, notre propre
# Caddy est debout et publie 80/443, et le traiter comme « autre proxy » tuerait
# l'idempotence — qui est justement ce qui permet de relancer pour corriger une
# réponse erronée.
proj_atual="$(nome_do_projeto_atual)"

portas_ocupadas=""; n_ocupadas=0
porta_publicavel 80  || { portas_ocupadas="80"; n_ocupadas=1; }
porta_publicavel 443 || { portas_ocupadas="${portas_ocupadas:+$portas_ocupadas et }443"; n_ocupadas=$((n_ocupadas + 1)); }

# Identification de l'occupant — seulement pour le MESSAGE. C'est le test ci-dessus qui décide,
# donc ne pas savoir qui c'est ne devient JAMAIS « on peut installer » : l'échec est fermé.
# Le "|| true" n'est pas décoratif : dans une affectation, le statut du pipeline devient le
# statut du script, et sous `set -e` + `pipefail` un docker ps qui échoue (ou un
# SIGPIPE du consommateur) tuerait l'installateur en silence, au milieu de la phase 2.
dono_portas=""; dono_projeto=""; dono_imagem=""; dono_arvore=""
if [ -n "$portas_ocupadas" ]; then
  _dono="$(docker ps --format '{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Image}}|{{.Ports}}' 2>/dev/null | dono_das_portas || true)"
  if [ -n "$_dono" ]; then
    dono_portas="${_dono%%|*}"; _resto="${_dono#*|}"
    dono_projeto="${_resto%%|*}"; dono_imagem="${_resto#*|}"
    unset _resto
    # De quelle copie du dépôt vient ce conteneur. C'est ce qui sépare « c'est moi qui
    # relance » de « c'est l'installation sœur qui est en ligne » quand les deux dossiers
    # s'appellent DeskcommCRM et partagent donc le nom du projet.
    dono_arvore="$(docker inspect "$dono_portas" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
    dono_arvore="${dono_arvore%/}"
  fi
  unset _dono
fi

# Personne ne PUBLIE les ports, mais ils sont occupés : le candidat est un proxy en
# mode host, qui écoute 80/443 par la pile réseau de la machine et sort donc avec la
# colonne Ports vide (la mesure est dans `unico_traefik`). Sans cette branche, le propriétaire
# restait « non identifié » et l'installation s'arrêtait sur le panneau de blocage — qui
# demande de mettre REVERSE_PROXY=traefik dans le .env, chemin qui mourait aussi plus loin.
# C'est exactement le VPS Hostinger de l'issue #139.
#
# L'élection reste MARQUÉE : qui vient d'ici n'a pas la colonne Ports comme preuve, et le
# `case` ci-dessous traite cette différence (voir `confianca_no_dono_das_portas`).
dono_por_varredura_host=0
if [ -n "$portas_ocupadas" ] && [ -z "$dono_portas" ]; then
  _host="$(docker ps --filter network=host --format '{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Image}}|{{.Ports}}' 2>/dev/null | unico_traefik || true)"
  if [ -n "$_host" ]; then
    dono_portas="${_host%%|*}"; _resto="${_host#*|}"
    dono_projeto="${_resto%%|*}"; dono_imagem="${_resto#*|}"
    dono_por_varredura_host=1
    unset _resto
  fi
  unset _host
fi

# Toujours initialisée : le bloc du réseau Traefik, plus bas, lit cette variable
# sans valeur par défaut, et sous `set -u` une installation qui apporte déjà REVERSE_PROXY=traefik dans le
# .env (donc sans passer par la détection) mourrait sur « unbound variable ».
traefik_container=""

if [ -z "${REVERSE_PROXY:-}" ]; then
  # L'exclusion de sa propre installation se fait ICI, pas dans le balayage : le test de
  # bind n'a aucun moyen de s'auto-exclure, donc filtrer notre conteneur avant ne
  # produisait qu'un « occupé par personne » — un blocage sans une seule commande.
  _minha_arvore="${PROJECT_DIR:-$PWD}"; _minha_arvore="${_minha_arvore%/}"
  case "$(decide_proxy "$portas_ocupadas" "$dono_projeto" "$proj_atual" "$dono_imagem" "$dono_portas" "$dono_arvore" "$_minha_arvore")" in
  caddy)
    REVERSE_PROXY=caddy
    [ -n "$portas_ocupadas" ] && c_dim "  (les ports 80/443 sont déjà tenus par cette installation — on continue)"
    ;;
  traefik)
    # La raison pour laquelle le balayage en mode host ne suffit pas seul est dans
    # `confianca_no_dono_das_portas`.
    case "$(confianca_no_dono_das_portas "$dono_por_varredura_host" "$NONINTERACTIVE")" in
    pergunta)
      c_ylw "⚠ Les ports ${portas_ocupadas} sont occupés, mais AUCUN conteneur ne les publie."
      c_ylw "  Le seul Traefik en mode host ici est '${dono_portas}'${dono_imagem:+ (image ${dono_imagem})}."
      printf '\n%s\n'   "  En mode host, Docker n'affiche pas les ports, donc je ne peux pas PROUVER que c'est lui"
      printf '%s\n\n'   "  qui sert votre domaine — ce pourrait être un nginx/apache installé sur le serveur."
      printf '%s\n'     "  Si c'est lui, le CRM est publié par lui et tout fonctionne."
      printf '%s\n\n'   "  Sinon, le site va démarrer et ne pas répondre — sans aucune erreur à l'écran."
      if ! read -r -p "  Est-ce '${dono_portas}' qui sert votre site ? (o/N) " _r; then _r=""; fi
      if ! resposta_sim "$_r"; then
        die "D'accord, je ne prends pas le risque. Trouvez qui tient les ports 80/443 (ex. : 'ss -ltnp | grep :80')
et, si c'est bien un Traefik, mettez REVERSE_PROXY=traefik dans le .env et relancez."
      fi
      unset _r
      ;;
    recusa)
      c_red "✖ Les ports ${portas_ocupadas} sont occupés, mais AUCUN conteneur ne les publie."
      printf '\n%s\n'   "  Le seul Traefik en mode host ici est '${dono_portas}'${dono_imagem:+ (image ${dono_imagem})},"
      printf '%s\n\n'   "  et en mode host Docker n'affiche aucun port — impossible de prouver que c'est lui qui répond."
      printf '%s\n'     "  Publier le CRM derrière le mauvais proxy installe « avec succès » un site qui ne répond pas,"
      printf '%s\n\n'   "  donc en mode --yes je m'arrête ici au lieu de deviner."
      printf '%s\n'     "  C'est bien ce Traefik ? Mettez ceci dans le .env et relancez :"
      printf '%s\n\n'   "       REVERSE_PROXY=traefik"
      printf '%s\n'     "  Ce n'est pas lui ? Vérifiez qui tient les ports : ss -ltnp | grep -E ':80|:443'"
      die "Impossible d'identifier avec certitude le propriétaire des ports ${portas_ocupadas} en mode --yes."
      ;;
    esac
    REVERSE_PROXY=traefik
    traefik_container="$dono_portas"
    c_ylw "⚠ J'ai détecté un Traefik déjà en marche sur ce VPS (conteneur '${dono_portas}', qui occupe 80/443)."
    c_ylw "  Je vais publier le CRM à travers lui au lieu de démarrer un proxy dédié —"
    c_ylw "  arrêter Traefik casserait ce que votre hébergeur a installé."
    ;;
  *)
    # La préposition vient avec le fragment : la phrase sort fausse si elle fixe
    # la préposition et que le morceau variable commence par un article. Et l'image n'entre que si elle est
    # connue — « (image ) » vide était le symptôme d'un champ perdu.
    ocupante="${dono_portas:+par le conteneur '${dono_portas}'${dono_imagem:+ (image ${dono_imagem})}}"
    ocupante="${ocupante:-par un programme du serveur lui-même}"
    # Une copie sœur a son propre diagnostic : le panneau générique ci-dessous parle de
    # « port occupé », et qui lit cela dans un dossier fraîchement cloné ne relie pas l'avertissement
    # à l'installation qui est en ligne — c'est ainsi qu'un cours a démarré par-dessus une
    # production. Ici le nom des DEUX dossiers apparaît.
    if [ -n "$dono_arvore" ] && [ "$dono_projeto" = "$proj_atual" ] && [ "$dono_arvore" != "$_minha_arvore" ]; then
      c_red "✖ Un DeskcommCRM est DÉJÀ EN LIGNE sur ce VPS, installé dans ${dono_arvore}."
      printf '\n%s\n'   "  Ce dossier (${_minha_arvore}) est une autre copie du dépôt. Les deux s'appellent"
      printf '%s\n'     "  DeskcommCRM, donc Docker leur donne le MÊME nom de projet"
      printf '%s\n\n'   "  ('${proj_atual}') — et installer ici recréerait les conteneurs de l'autre."
      printf '%s\n'     "  En pratique : le CRM en ligne se mettrait à tourner avec le .env DE CE dossier"
      printf '%s\n\n'   "  (autre base, autres clés), et les connexions WhatsApp tomberaient."
      printf '%s\n'     "  Vous voulez mettre à jour l'existant ? Utilisez ce dossier-là :"
      printf '%s\n\n'   "       cd ${dono_arvore} && bash hostgator-setup-kit/update.sh"
      printf '%s\n'     "  Vous voulez vraiment une SECONDE installation sur ce VPS ? Elle a besoin de son propre nom de"
      printf '%s\n'     "  projet et de son propre domaine — mettez dans le .env de ce dossier, avant de lancer :"
      printf '%s\n\n'   "       COMPOSE_PROJECT_NAME=deskcomm-$(basename "${_minha_arvore}" | tr 'A-Z' 'a-z')-2"
      die "Installation interrompue pour ne pas faire tomber le DeskcommCRM en ligne dans ${dono_arvore}."
    fi
    # Accord avec le nombre de ports : « Le port 80 et 443 est déjà occupé »
    # est sorti en test réel et trahit un texte monté sans regarder ses propres données.
    if [ "$n_ocupadas" -gt 1 ]; then
      c_red "✖ Les ports ${portas_ocupadas} sont déjà occupés ${ocupante}."
    else
      c_red "✖ Le port ${portas_ocupadas} est déjà occupé ${ocupante}."
    fi
    printf '\n%s\n'   "  Le CRM a besoin de ces deux ports pour publier le site en HTTPS. Démarrer un"
    printf '%s\n\n'   "  second proxy dessus ne fonctionne pas : Docker refuse et l'installation s'arrête."
    printf '%s\n'     "  Comment résoudre, du plus probable au moins probable :"
    printf '\n%s\n'   "  1. C'est déjà un autre DeskcommCRM sur ce serveur ? Alors utilisez celui-là — entrez dans"
    printf '%s\n'     "     son dossier et lancez : bash hostgator-setup-kit/update.sh"
    printf '\n%s\n'   "  2. Vous n'utilisez plus ce qui occupe le port ? Arrêtez-le et relancez cet installateur :"
    [ -n "$dono_portas" ] && printf '%s\n' "       docker stop ${dono_portas}"
    printf '\n%s\n'   "  3. Vous voulez garder les deux en ligne ? Alors le CRM doit passer par un seul proxy, et c'est"
    printf '%s\n'     "     une configuration manuelle — le kit n'automatise ce chemin que pour"
    printf '%s\n\n'   "     Traefik (mettez REVERSE_PROXY=traefik dans le .env)."
    if [ "$n_ocupadas" -gt 1 ]; then
      die "Libérez les ports ${portas_ocupadas} (ou utilisez l'installation existante) et relancez."
    fi
    die "Libérez le port ${portas_ocupadas} (ou utilisez l'installation existante) et relancez."
    ;;
  esac
fi

# Reste HORS du `case` parce que qui met REVERSE_PROXY=traefik dans le .env à la main — le
# chemin que le panneau de blocage juste au-dessus ENSEIGNE — saute tout le `case` et
# arrivait au bloc du réseau avec la variable vide, pour mourir sur « Impossible de
# découvrir le réseau Docker de votre Traefik ». L'installateur demandait de faire une chose
# qu'il ne savait pas lui-même terminer.
if [ "${REVERSE_PROXY:-}" = "traefik" ] && [ -z "$traefik_container" ]; then
  if [ -n "$dono_portas" ] && eh_traefik "$dono_imagem" "$dono_portas"; then
    traefik_container="$dono_portas"
  else
    # Ni propriétaire des ports ni mode host : le Traefik est peut-être simplement
    # arrêté en ce moment (panneau qui redémarre, VPS tout juste allumé). Le chercher parmi
    # TOUS les conteneurs est ce qui reste — et c'est toujours fermé au pluriel, parce que
    # pointer vers le mauvais Traefik publie le CRM sur un proxy que personne n'atteint.
    _tk="$(docker ps --format '{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Image}}|{{.Ports}}' 2>/dev/null | unico_traefik || true)"
    [ -n "$_tk" ] && traefik_container="${_tk%%|*}"
    unset _tk
  fi
fi

# ── Neon pré-provisionné ─────────────────────────────────────────────────────
# Neon Managed Better Auth, Data API et la branche PostgreSQL doivent être
# créés/configurés avant l’installation. Le kit ne tente pas de créer un projet
# ni de manipuler un token de management : cela évite d’exposer une clé de
# provisioning et garantit que l’opérateur choisit explicitement la région,
# le domaine de confiance, les grants et la branche vierge.
if [ -z "${NEON_DATA_API_URL:-}" ] || [ -z "${NEON_DATABASE_URL:-}" ]; then
  c_ylw "⚠ Configurez d’abord NEON_DATA_API_URL et NEON_DATABASE_URL pour votre projet Neon."
fi

# Chaque ligne : VARIABLE|question|défaut|validateur|secret|optionnel
# L'ordre compte : l'URL du projet vient avant les clés parce que les validateurs
# des clés la comparent (une clé d'un autre projet est une erreur courante et muette).
# Le bloc final (APP_NAME, SUPPORT_EMAIL, RESEND_*) reste en dernier
# exprès : tout est optionnel, et le demander au milieu des identifiants le ferait paraître
# obligatoire. Les quatre acceptent Entrée — et, quand elles sont vides, le produit
# se dégrade de façon déclarée (marque par défaut ; écran de suspension sans adresse ;
# invitation affichant le lien d'acceptation à l'écran même).
# ── Quelle IA va répondre ───────────────────────────────────────────────────
#
# Avant ceci, l'installateur ne savait demander que la clé Anthropic, et qui avait déjà
# un compte chez un autre fournisseur le découvrait tard : il installait, enregistrait la « mauvaise »
# clé, et l'agent ne répondait pas. OpenRouter a changé la donne de ce choix —
# une seule clé donne accès à des centaines de modèles de dizaines de fabricants, ce qui
# est souvent le chemin le plus simple pour qui débute.
#
# La question vient AVANT les identifiants parce que c'est elle qui décide QUEL identifiant
# sera demandé ; demander après obligerait à revenir en arrière.
escolher_provedor() {
  # Lors d'une 2e exécution, le fournisseur déjà choisi devient la valeur par défaut — qui relance le
  # script pour corriger autre chose ne doit pas avoir à refaire ce choix.
  local atual="${AI_PROVIDER:-}"
  if [ -z "$atual" ]; then
    if   [ -n "${OPENROUTER_API_KEY:-}" ]; then atual="openrouter"
    elif [ -n "${ANTHROPIC_API_KEY:-}" ];  then atual="anthropic"
    elif [ -n "${OPENAI_API_KEY:-}" ];     then atual="openai"
    fi
  fi

  if [ "$NONINTERACTIVE" = 1 ]; then
    AI_PROVIDER="${atual:-anthropic}"
    return 0
  fi

  printf '\n\033[1mQuelle intelligence artificielle va répondre à vos clients ?\033[0m\n\n'
  printf '  [1] OpenRouter  — une clé, des centaines de modèles de plusieurs fabricants.\n'
  printf '                    Le chemin le plus simple pour essayer. (openrouter.ai/keys)\n'
  printf '  [2] Anthropic   — suit le mieux les longues instructions et utilise\n'
  printf '                    les outils du CRM. (console.anthropic.com)\n'
  printf '  [3] OpenAI      — (platform.openai.com/api-keys)\n'
  printf '\n'
  printf '  Modifiable plus tard, et par partie du système, dans Agent IA → Fournisseurs.\n\n'

  local padrao_num=2
  case "$atual" in openrouter) padrao_num=1;; openai) padrao_num=3;; esac

  while :; do
    if ! read -r -p "Choix (Entrée = ${padrao_num}) : " escolha; then escolha=""; fi
    [ -z "$escolha" ] && escolha="$padrao_num"
    case "$escolha" in
      1) AI_PROVIDER="openrouter"; break;;
      2) AI_PROVIDER="anthropic";  break;;
      3) AI_PROVIDER="openai";     break;;
      *) c_ylw "Tapez 1, 2 ou 3.";;
    esac
  done
}
escolher_provedor

# Le champ de la clé du fournisseur CHOISI — et seulement de lui. Demander les trois ferait
# croire à la personne qu'elle a besoin des trois.
case "$AI_PROVIDER" in
  openrouter) CAMPO_IA="OPENROUTER_API_KEY|Clé OpenRouter — l'IA qui répond (openrouter.ai/keys)||v_openrouter|secret|";;
  openai)     CAMPO_IA="OPENAI_API_KEY|Clé OpenAI — l'IA qui répond (platform.openai.com/api-keys)||v_openai|secret|";;
  *)          CAMPO_IA="ANTHROPIC_API_KEY|Clé Anthropic — l'IA qui répond (console.anthropic.com)||v_anthropic|secret|";;
esac

# La clé OpenAI est demandée À PART quand elle N'est PAS le fournisseur de conversation,
# parce que deux points du système en dépendent quand même : écouter l'audio (la
# transcription passe par OpenAI) et indexer la base de connaissances. Sans cette ligne, qui
# choisit OpenRouter installe en se croyant complet et découvre des semaines plus tard
# que l'agent n'a jamais écouté un audio — c'est exactement le défaut déjà vu en
# production, avec la bonne clé dans le .env et qui partait vers le mauvais endpoint.
if [ "$AI_PROVIDER" = "openai" ]; then
  CAMPO_OPENAI_EXTRA=""
else
  CAMPO_OPENAI_EXTRA="OPENAI_API_KEY|Clé OpenAI — seulement pour écouter les audios et utiliser la base de connaissances (Entrée pour passer)||v_openai|secret|opcional"
fi

# ── La version que cette installation va faire tourner ───────────────────────
# Une nouvelle installation naissait sur `:latest`, et ici `latest` NE veut PAS dire « la
# dernière release » : il suit la branche par défaut, donc elle
# suit le sommet de `main` — du code pas encore publié. Qui installait le 6
# et qui installait le 20 faisaient tourner des logiciels différents, tous deux disant « je suis
# sur latest », et le support n'avait aucun moyen de savoir lequel. L'issue #184 est arrivée
# en décrivant l'environnement comme « latest du 06/08/2026 », ce qui est l'aveu
# que la version n'était pas nommable.
#
# Résolu sur le DÉPÔT DISTANT parce que le clone est `--depth 1` et n'apporte aucune tag.
VERSAO_ALVO="$(ultima_versao_publicada "$REPO_URL")"

# La tag git est une condition NÉCESSAIRE, pas suffisante : elle naît quelques minutes avant
# les images, et `deskcomm-worker`/`deskcomm-scheduler` n'ont commencé à exister
# qu'après les releases déjà publiées — `deskcomm-worker:1.2.1` n'existera jamais,
# parce que la v1.2.1 appartient au passé. Sans cette vérification, le .env du
# client recevrait deux références impossibles et le kit les construirait ici en
# silence, depuis le sommet de main : l'app d'une release + le worker d'un autre code.
#
# Cascade, du plus spécifique au plus disponible. Chaque niveau interroge les TROIS
# images ensemble, parce qu'installer avec elles désalignées est le défaut, pas la
# solution.
if [ -n "$VERSAO_ALVO" ] && trio_publicado "$VERSAO_ALVO"; then
  : # le chemin normal : les trois publiées dans la dernière version
elif trio_publicado "stable"; then
  c_ylw "⚠ La version ${VERSAO_ALVO:-la plus récente} n'a pas encore ses trois images publiées."
  c_ylw "  Installation via le canal 'stable' (la dernière version complète)."
  VERSAO_ALVO="stable"
elif [ -n "$VERSAO_ALVO" ]; then
  # Ni la version ni `stable` n'ont le trio. On continue quand même — le compose a
  # `build:` à côté de l'`image:` du worker et du scheduler, donc ils sont
  # construits ici. C'est lent, mais ça s'installe. Ce qui NE doit PAS arriver, c'est que cela se fasse
  # en silence : le propriétaire doit savoir que deux de ses pièces sortent des sources locales.
  c_ylw "⚠ Les images du worker et du planificateur ne sont pas encore publiées."
  c_ylw "  Elles seront construites sur ce serveur — cela prend quelques minutes de plus."
  c_ylw "  Lancez 'bash hostgator-setup-kit/update.sh' quand la prochaine version sortira."
else
  # Échec OUVERT : sans réseau ou sans tag sur le dépôt distant, on continue comme avant. Bloquer
  # l'installation faute de résoudre un numéro serait échanger la prévisibilité contre la
  # disponibilité — mais l'avertissement sort, parce que le propriétaire doit savoir qu'il est resté
  # sur un canal mobile au lieu d'une version.
  VERSAO_ALVO="latest"
  c_ylw "⚠ Impossible de découvrir la dernière version publiée (réseau ?)."
  c_ylw "  Installation via le canal 'latest'. Ensuite lancez : bash hostgator-setup-kit/update.sh"
fi
IMAGEM_APP_DEFAULT="${IMG_APP}:${VERSAO_ALVO}"

FIELDS=(
  "DOMAIN|Domaine du CRM (ex. : crm.votreentreprise.com)||v_domain||"
  "ACME_EMAIL|Votre e-mail (alertes SSL)||v_email||"
  "APP_IMAGE|Image Docker de l'app|${IMAGEM_APP_DEFAULT}|||"
  "NEON_AUTH_BASE_URL|Neon Managed Better Auth base URL||v_url||"
  "NEON_DATA_API_URL|Neon Data API/PostgREST URL||v_url||"
  "NEON_SERVICE_ROLE_JWT|Neon service-role JWT||v_service|secret|"
  "NEON_AUTH_COOKIE_SECRET|Neon Better Auth cookie secret (min 32 chars)||v_service|secret|"
  "NEON_DATABASE_URL|Neon pooled PostgreSQL connection string||v_db_url|secret|"
  "$CAMPO_IA"
  ${CAMPO_OPENAI_EXTRA:+"$CAMPO_OPENAI_EXTRA"}
  "OWNER_EMAIL|E-mail du premier admin (propriétaire)||v_email||"
  "OWNER_PASSWORD|Mot de passe du premier admin (8 caractères minimum)||v_password|secret|"
  "APP_NAME|Nom affiché dans l'interface (Entrée pour la valeur par défaut)|DeskcommCRM|||"
  # Sans défaut, et `opcional` : en `--yes`, `ask_one` renvoie 0 sans affecter la
  # variable (un champ sans défaut et sans `opcional` meurt dans `die`), et l'`envq` plus
  # bas utilise `${APP_ACCENT_HEX:-}`. Entrée = la couleur du produit, qui est le
  # comportement habituel pour qui n'a pas de marque propre.
  "APP_ACCENT_HEX|Couleur de votre marque en hex, ex. : #7a5cd6 (Entrée pour la couleur du système)||v_hex||opcional"
  "SUPPORT_EMAIL|E-mail de support que VOS clients voient (Entrée pour passer)||v_email||opcional"
  "RESEND_API_KEY|Clé Resend — envoie les invitations et les e-mails RGPD (resend.com/api-keys, Entrée pour passer)|||secret|opcional"
  "RESEND_FROM_EMAIL|Expéditeur des e-mails, d'un domaine vérifié chez Resend (Entrée pour passer)||v_email||opcional"
)

field_at() { IFS='|' read -r F_VAR F_PROMPT F_DEF F_VAL F_SEC F_OPT <<< "${FIELDS[$1]}"; }

if [ "$NONINTERACTIVE" = 0 ]; then
  c_dim "Astuce : à n'importe quelle question, tapez 'retour' pour refaire la précédente."
  if [ "$AI_PROVIDER" != "openai" ]; then
    c_ylw "La clé OpenAI est optionnelle, mais sans elle l'IA n'écoute pas l'audio et ne consulte pas la base de connaissances."
  fi
fi

i=0
while [ "$i" -lt "${#FIELDS[@]}" ]; do
  field_at "$i"
  set +e; ask_one "$F_VAR" "$F_PROMPT" "$F_DEF" "$F_VAL" "$F_SEC" "$F_OPT"; rc=$?; set -e
  if [ "$rc" = "2" ]; then
    if [ "$i" -eq 0 ]; then c_ylw "  C'est déjà la première question."; continue; fi
    i=$((i-1)); field_at "$i"; unset "$F_VAR"      # efface la précédente pour qu'elle soit redemandée
  else
    i=$((i+1))
  fi
done

# ── Vérification : la dernière chance de corriger sans rien défaire ─────────
# Lors d'une 2e exécution tous les champs viennent déjà du .env — donc cet écran est aussi
# le chemin pour corriger une valeur mal saisie auparavant, qui restait avant
# coincée dans le .env sans aucun moyen de la changer via l'installateur.
if [ "$NONINTERACTIVE" = 0 ]; then
  while :; do
    printf '\n\033[1mVérifiez avant que j’écrive la configuration :\033[0m\n\n'
    n=1
    for f in "${FIELDS[@]}"; do
      IFS='|' read -r v p _d _val sec _o <<< "$f"
      if [ "$sec" = "secret" ]; then printf '  [%2d] %-28s %s\n' "$n" "${v}" "$(mask "${!v:-}")"
      else printf '  [%2d] %-28s %s\n' "$n" "${v}" "${!v:-(vide)}"; fi
      n=$((n+1))
    done
    printf '\n'
    if ! read -r -p "Tout est correct ? (Entrée = continuer / numéro = corriger) : " answer; then answer=""; fi
    [ -z "$answer" ] && break
    case "$answer" in
      ''|*[!0-9]*) c_ylw "Tapez le numéro de l'élément à corriger, ou Entrée pour continuer."; continue;;
    esac
    if [ "$answer" -lt 1 ] || [ "$answer" -gt "${#FIELDS[@]}" ]; then
      c_ylw "Numéro hors de la liste."; continue
    fi
    field_at "$((answer-1))"; unset "$F_VAR"
    set +e; ask_one "$F_VAR" "$F_PROMPT" "$F_DEF" "$F_VAL" "$F_SEC" "$F_OPT"; set -e
  done
else
  # Pas d'écran de vérification : les validateurs restent le filet de protection.
  for f in "${FIELDS[@]}"; do
    IFS='|' read -r v _p _d val _sec opt <<< "$f"
    [ -z "$val" ] && continue
    [ -z "${!v:-}" ] && { [ -n "$opt" ] && continue; die "$v manquant (le mode --yes exige un .env rempli)."; }
    if ! msg="$("$val" "${!v}" 2>&1)"; then
      c_red "✖ $v invalide :"; printf '%s\n' "$msg"
      die "Corrigez le .env et relancez."
    fi
  done
fi

# Dérivés
NEXT_PUBLIC_APP_URL="https://${DOMAIN}"
NEXT_PUBLIC_ADMIN_URL="https://${DOMAIN}"

# ── 4. Génération des secrets (idempotente : ne génère que ce qui manque) ────
step "Génération des secrets"
gen_hex() { openssl rand -hex 32; }
gen_b64() { openssl rand -base64 32; }
: "${INTERNAL_SECRET:=$(gen_hex)}"
: "${INTERNAL_CRON_SECRET:=$(gen_hex)}"
: "${NUVEMSHOP_OAUTH_ENCRYPTION_KEY:=$(gen_hex)}"
: "${CPF_ENCRYPTION_KEY:=$(gen_b64)}"
: "${AI_CRED_AES_KEY:=$(gen_b64)}"
: "${WAHA_BYO_ENCRYPTION_KEY:=$(gen_b64)}"
: "${IMPERSONATE_COOKIE_SECRET:=$(gen_hex)}"
: "${LGPD_SIGNING_KEY:=$(gen_hex)}"
: "${WAHA_HMAC_SECRET:=$(gen_hex)}"
: "${SRH_TOKEN:=$(gen_hex)}"
: "${WAHA_API_KEY:=$(gen_hex)}"
# Le conteneur WAHA attend le HASH SHA512 hex ; l'app envoie le texte clair dans X-Api-Key.
WAHA_API_KEY_SHA512="$(printf '%s' "$WAHA_API_KEY" | openssl dgst -sha512 -hex | awk '{print $NF}')"
UPSTASH_REDIS_REST_TOKEN="$SRH_TOKEN"
c_grn "✓ secrets prêts"

# ── 5. Écrit le .env (600) ──────────────────────────────────────────────────
# Où Traefik trouve l'app. Les deux scénarios et les deux mesures qui les
# séparent sont dans `rede_do_traefik` ; ici on ne cherche dans Docker que ce qu'elle demande.
#
# Le bridge réservé à ce projet sort de `rede_reservada_do_proxy` (_common.sh),
# qui utilise le même nom que celui calculé par compose (NormalizeProjectName : minuscules, seulement
# [a-z0-9_-], `_`/`-` initiaux retirés). Un `basename` brut diverge sur un dossier avec
# majuscule, point ou underscore initial — et alors l'installateur crée un réseau et
# compose en cherche un autre.
rede_do_projeto="$(rede_reservada_do_proxy)"
if [ "$REVERSE_PROXY" = "traefik" ] && [ -z "${TRAEFIK_NETWORK:-}" ] && [ -n "$traefik_container" ]; then
  # "|| true" sur les deux : sans lui, le `die` explicatif juste en dessous — qui est le
  # BON traitement de ce cas — est inatteignable. Dans une affectation, le statut du
  # pipeline devient le statut du script ; si le panneau de l'hébergeur a recréé le proxy
  # entre la détection et ici, docker inspect sort 1, le 2>/dev/null avale le
  # message et l'installateur tombe sur le panneau d'erreur générique sans dire ce qui s'est passé.
  traefik_netmode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$traefik_container" 2>/dev/null || true)"
  traefik_redes="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$traefik_container" 2>/dev/null || true)"
  TRAEFIK_NETWORK="$(rede_do_traefik "$traefik_netmode" "$traefik_redes" "$rede_do_projeto")"
  [ "$traefik_netmode" = "host" ] && \
    c_dim "  (Traefik tourne en mode host, donc le CRM publie sur un réseau dédié : ${TRAEFIK_NETWORK})"
fi
if [ "$REVERSE_PROXY" = "traefik" ] && [ -z "${TRAEFIK_NETWORK:-}" ]; then
  die "Impossible de découvrir le réseau Docker de votre Traefik. Lancez 'docker network ls',
identifiez son réseau et mettez TRAEFIK_NETWORK=<nom> dans le .env avant de réessayer."
fi
# Vérifie (et crée, quand le réseau est le nôtre) — dans _common.sh, parce qu'update.sh
# a besoin de la même garantie avant son `dc up -d`. Applique aussi la valeur par défaut
# 'traefik', donc la variable est prête pour le .env juste en dessous.
garantir_rede_do_proxy

# ── Télémétrie : demander, ne pas présumer ──────────────────────────────────
# Issue #100. Avant, qui ne définissait pas SENTRY_DSN envoyait des rapports d'erreur au
# Sentry de la communauté sans avoir rien décidé — et ne l'apprenait que dans le message
# final, APRÈS l'installation. Dans un produit qui tourne sur l'infrastructure de l'utilisateur,
# avec les données de ses clients, le consentement vient avant.
# Qui a déjà une valeur dans le .env décide : la question n'écrase pas un choix antérieur.
if [ -z "${SENTRY_DSN+x}" ]; then
  if [ "$NONINTERACTIVE" = 1 ]; then
    # L'automatisation ne consent pour personne. Sans valeur explicite, c'est désactivé.
    SENTRY_DSN="off"
  else
    step "Télémétrie des erreurs (optionnelle)"
    printf '%s\n' "Nous pouvons recevoir les rapports d'ERREUR de cette installation (stack trace) pour"
    printf '%s\n' "corriger les bugs qui touchent tout le monde. Numéros d'identité, téléphones et e-mails sont remplacés,"
    printf '%s\n' "les en-têtes sensibles retirés et les jetons de webhook/invitation masqués dans l'URL."
    printf '%s\n' "Nous N'envoyons ni suivi de performance ni replay de session."
    printf '%s\n' "Les données de vos clients, conversations et base ne sortent JAMAIS d'ici."
    printf '\n%s\n' "Vous pouvez changer cela plus tard dans le .env, à tout moment."
    read -r -p "  Envoyer des rapports d'erreur anonymisés ? (o/N) " _tel
    if resposta_sim "${_tel:-}"; then
      SENTRY_DSN=""
      c_grn "✓ Télémétrie des erreurs activée — merci, cela aide le projet."
    else
      SENTRY_DSN="off"
      c_grn "✓ Télémétrie désactivée — rien ne sera envoyé."
    fi
  fi
fi

step "Écriture du .env"
umask 077

# Toute valeur sort par `envq` (défini plus haut, avec save_partial) : entre
# guillemets DOUBLES, avec `\`, `"`, `$` et accent grave échappés. Sans cela, un
# `APP_NAME=Boutique do Kofi` (ou un mot de passe avec # ou $) cassait tout ce qui lit ce
# fichier avec `source` — les scripts du kit et la recette du README lui-même
# (`source .env && curl ...`) —, et la version à guillemets simples d'avant
# cassait le troisième lecteur, le `env_file: .env` de Compose, pour tout nom avec
# apostrophe. Le pourquoi de chaque caractère échappé est dans le commentaire d'envq.

# ── Préserve ce que l'installateur NE connaît PAS ───────────────────────────
#
# Le bloc ci-dessous se termine par `} > .env`, qui est TRONQUANT : il réécrit le fichier
# entier à partir d'une liste fermée de clés. Qui avait ajouté une variable à la main — une
# clé de fournisseur d'IA que le kit ne demande pas encore, un réglage de modèle, un
# endpoint propre — PERDAIT tout en relançant le script. Et le
# README présente install.sh comme idempotent, donc relancer est exactement ce que
# l'on attend de qui veut corriger une donnée.
#
# Le symptôme est des pires : l'installation continue de démarrer, sans aucune erreur, et ce n'est
# qu'après que quelqu'un découvre que l'agent est revenu au fournisseur par défaut.
#
# Ici les clés inconnues sont lues dans le .env actuel et réémises à la fin du
# nouveau fichier. Comparaison par NOM de variable, contre la liste que ce script
# écrit — ainsi une nouvelle clé que le kit se met à connaître cesse d'être
# « étrangère » toute seule, sans que personne n'ait à maintenir une seconde liste.
PRESERVADAS=""
if [ -f .env ]; then
  # ── Avant tout : recharger le .env actuel dans l'environnement ───────────
  #
  # C'est le trou le PLUS GRAND, et il est invisible : plusieurs clés de la liste fermée sont
  # écrites sous la forme `envq X "${X:-}"` — la valeur de la variable de SHELL. Lors d'une
  # réexécution le shell n'a pas ces variables (l'installateur ne les collecte que dans le
  # flux interactif, et une clé optionnelle n'est pas demandée), donc elles sont
  # réécrites VIDES. Autrement dit : la clé OpenRouter que la personne a configurée à la
  # main est EFFACÉE par une ligne qui semblait seulement transmettre la valeur.
  #
  # NE rechargez PAS le .env ici. Il y avait un `set -a; . ./.env; set +a` à cet endroit,
  # justifié par « charger d'abord le .env actuel fait retomber `${X:-}` sur la
  # valeur qui existait déjà » — et cette prémisse est FAUSSE : `install.sh:757` fait déjà
  # `load_env .env` avant l'entretien, et `_common.sh:266` fait `printf -v` +
  # `export` inconditionnellement. Le fichier est déjà chargé et exporté ici.
  #
  # Ce que la relecture faisait en réalité, c'était DÉFAIRE l'entretien : la personne corrigeait
  # une valeur erronée à l'écran et le `.` l'écrasait avec l'ancienne du disque. Mesuré lors du
  # tri ; la préservation des variables étrangères (la boucle ci-dessous) continue de
  # fonctionner sans ces lignes.

  # `$KIT_DIR/install.sh`, pas `"$0"` : ce bloc tourne APRÈS le `cd` de la ligne
  # 662, et avec un `$0` relatif (le `bash install.sh` que documente README:34) le
  # grep cherche le fichier dans le mauvais répertoire et meurt sur « No such file or
  # directory » — tuant la 2e exécution, que README:126/:138 documentent comme
  # prise en charge. `KIT_DIR` (ligne 16) est absolu et insensible au `cd`.
  CONHECIDAS="$(grep -oE "^\s*envq [A-Z_][A-Z0-9_]*" "$KIT_DIR/install.sh" | awk '{print $2}' | sort -u)"
  while IFS= read -r linha; do
    case "$linha" in
      ''|'#'*) continue;;
    esac
    nome="${linha%%=*}"
    case "$nome" in
      *[!A-Za-z0-9_]*|'') continue;;
    esac
    if ! printf '%s\n' "$CONHECIDAS" | grep -qx "$nome"; then
      PRESERVADAS="${PRESERVADAS}${linha}
"
    fi
  done < .env
  if [ -n "$PRESERVADAS" ]; then
    c_ylw "→ préservation de $(printf '%s' "$PRESERVADAS" | grep -c .) variable(s) que vous avez ajoutée(s) à la main"
  fi
fi

# La tag que le propriétaire a choisie (le champ APP_IMAGE est modifiable dans l'entretien) décide
# du pull_policy des trois images. La règle est mesurée, pas esthétique : avec `always` et
# le registre qui ne répond pas pour cette référence, le `up -d` ÉCHOUE et le conteneur
# ne démarre pas, même avec l'image déjà sur le disque. Sur une tag immuable cela ne protège
# de rien — cela lie seulement le démarrage du CRM à la disponibilité de GHCR. Sur une tag mobile
# c'est l'inverse : sans `always`, la nouvelle version n'arrive jamais.
# Ne regarde que le dernier segment du chemin : `registry.local:5000/x/y` a un ':' et N'a PAS
# de tag, et un `${APP_IMAGE##*:}` naïf renverrait "5000/x/y" comme si c'en était
# une. Un `@sha256:...` tombe ici comme tag immuable, ce qui est correct.
_ref_final="${APP_IMAGE##*/}"
case "$_ref_final" in
  *@sha256:*)
    # L'opérateur a épinglé l'app par DIGEST. Dériver la tag de là produirait
    # `deskcomm-worker:<hash-de-l-app>` — une référence qui n'existe nulle
    # part, et le `pull` échouerait avec « manifest unknown » sans que personne ne comprenne
    # pourquoi. Worker et scheduler vont sur le canal stable, et l'avertissement sort parce que
    # qui a épinglé par digest avait une raison et doit savoir qu'elle ne s'est pas
    # propagée aux deux autres.
    TAG_ALVO="stable"
    c_ylw "⚠ APP_IMAGE est épinglée par digest."
    c_ylw "  Le worker et le scheduler restent sur 'stable' — ajustez WORKER_IMAGE/SCHEDULER_IMAGE"
    c_ylw "  dans le .env si vous en avez aussi besoin sur un digest précis."
    ;;
  *:*) TAG_ALVO="${_ref_final##*:}" ;;
  *)   TAG_ALVO="latest" ;;   # une image sans ':' est :latest par définition de Docker
esac
case "$TAG_ALVO" in
  latest|main|stable) PULL_POLICY_ALVO="always" ;;
  *)                  PULL_POLICY_ALVO="missing" ;;
esac

{
  printf '# Généré par install.sh — NE PAS committer. Contient des secrets.\n'
  envq APP_IMAGE "$APP_IMAGE"
  envq APP_PULL_POLICY "$PULL_POLICY_ALVO"
  # Worker et scheduler suivent la MÊME version que l'app : l'un en 1.2.1 et l'autre en
  # `latest`, c'est une matrice de compatibilité que personne n'a testée. Ces deux
  # images existent depuis que le worker a cessé d'être `build:`-only — avant cela
  # il était compilé ici sur le VPS et aucune mise à jour ne l'atteignait jamais.
  envq WORKER_IMAGE "${IMG_WORKER}:${TAG_ALVO}"
  envq WORKER_PULL_POLICY "$PULL_POLICY_ALVO"
  envq SCHEDULER_IMAGE "${IMG_SCHEDULER}:${TAG_ALVO}"
  envq SCHEDULER_PULL_POLICY "$PULL_POLICY_ALVO"
  envq DOMAIN "$DOMAIN"
  envq ACME_EMAIL "$ACME_EMAIL"
  printf '# Proxy inverse : "caddy" (le kit démarre le sien sur les ports 80/443) ou "traefik"\n'
  printf '# (le VPS a déjà un Traefik sur ces ports — Hostinger, Coolify, Dokploy...).\n'
  printf '# En "traefik", docker-compose.traefik.yml entre en jeu : il désactive Caddy et\n'
  printf '# publie l’app via des labels. TRAEFIK_* n’est lu que dans ce mode.\n'
  envq REVERSE_PROXY "$REVERSE_PROXY"
  # La valeur par défaut vit ici, avec ses frères TRAEFIK_* juste en dessous, et non dans une
  # affectation isolée plus haut : en mode caddy personne ne DÉCIDE de cette variable, et
  # dépendre d'une ligne lointaine pour qu'elle existe est le genre de lien qu'un
  # refactor du bloc proxy coupe sans s'en apercevoir. Avec `set -u` le prix est le VPS
  # propre — l'installation la plus courante de toutes — qui s'arrête ici et laisse le .env à
  # moitié, avec le bloc Traefik vert dans tous les tests.
  envq TRAEFIK_NETWORK "${TRAEFIK_NETWORK:-traefik}"
  envq TRAEFIK_ENTRYPOINT_HTTP "${TRAEFIK_ENTRYPOINT_HTTP:-web}"
  envq TRAEFIK_ENTRYPOINT "${TRAEFIK_ENTRYPOINT:-websecure}"
  envq TRAEFIK_CERTRESOLVER "${TRAEFIK_CERTRESOLVER:-letsencrypt}"
  envq NEON_AUTH_BASE_URL "$NEON_AUTH_BASE_URL"
  envq NEON_DATA_API_URL "$NEON_DATA_API_URL"
  envq NEON_SERVICE_ROLE_JWT "$NEON_SERVICE_ROLE_JWT"
  envq NEON_AUTH_COOKIE_SECRET "$NEON_AUTH_COOKIE_SECRET"
  envq NEON_DATABASE_URL "$NEON_DATABASE_URL"
  # NEON_DATABASE_ADMIN_URL n’est jamais écrit dans le .env des conteneurs.
  # Il reste fourni ponctuellement à url_do_schema/update.sh par l’opérateur.
  envq NEXT_PUBLIC_APP_URL "$NEXT_PUBLIC_APP_URL"
  envq NEXT_PUBLIC_ADMIN_URL "$NEXT_PUBLIC_ADMIN_URL"
  printf '# Marque de l’installation (marque blanche). Remplissez APP_LOGO_URL avec l’URL d’une\n'
  printf '# image publique pour remplacer le texte par un logo dans la barre latérale. Voir lib/branding.ts.\n'
  printf '# APP_ACCENT_HEX est la SEMENCE de la couleur : la base (platform_branding) prend le relais après\n'
  printf '# la première lecture, mais c’est d’ici que vient la couleur des e-mails d’accès, que\n'
  printf '# marca-emails.sh pousse vers GoTrue et que la base n’atteint pas.\n'
  envq APP_NAME "$APP_NAME"
  envq APP_LOGO_URL "${APP_LOGO_URL:-}"
  # Demander sans enregistrer serait PIRE que ne pas demander : ce bloc se termine par
  # `} > .env`, qui TRONQUE le fichier à partir de la liste fermée d'`envq` au-dessus et
  # en dessous — la personne répondrait la couleur et la perdrait en silence, dans la même
  # exécution. Tant que la clé était hors de cette liste, elle n'entrait pas non plus dans
  # `CONHECIDAS` (le grep d'`envq` juste au-dessus), donc une couleur mise à la main dans le .env
  # survivait par hasard, grâce à la boucle de préservation — et ce n'est pas de hasard que
  # l'entretien a besoin.
  envq APP_ACCENT_HEX "${APP_ACCENT_HEX:-}"
  printf '# Adresse de support que voit le CLIENT FINAL (compte suspendu, facturation).\n'
  printf '# Vide = l’écran n’affiche aucune adresse.\n'
  envq SUPPORT_EMAIL "${SUPPORT_EMAIL:-}"
  # Les trois ci-dessus et les deux ci-dessous entrent ici pour la MÊME raison, et non par
  # symétrie : le .env est écrit avec troncature (`} > .env`, à la fermeture de ce
  # bloc), donc une clé que ce script n'écrit pas est EFFACÉE à l'exécution
  # suivante. Qui avait mis la clé Resend à la main la perdait à la première mise à jour —
  # dans un script que le README présente comme idempotent.
  printf '# E-mail transactionnel. RESEND_FROM_EMAIL doit appartenir à un domaine\n'
  printf '# VÉRIFIÉ dans VOTRE compte Resend. Vide = e-mail désactivé : l’invitation\n'
  printf '# affiche le lien d’acceptation à l’écran et l’export RGPD reste en attente.\n'
  envq RESEND_API_KEY "${RESEND_API_KEY:-}"
  envq RESEND_FROM_EMAIL "${RESEND_FROM_EMAIL:-}"
  printf '# Le fournisseur que vous avez choisi à l’installation. C’est ce qui fait que la 2e exécution\n'
  printf '# d’install.sh arrive déjà avec votre choix par défaut, au lieu de le redeviner\n'
  printf '# d’après les clés présentes. L’app ne lit pas cette variable.\n'
  envq AI_PROVIDER "${AI_PROVIDER:-anthropic}"
  # `${ANTHROPIC_API_KEY:-}`, pas `$ANTHROPIC_API_KEY` : qui choisit OpenRouter
  # ou OpenAI ne passe jamais par le champ Anthropic, et sous `set -u` (ligne 12) la
  # variable non liée faisait tomber le script ICI — au milieu de l'écriture du
  # .env, laissant le fichier à moitié et l'installation sans moyen de continuer.
  envq ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
  envq AI_GATEWAY_API_KEY "${AI_GATEWAY_API_KEY:-}"
  printf '# OpenRouter : alternative à l’AI Gateway pour le chat de l’IA. L’ordre de\n'
  printf '# résolution est AI_GATEWAY_API_KEY > OPENROUTER_API_KEY > fournisseur direct,\n'
  printf '# donc laisser vide NE change rien — le comportement actuel continue.\n'
  printf '# BASE_URL vide = https://openrouter.ai/api/v1 (ne changez que si vous utilisez un proxy).\n'
  envq OPENROUTER_API_KEY "${OPENROUTER_API_KEY:-}"
  envq OPENROUTER_BASE_URL "${OPENROUTER_BASE_URL:-}"
  printf '# OpenAI : transcription des audios WhatsApp + embeddings du RAG.\n'
  printf '# Optionnel — sans elle l’IA répond sans la base et demande l’audio en texte.\n'
  envq OPENAI_API_KEY "${OPENAI_API_KEY:-}"
  printf '# Télémétrie des erreurs (vous avez choisi ceci pendant l’installation).\n'
  printf '#   "off"  = n’envoie rien.\n'
  printf '#   vide   = seulement les ERREURS vers le Sentry de la communauté, avec identité/téléphone/e-mail\n'
  printf '#            remplacés et jeton d’URL masqué. Sans trace, sans replay.\n'
  printf '#   <dsn>  = envoie vers VOTRE Sentry (alors avec performance et replay).\n'
  envq SENTRY_DSN "${SENTRY_DSN:-}"
  envq INTERNAL_SECRET "$INTERNAL_SECRET"
  envq INTERNAL_CRON_SECRET "$INTERNAL_CRON_SECRET"
  envq NUVEMSHOP_OAUTH_ENCRYPTION_KEY "$NUVEMSHOP_OAUTH_ENCRYPTION_KEY"
  envq CPF_ENCRYPTION_KEY "$CPF_ENCRYPTION_KEY"
  envq AI_CRED_AES_KEY "$AI_CRED_AES_KEY"
  envq WAHA_BYO_ENCRYPTION_KEY "$WAHA_BYO_ENCRYPTION_KEY"
  envq IMPERSONATE_COOKIE_SECRET "$IMPERSONATE_COOKIE_SECRET"
  envq LGPD_SIGNING_KEY "$LGPD_SIGNING_KEY"
  envq WAHA_API_BASE_URL "http://waha:3000"
  envq WAHA_WEBHOOK_BASE_URL "http://app:3000"
  envq WAHA_API_KEY "$WAHA_API_KEY"
  envq WAHA_API_KEY_SHA512 "$WAHA_API_KEY_SHA512"
  envq WAHA_HMAC_SECRET "$WAHA_HMAC_SECRET"
  printf '# "true" exige une signature sur tout webhook WAHA. WAHA Core NE signe PAS,\n'
  printf '# donc activer ceci sans WAHA Plus (ou un proxy qui signe) arrête l’ingestion\n'
  printf '# des messages. La route globale n’est déjà plus publiée sur Internet (voir Caddyfile).\n'
  envq WAHA_WEBHOOK_REQUIRE_SIGNATURE "${WAHA_WEBHOOK_REQUIRE_SIGNATURE:-false}"
  printf '# Reprend les sessions déjà appairées quand le conteneur du transport redémarre.\n'
  printf '# Sans cela le numéro reste appairé dans le volume et MUET jusqu’à ce que quelqu’un ouvre l’écran\n'
  printf '# et clique sur Reconnecter — rien n’entre ni ne sort entre-temps.\n'
  envq WHATSAPP_RESTART_ALL_SESSIONS "${WHATSAPP_RESTART_ALL_SESSIONS:-True}"
  # ÉPINGLÉE. Sans la tag, `devlikeapro/waha` est `:latest`, et cette ligne écrivait cela
  # dans le .env de chaque client — par-dessus la valeur par défaut épinglée du compose, qui alors
  # n'arrivait jamais à personne. Le `dc pull` de chaque mise à jour livrait n'importe quelle version
  # que l'amont avait publiée, sans que personne ne l'ait testée.
  # `latest-2026.7.2` est le même digest que `latest` aujourd'hui (65e593e30bb7…).
  envq WAHA_IMAGE "${WAHA_IMAGE:-devlikeapro/waha:latest-2026.7.2}"
  envq WAHA_DEFAULT_ENGINE "${WAHA_DEFAULT_ENGINE:-NOWEB}"
  envq UPSTASH_REDIS_REST_URL "http://srh:80"
  envq UPSTASH_REDIS_REST_TOKEN "$UPSTASH_REDIS_REST_TOKEN"
  envq SRH_TOKEN "$SRH_TOKEN"
  envq NODE_ENV "production"
  envq NUVEMSHOP_ENABLED "false"
  envq INTERNAL_AGENT_RUN_STUB "false"
  envq OWNER_EMAIL "$OWNER_EMAIL"
  envq OWNER_PASSWORD "$OWNER_PASSWORD"
  # Les variables que vous avez ajoutées à la main, de retour — dans le format où elles
  # étaient, sans passer par envq (la valeur d'origine arrive déjà avec ses guillemets).
  if [ -n "$PRESERVADAS" ]; then
    printf '\n# ── Ajoutées manuellement (préservées par install.sh) ──\n'
    printf '%s' "$PRESERVADAS"
  fi
} > .env
chmod 600 .env
# Le .env définitif existe : le brouillon a rempli son rôle et disparaît — le laisser sur le
# disque serait une seconde copie des secrets, et périmée à la première
# correction que quelqu'un fera dans le .env.
rm -f "$PARTIAL_FILE"
c_grn "✓ .env écrit (permission 600)"

# ── 6. Vérification DNS ─────────────────────────────────────────────────────
fase 3 "Base de données et domaine"
step "Vérification du DNS de ${DOMAIN}"
public_ip="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || echo '')"
# Un domaine peut avoir A (IPv4) et AAAA (IPv6) en même temps, et le résolveur ne
# garantit pas d'ordre entre eux. Comparer seulement la PREMIÈRE adresse (l'ancien `hosts`
# + `head -1`) donnait une fausse alerte chaque fois que l'AAAA venait avant l'A : le DNS
# était correct, le SSL allait être émis normalement, et l'installateur disait quand même
# que le domaine ne pointait pas ici — effrayant la personne qui installe pile au moment
# où elle a le plus besoin de confiance. `ahosts` liste TOUTES les adresses ; il suffit
# que L'UNE d'elles soit l'IP du VPS.
resolved="$(getent ahosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || echo '')"
if [ -n "$public_ip" ] && case " $resolved " in *" $public_ip "*) true;; *) false;; esac; then
  c_grn "✓ ${DOMAIN} → ${public_ip} (pointe vers ce VPS)"
else
  # Un DNS fraîchement pointé met des minutes à se propager : arriver ici est un état NORMAL,
  # pas une erreur. Avant il y avait une seule sortie — répondre exactement « s » — et
  # toute autre chose tuait l'installation. Maintenant la valeur par défaut est d'attendre avec
  # la personne : Entrée revérifie, et quitter est un choix explicite de sa part.
  while [ "$NONINTERACTIVE" = 0 ]; do
    c_ylw "⚠ ${DOMAIN} pointe vers '${resolved:-rien}' et l'IP de ce VPS est '${public_ip:-inconnue}'."
    c_ylw "  Le SSL (Let's Encrypt) ne sera émis que lorsque l'enregistrement A pointera ici."
    printf '\n%s\n'   "  Dans le panneau de votre domaine, créez un enregistrement A qui pointe ${DOMAIN}"
    printf '%s\n\n'   "  vers ${public_ip:-l’IP de ce serveur}. Cela prend généralement quelques minutes."
    printf '%s\n'     "  Entrée = vérifier de nouveau"
    printf '%s\n'     "  c      = continuer quand même (le site démarre sans cadenas jusqu'à ce que le DNS soit valide)"
    printf '%s\n'     "  q      = quitter et revenir plus tard (vos réponses sont gardées)"
    if ! read -r -p "  > " a; then a="s"; fi
    case "$(printf '%s' "$a" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" in
      c|continuer|continuar) c_ylw "  On continue sans DNS prêt — pensez à pointer l'enregistrement A."; break;;
      q|quitter|s|sair|n|non|nao) die "Ajustez l'enregistrement A de ${DOMAIN} vers ${public_ip:-l’IP de ce serveur} et relancez l'installateur.";;
      *)
        resolved="$(getent ahosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || echo '')"
        if [ -n "$public_ip" ] && case " $resolved " in *" $public_ip "*) true;; *) false;; esac; then
          c_grn "✓ ${DOMAIN} → ${public_ip} (pointe maintenant vers ce VPS)"; break
        fi
        c_ylw "  Pas encore propagé. Vous pouvez attendre et réessayer."
        ;;
    esac
  done
fi

# ── 7. Applique le schéma (baseline) dans la base — via un conteneur postgres ─
step "Application du schéma dans la base (baseline.sql)"
# Tout d'ici à la fin de l'étape 8 parle à la base via `url_do_schema`
# (_common.sh), pas via la chaîne qui va dans le `.env` : créer une extension, appliquer le
# baseline et promouvoir le propriétaire exigent le PROPRIÉTAIRE de la base, et sur une base auto-hébergée la
# chaîne de l'app est — sur notre recommandation — un rôle restreint. Sans
# `NEON_DATABASE_ADMIN_URL` déclarée, les deux sont la même, ce qui est le cas du cloud.
if [ -f neon/migrations/0001_whatsapp_os_baseline.sql ]; then
  # Le baseline est un pg_dump : il référence public.vector, public.citext et gin_trgm_ops
  # (pg_trgm) mais NE crée PAS les extensions. Elles ne sont pas activées dans le schéma public par
  # défaut — nous les créons ici, sinon le schéma casse au milieu (ex. : « type public.vector does
  # not exist »). Idempotent (if not exists).
  docker run --rm postgres:17-alpine psql "$(url_do_schema)" -v ON_ERROR_STOP=1 -c \
    "create extension if not exists vector with schema public; create extension if not exists citext with schema public; create extension if not exists pg_trgm with schema public;" \
    >/dev/null 2>&1 \
    && c_grn "✓ extensions (vector, citext, pg_trgm) activées dans public" \
    || { c_ylw "⚠ impossible d'activer les extensions — le schéma peut échouer ci-dessous."
         c_ylw "  Base auto-hébergée ? Créer une extension exige le propriétaire de la base : relancez avec"
         c_ylw "  NEON_DATABASE_ADMIN_URL='postgresql://<proprietaire>:<motdepasse>@<hote>:5432/postgres'"; }
  SCHEMA_LOG="$PROJECT_DIR/baseline-apply.log"
  # Nouvelle base ou réexécution ? Réappliquer avec ON_ERROR_STOP s'arrêterait au premier
  # « existe déjà » (ex. : multiple primary keys) et SAUTERAIT le reste du fichier —
  # y compris l'annexe avec les nouvelles migrations. Base existante = mode update
  # (même contrat qu'update.sh) ; nouvelle base = ON_ERROR_STOP et l'échec est FATAL
  # (schéma à moitié = app sans RLS).
  # Le `|| true` n'est pas de la paresse : sans lui, un psql qui échoue ici sort avec le code 2
  # dans la substitution et, avec `set -e` + `pipefail`, fait tomber l'installateur sans
  # rien afficher (le 2>/dev/null avait déjà avalé la cause). Nous préférons continuer et
  # laisser l'erreur apparaître là où il est possible de l'expliquer.
  has_schema="$(docker run --rm postgres:17-alpine psql "$(url_do_schema)" -tAc \
    "select 1 from information_schema.tables where table_schema='public' and table_name='organizations' limit 1" 2>/dev/null | tr -d '[:space:]' || true)"

  if [ "$has_schema" = "1" ]; then
    c_ylw "• le schéma existe déjà — réapplication en mode update (les erreurs « existe déjà » sont attendues et restent dans le journal)"
    raw="$(docker run --rm -i -v "$PROJECT_DIR/neon/migrations/0001_whatsapp_os_baseline.sql:/baseline.sql:ro" \
          postgres:17-alpine psql "$(url_do_schema)" -q -f /baseline.sql 2>&1 || true)"
    printf '%s\n' "$raw" > "$SCHEMA_LOG"
    benign='already exists|multiple primary keys|multiple default values|is already a member|already a partition'
    unexpected="$(printf '%s\n' "$raw" | grep -iE 'ERROR|FATAL' | grep -viE "$benign" || true)"
    if [ -n "$unexpected" ]; then
      c_ylw "⚠ Erreurs de base qui NE sont PAS celles attendues (journal complet : $SCHEMA_LOG) :"
      printf '%s\n' "$unexpected" | head -20
    else
      c_grn "✓ schéma réappliqué (annexe des migrations incluse)"
    fi
  else
    if docker run --rm -i -v "$PROJECT_DIR/neon/migrations/0001_whatsapp_os_baseline.sql:/baseline.sql:ro" \
        postgres:17-alpine psql "$(url_do_schema)" -v ON_ERROR_STOP=1 -f /baseline.sql \
        > "$SCHEMA_LOG" 2>&1; then
      c_grn "✓ schéma appliqué (journal : $SCHEMA_LOG)"
    else
      tail -5 "$SCHEMA_LOG"
      die "le baseline a échoué sur une NOUVELLE base — le schéma resterait incomplet (sans RLS). Journal complet : $SCHEMA_LOG
     Si l'erreur parle de permission : le baseline exige le PROPRIÉTAIRE de la base. Sur une base auto-hébergée,
     relancez avec NEON_DATABASE_ADMIN_URL='postgresql://<proprietaire>:<motdepasse>@<hote>:5432/postgres'
     — elle ne sert qu'au schéma et N'est PAS écrite dans le .env des conteneurs."
    fi
  fi

  # Vérification réelle, pas un vœu pieux : l'app a besoin des tables principales.
  n_tables="$(docker run --rm postgres:17-alpine psql "$(url_do_schema)" -tAc \
    "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null | tr -d '[:space:]')"
  if [ "${n_tables:-0}" -ge 30 ]; then
    c_grn "✓ vérification : ${n_tables} tables dans le schéma public"
  else
    c_ylw "⚠ vérification : seulement ${n_tables:-0} tables dans le schéma public — consultez $SCHEMA_LOG"
  fi
else
  c_ylw "⚠ neon/migrations/0001_whatsapp_os_baseline.sql introuvable — étape sautée (appliquez le schéma manuellement)."
fi

# ── 7.5 E-mails Neon Auth ────────────────────────────────────────────────────
# Les templates d’email et le domaine de confiance doivent être configurés dans
# Neon Managed Better Auth. Le kit n’appelle plus l’ancien script Supabase : la
# forme de l’API d’administration Neon Auth beta n’est pas supposée.
c_ylw "⚠ Configurez les emails, le domaine de confiance et la confirmation de compte dans Neon Auth."

# ── 8. Préparation du premier admin Neon ─────────────────────────────────────
# Neon Managed Better Auth gère la création de session et la confirmation email.
# Le kit ne simule pas une API admin dont la forme dépend de la beta Neon Auth.
# Après le démarrage, créez le premier compte via l’interface /signup puis
# associez-le à la première organisation depuis le panneau admin. Cette étape
# évite de stocker un mot de passe ou un token Auth dans le shell et échoue
# explicitement si l’instance Neon n’est pas configurée.
if [ -z "${NEON_AUTH_BASE_URL:-}" ] || [ -z "${NEON_DATA_API_URL:-}" ] || [ -z "${NEON_SERVICE_ROLE_JWT:-}" ]; then
  c_ylw "⚠ Neon Auth/Data API/JWT non configurés : création du premier admin à faire après configuration de Dokploy."
else
  c_grn "✓ Neon Auth et Data API configurés — créez le premier compte depuis l’interface après le démarrage"
fi
# ── 9. Démarre la stack ─────────────────────────────────────────────────────
fase 4 "Mise en ligne du CRM"
step "Téléchargement de l'image et démarrage des services"
# Le garde-fou existe parce que donner une `image:` à un service qui était build-only a changé le
# comportement du `pull` : avant il SAUTAIT le worker (« Skipped - No image to be
# pulled »), maintenant il FAIT ÉCHOUER toute l'opération si la référence ne se résout pas. Et il y a
# trois raisons réelles pour qu'elle ne se résolve pas juste après une release : un nouveau paquet sur
# GHCR naît PRIVÉ jusqu'à ce que quelqu'un change la visibilité à la main ; la tag git existe
# quelques minutes avant les images ; et GHCR peut être hors service.
#
# Sans ce garde-fou, une NOUVELLE installation mourait à l'étape 9 — avec la base déjà
# provisionnée et le .env déjà écrit. Le `up -d` suivant n'a pas besoin du pull : le
# worker et le scheduler ont `build:` à côté de l'`image:`, et Compose les construit
# quand l'image n'existe pas (mesuré).
if ! dc pull; then
  c_ylw "⚠ Impossible de télécharger toutes les images du registre."
  c_ylw "  Je continue quand même : ce qui manque est construit ici (plus lent, même résultat)."
fi
dc up -d
c_grn "✓ conteneurs en ligne"

# ── 10. Contrôle de santé ───────────────────────────────────────────────────
step "Attente que l'app soit en bonne santé"
# Avant, ceci ouvrait un socket sur le port 3000 et s'en contentait. Le port s'ouvre dès
# que Node démarre, donc le « ✓ » sortait alors que l'app n'avait pas encore de base — et le bloc
# « Installation terminée ! » sortait juste derrière, inconditionnellement. Un faux vert
# au moment exact où la personne décide si elle fait confiance au produit. Maintenant le critère
# est le même qu'update.sh : la route /api/v1/health doit répondre "status":"ok".
if health_body="$(wait_app_healthy 30 3)"; then
  APP_SAUDAVEL=1
  c_grn "✓ app en ligne et en bonne santé"
else
  APP_SAUDAVEL=0
  c_ylw "⚠ les conteneurs ont démarré, mais l'app n'a pas répondu qu'elle est en bonne santé."
  # "|| true" : même famille que le pipe qui tuait supabase-provision.sh — le
  # corps dépasse 200 octets, head ferme le pipe et printf reçoit SIGPIPE.
  [ -n "$health_body" ] && c_dim "  dernière réponse : $(printf '%s' "$health_body" | head -c 200 || true)"
fi

# ── 11. Automatisations (cron du drain d'événements) ────────────────────────
step "Activation des automatisations"
ensure_encryption_key .env
setup_event_log_drain_cron
setup_update_agent_cron

# ── Fin ─────────────────────────────────────────────────────────────────────
# L'app n'a pas confirmé qu'elle est debout : dire « Installation terminée ! » ici serait
# mentir sur le seul écran que la personne lira en entier. Elle reçoit l'état réel et
# le chemin de diagnostic — et non la recette d'effacement total de show_recovery,
# qui existe pour qui s'est arrêté au MILIEU. Ici rien n'est resté à moitié : la config
# est enregistrée et la stack est debout ; il manque la réponse de l'app.
if [ "${APP_SAUDAVEL:-0}" != 1 ]; then
  cat <<INCOMPLETO

$(c_ylw "═══════════════════════════════════════════════════════")
$(c_ylw " Presque fini — il manque la réponse de l'app")
$(c_ylw "═══════════════════════════════════════════════════════")

  La configuration est enregistrée et les conteneurs sont en ligne. Vous n'avez PAS besoin
  de refaire quoi que ce soit — il manque seulement que l'app dise qu'elle est en bonne santé.

  La raison la plus courante est une clé manquante ou erronée dans le .env. Le journal dit laquelle :

       docker compose $(dc_files) logs --tail=50 app

     cherchez : [env] Échec de validation

  Diagnostic complet des services :

       bash ${KIT_DIR}/healthcheck.sh

  Après avoir corrigé le .env, il suffit de redémarrer (rien n'est perdu) :

       docker compose $(dc_files) up -d

  Bloqué ? Apportez le journal à la communauté — des gens sont déjà passés par là :

       ${COMUNIDADE_URL}

INCOMPLETO
  # Sort != 0 pour que l'automatisation (et le --yes) sache que cela ne s'est pas terminé en bonne santé,
  # mais sans le trap : la recette « effacez tout et recommencez » n'a pas sa place ici.
  trap - EXIT
  exit 1
fi

cat <<DONE

$(c_grn "═══════════════════════════════════════════════════════")
$(c_grn " Installation terminée !")
$(c_grn "═══════════════════════════════════════════════════════")

  1. Accédez à :  https://${DOMAIN}
     (le SSL prend ~1 min à être émis au premier accès)

  2. Connectez-vous avec :
       e-mail :       ${OWNER_EMAIL}
       mot de passe : (celui que vous avez défini)

  3. Connectez WhatsApp (2e étape de l'onboarding) :
       Laissez WhatsApp DÉJÀ OUVERT dans Paramètres → Appareils connectés
       avant d'ouvrir l'écran — le QR code n'est valable que quelques minutes. S'il expire,
       le CRM a lui-même le bouton « Générer un nouveau QR code ».

  4. À la fin de l'onboarding, le CRM peut demander la vérification en deux étapes :
       ayez Google Authenticator/Authy sous la main et GARDEZ les codes de
       récupération qui s'affichent. Téléphone perdu ? bash hostgator-setup-kit/reset-mfa.sh ${OWNER_EMAIL}

$(c_grn "  ─── La communauté ─────────────────────────────────────")

  C'est là que sortent les annonces de nouvelle version, les agents que d'autres personnes ont déjà
  configurés et les réponses de ceux qui font tourner exactement ce CRM :

       ${COMUNIDADE_URL}

  Télémétrie : par défaut les erreurs de cette installation sont envoyées au Sentry du
  projet, ce qui aide à corriger des défauts qui touchent tout le monde. Pour la désactiver,
  mettez SENTRY_DSN='off' dans le .env et lancez : docker compose $(dc_files) up -d

  Commandes utiles :
    voir les journaux : docker compose $(dc_files) logs -f app
    redémarrer :        docker compose $(dc_files) restart
    mettre à jour :     bash hostgator-setup-kit/update.sh
    sauvegarde :        bash hostgator-setup-kit/backup.sh
    changer la config : bash hostgator-setup-kit/install.sh
                        (affiche tout ce que vous avez répondu et permet de corriger par numéro)
    recommencer :       docker compose $(dc_files) down -v && rm -f .env
                        (arrête tout ; ensuite relancez install.sh)

DONE
