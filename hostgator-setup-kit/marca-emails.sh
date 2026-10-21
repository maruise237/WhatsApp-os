#!/usr/bin/env bash
#
# Pousse les e-mails d'ACCÈS (créer un compte et récupérer le mot de passe) avec la marque de
# l'installation — objet, corps, couleur du bouton — et configure Site URL / Redirect
# URLs, qui sont un prérequis pour que le lien fonctionne.
#
#   bash marca-emails.sh                      # lit ../.env et pousse
#   bash marca-emails.sh --render-em /tmp/x   # fait seulement le rendu, ne pousse rien
#
# ── POURQUOI C'EST UN SCRIPT, ET NON UNE FONCTION DE L'APP ──────────────────
#
# Ces deux e-mails sont rendus par GoTrue, un PROCESSUS TIERS qui
# tourne sur l'infrastructure de Supabase. Aucun TypeScript à nous n'y est exécuté : il
# n'existe pas de `marcaDaSaida()` à appeler, pas de résolveur à brancher. Le seul
# canal est du texte poussé par API. C'est pourquoi l'artefact livrable n'est pas le HTML
# — c'est le mécanisme qui le pousse.
#
# Et il compte plus que les autres e-mails : celui de confirmation de compte est le
# PREMIER artefact que reçoit tout utilisateur d'un revendeur. Sans ce
# script, il arrive en disant « Confirm Your Signup » en anglais, dans le modèle par défaut
# de Supabase, sans aucune marque.
#
# ── CE QUI A ÉTÉ MESURÉ (2026-08-14) ───────────────────────────────────────
#
# Le commentaire de `app/auth/confirm/route.ts` affirmait qu'éditer le corps de
# l'e-mail exige un SMTP personnalisé. Mesuré contre la vraie Management API :
#
#   PATCH /v1/projects/{ref}/config/auth  {"mailer_templates_confirmation_content": …}
#     → HTTP 200 sur un projet avec `smtp_host: null`
#     → le GET suivant renvoie le contenu OCTET PAR OCTET
#
# Autrement dit : le corps de l'e-mail est modifiable sans SMTP propre. Ce que le SMTP propre
# résout, c'est le VOLUME (l'expéditeur intégré de Supabase a une limite basse).
#
# Mesuré aussi : un projet en pause répond `400 {"message":"Project is paused."}`.
# C'est pourquoi l'étape de RELECTURE ci-dessous n'est pas du zèle — c'est la différence entre « c'est monté »
# et « l'API a répondu quelque chose ». Un script qui se fie au 2xx rapporte un succès
# sur un projet en pause.
#
# ── NE FAIT JAMAIS TOMBER SON APPELANT ─────────────────────────────────────
#
# `install.sh` et `update.sh` appellent ce script. Absence de jeton, base auto-hébergée
# (sans Management API), projet en pause, réseau coupé : tout affiche quoi
# faire et sort 0. Une installation ne peut pas mourir parce que l'e-mail de bienvenue
# est resté en anglais.
#
# Dépendances : les mêmes que le kit (bash + curl + awk). Sans jq, sans python.

set -uo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJ_DIR="$(cd "$KIT_DIR/.." && pwd)"
API="https://api.supabase.com/v1"

# shellcheck source=_common.sh
. "$KIT_DIR/_common.sh"

# Vide jusqu'à la fin de la boucle : ainsi `--projeto` et `--env` ne dépendent pas de l'ordre
# dans lequel ils sont passés.
ENV_FILE=""
RENDER_EM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --render-em) RENDER_EM="${2:-}"; shift 2 || shift;;
    --env)       ENV_FILE="${2:-}";  shift 2 || shift;;
    # `install.sh` peut avoir été appelé HORS du dépôt (il clone et
    # entre), et alors `KIT_DIR/..` n'est pas la racine du projet — ni le `.env` ni
    # `supabase/templates/` ne seraient là. Celui qui sait où se trouve le projet, c'est
    # l'appelant ; c'est pourquoi l'origine est un paramètre, pas une supposition.
    --projeto)   PROJ_DIR="${2:-}"; shift 2 || shift;;
    -h|--help)   sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0;;
    *)           c_ylw "option inconnue : $1"; exit 0;;
  esac
done
[ -n "$ENV_FILE" ] || ENV_FILE="$PROJ_DIR/.env"

# Sort avec succès après avoir enseigné l'étape manuelle. C'est le contrat de ce script :
# il informe, il n'interrompt pas.
instrua_e_saia() {
  printf '\n' >&2
  c_ylw "⚠ $1"
  printf '\n' >&2
  c_dim "  Pour le faire à la main, dans le panneau Supabase :"
  c_dim "    1. Authentication → URL Configuration"
  c_dim "         Site URL:      ${APP_URL:-https://VOTRE_DOMAINE}"
  c_dim "         Redirect URLs: ${APP_URL:-https://VOTRE_DOMAINE}/auth/confirm"
  c_dim "    2. Authentication → Email Templates → Confirm signup / Reset password"
  c_dim "         <a href=\"{{ .RedirectTo }}&token_hash={{ .TokenHash }}\">Confirmer</a>"
  c_dim "         ⚠ le séparateur est & — un ? ici casse le lien (devient ?type=x?token_hash=y)"
  printf '\n' >&2
  exit 0
}

# ── 1. La marque, lue dans le .env de l'installation ───────────────────────
[ -f "$ENV_FILE" ] && load_env "$ENV_FILE"

APP_NOME="${APP_NAME:-}"
[ -n "${APP_NOME//[[:space:]]/}" ] || APP_NOME="DeskcommCRM"
APP_URL="${NEXT_PUBLIC_APP_URL:-}"

# `#506d48` est l'accent du thème clair du produit (degré 600 de la rampe dans
# lib/branding/regua-do-produto.ts) — le même plancher que `lib/branding/saida.ts`
# utilise dans les e-mails. Ce n'est pas une couleur inventée ici.
#
# La couleur sort du `.env`, et depuis le 2026-08-14 `install.sh` DEMANDE et écrit
# `APP_ACCENT_HEX` (champ dans `FIELDS`, validé par `v_hex`, écrit par l'`envq`
# du bloc `} > .env`). Avant cela il n'écrivait pas la clé — mesuré dans
# `c8fc877d` : `grep -c APP_ACCENT_HEX install.sh` → 0 —, et la conséquence n'était pas
# théorique : le revendeur mettait son nom sur l'installation et recevait le VERT DU
# PRODUIT dans le premier e-mail qu'ouvrait son client, dans ~100 % des installations.
#
# ⚠️ LIMITE QUI DEMEURE : qui change la couleur PLUS TARD, par l'écran `/admin/marca`,
# NE voit PAS les e-mails d'accès suivre — ce sont des textes statiques dans
# GoTrue et ils ne changent que quand ce script tourne de nouveau. Ce que l'entretien corrige,
# c'est le point de départ (la couleur de l'installation naît juste) ; le décalage ultérieur
# demeure.
#
# Ce décalage est INHÉRENT au mécanisme, pas à ce choix de source : GoTrue
# garde le texte de l'e-mail, pas une référence à notre résolveur. Remplacer le
# `.env` par la base comme origine changerait QUELLE ancienne valeur reste écrite, pas le
# fait qu'elle le reste. Qui touche ici en espérant que « lire depuis la base résout tout » doit
# le savoir avant d'écrire la première ligne.
ACCENT="${APP_ACCENT_HEX:-}"
case "$ACCENT" in
  \#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) ;;
  *) ACCENT="#506d48";;
esac

# Le texte du bouton : noir ou blanc, selon la luminance relative de la couleur de fond.
#
# Ceci DUPLIQUE la décision de `melhorFrenteSobre` (lib/branding/contraste.ts) —
# exprès, parce que bash n'importe pas TypeScript et l'alternative serait
# `#ffffff` fixe. Et `#ffffff` fixe est le défaut concret : une marque jaune
# collée par le revendeur produit du texte blanc sur jaune, illisible, dans le
# PREMIER e-mail que reçoit son client. Les deux implémentations décident la
# même chose binaire ; diverger n'est possible que dans un intervalle étroit autour
# du seuil, et là les deux choix sont lisibles.
frente_sobre() {
  local hex="${1#\#}"
  # `index()` dans une table, et NON `strtonum("0x..")` : strtonum est une extension de
  # gawk. L'Ubuntu des VPS apporte mawk comme `awk` par défaut et macOS apporte l'awk
  # de BSD — dans aucun des deux strtonum n'existe, et l'erreur (« calling undefined
  # function ») ferait tomber la fonction chez le client et pas ici.
  awk -v h="$hex" '
    function hexv(c) { return index("0123456789abcdef", tolower(c)) - 1 }
    function par(s)  { return hexv(substr(s,1,1))*16 + hexv(substr(s,2,1)) }
    BEGIN{
      r=par(substr(h,1,2)); g=par(substr(h,3,2)); b=par(substr(h,5,2));
      # Luminance perceptuelle (Rec. 601). Suffisante pour choisir entre noir et
      # blanc ; ce n’est pas le calcul WCAG complet, et le commentaire ci-dessus dit pourquoi.
      y=(0.299*r + 0.587*g + 0.114*b)/255;
      print (y > 0.6 ? "#171f15" : "#ffffff");
    }'
}
ACCENT_FG="$(frente_sobre "$ACCENT")"

# ── 2. Rendu des modèles ───────────────────────────────────────────────────
MARCADOR="marca-emails $(date +%s)"

# Substitution LITTÉRALE, pas `sed s|…|…|`. Le nom de la marque est un texte que
# l'opérateur tape : « Ventes & Cie » ferait valoir le `&` du côté droit d'un `sed`
# comme « l'extrait correspondant » et l'e-mail sortirait en disant « Ventes __APP_NAME__ Cie ».
# `|`, `\` et `/` dans le nom ont des familles de dégâts semblables. `index`/`substr`
# n'interprètent aucun caractère.
trocar() {  # trocar <clé> <valeur>   (texte sur stdin, résultat sur stdout)
  awk -v k="$1" -v v="$2" '{
    out=""; s=$0;
    while ((p=index(s,k))>0) { out = out substr(s,1,p-1) v; s = substr(s,p+length(k)) }
    print out s
  }'
}

# Le nom de la marque entre dans du TEXTE HTML. Sans échappement, une marque nommée
# `Boutique <b>Top</b>` injecte du balisage dans le corps de l'e-mail, et un `&` brut est déjà du HTML
# invalide. Seul le corps est échappé — l'OBJET est un en-tête d'e-mail, du texte
# pur, et `&amp;` y apparaîtrait littéralement dans la boîte de réception.
#
# Fait avec `trocar` (index/substr d'awk) et NON avec `${s//&/&amp;}` : bash
# 5.2 s'est mis à développer `&` du côté droit de `${x//p/r}` en l'extrait
# CORRESPONDANT, comme sed l'a toujours fait. Mesuré ici : `Boutique <b>Top</b> & Cie` sortait
# `Boutique <lt;b>gt;Top...` — le `&` de `&lt;` devenait le `<` lui-même. Échapper avec
# `\&` corrigerait en 5.2 et casserait sur le bash 4 d'un vieux VPS, qui est
# exactement le public du kit.
escapar_html() {
  printf '%s' "$1" \
    | trocar '&' '&amp;' \
    | trocar '<' '&lt;' \
    | trocar '>' '&gt;' \
    | trocar '"' '&quot;'
}

# Retire le bloc de commentaire de maintenance en haut du modèle — il parle de
# placeholder, de `--render-em` et du pourquoi du `&`, tout cela adressé à qui édite
# le dépôt. Pousser cela dans l'e-mail de chaque client du
# revendeur serait faire fuir une note interne (et le texte même du commentaire sortirait
# avec les placeholders déjà remplacés, ce qui embrouille encore plus).
sem_nota_interna() {
  awk 'BEGIN{ pulando=0 }
       NR==1 && $0 ~ /^[[:space:]]*<!--/ { pulando=1 }
       pulando==1 { if ($0 ~ /-->/) { pulando=0 }; next }
       { print }'
}

renderizar() {  # renderizar <fichier>
  local arq="$1"
  [ -f "$arq" ] || return 1
  # Le marqueur est la PREUVE de relecture (étape 6) : ASCII pur et sans `<`, `>` ni
  # `&` dans le texte qui sera cherché, parce que le JSON que renvoie l'API échappe
  # ces trois-là (`<`, `>`, `&`) et un grep sur l'original échouerait
  # sur un contenu parfaitement monté.
  printf '<!-- %s -->\n' "$MARCADOR"
  sem_nota_interna < "$arq" \
    | trocar "__APP_NAME__" "$(escapar_html "$APP_NOME")" \
    | trocar "__ACCENT_FG__" "$ACCENT_FG" \
    | trocar "__ACCENT__" "$ACCENT"
}

HTML_CONFIRM="$(renderizar "$PROJ_DIR/supabase/templates/confirmation.html")" || instrua_e_saia "supabase/templates/ introuvable — lancez depuis l'intérieur du dépôt."
HTML_RECOVERY="$(renderizar "$PROJ_DIR/supabase/templates/recovery.html")" || instrua_e_saia "supabase/templates/ introuvable — lancez depuis l'intérieur du dépôt."

if [ -n "$RENDER_EM" ]; then
  # Le chemin de qui fait tourner GoTrue auto-hébergé : là il n'existe pas de Management API, et
  # `GOTRUE_MAILER_TEMPLATES_*` pointe vers un FICHIER. Pointer vers le modèle brut
  # livrerait `__APP_NAME__` au client final.
  mkdir -p "$RENDER_EM" || instrua_e_saia "impossible d'écrire dans $RENDER_EM"
  printf '%s\n' "$HTML_CONFIRM"  > "$RENDER_EM/confirmation.html"
  printf '%s\n' "$HTML_RECOVERY" > "$RENDER_EM/recovery.html"
  c_grn "✓ modèles rendus dans $RENDER_EM (marque : $APP_NOME, accent : $ACCENT)"
  c_dim "  GoTrue auto-hébergé : pointez GOTRUE_MAILER_TEMPLATES_CONFIRMATION/RECOVERY vers eux."
  exit 0
fi

# ── 3. Peut-on pousser ? ───────────────────────────────────────────────────
[ -n "${NEON_MANAGEMENT_TOKEN:-}" ] || instrua_e_saia \
  "NEON_MANAGEMENT_TOKEN absent — impossible de configurer les e-mails d'accès tout seul.
    Récupérez un jeton sur https://supabase.com/dashboard/account/tokens, lancez
    \`export NEON_MANAGEMENT_TOKEN=sbp_...\` et rappelez ce script."

# Le ref du projet sort de l'URL : https://<ref>.supabase.co. Une base AUTO-HÉBERGÉE
# n'a aucune Management API — et dans ce cas l'étape passe par l'env
# de GoTrue, pas par l'API.
REF=""
case "${NEON_DATA_API_URL:-}" in
  https://*.supabase.co*) REF="${NEON_DATA_API_URL#https://}"; REF="${REF%%.supabase.co*}";;
esac
[ -n "$REF" ] || instrua_e_saia \
  "NEON_DATA_API_URL n'est pas un projet du cloud Supabase (${NEON_DATA_API_URL:-vide}).
    Sur une base auto-hébergée, utilisez GOTRUE_MAILER_TEMPLATES_* pointant vers les
    fichiers de \`marca-emails.sh --render-em <dir>\`."

api() {  # api <méthode> <chemin> [corps]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $NEON_MANAGEMENT_TOKEN" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $NEON_MANAGEMENT_TOKEN"
  fi
}

# Même extracteur simple que supabase-provision.sh:123, et pour la même raison — le
# kit promet de ne dépendre que de bash+curl. Le `|| true` garde le message d'erreur
# ATTEIGNABLE : un champ absent ferait sortir grep en 1 et, avec pipefail, ferait tomber
# l'affectation avant la ligne qui explique le problème.
json_str() { grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" <<<"$1" | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true; }

# Échappe une chaîne pour l'insérer dans un JSON. N'échappe ni accent ni `&` : JSON
# accepte l'UTF-8 brut, et ce qui doit sortir ce sont barre, guillemets, tab et saut de ligne.
json_escape() {
  awk 'BEGIN{ORS=""}
       { gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); gsub(/\t/,"\\t"); gsub(/\r/,"");
         printf "%s%s", (NR>1 ? "\\n" : ""), $0 }' <<<"$1"
}

step "Configuration des e-mails d'accès (marque : $APP_NOME)"

atual="$(api GET "/projects/$REF/config/auth")"
case "$atual" in
  *'"message"'*) instrua_e_saia "l'API Supabase a refusé la lecture : $(json_str "$atual" message)";;
esac

# ── 4. Site URL et Redirect URLs : ajouter, jamais remplacer ───────────────
#
# Écraser la liste effacerait des domaines que l'opérateur a ajoutés (staging,
# ancienne app, deep link mobile) et le symptôme serait « la connexion ne revient plus »
# — loin d'ici et sans rapport évident avec « j'ai touché aux e-mails ».
SITE_ATUAL="$(json_str "$atual" site_url)"
ALLOW_ATUAL="$(json_str "$atual" uri_allow_list)"

SITE_NOVO="$SITE_ATUAL"
if [ -n "$APP_URL" ]; then
  # Ne change que s'il est vide ou sur la valeur par défaut d'un nouveau projet Supabase.
  # Un Site URL choisi par l'opérateur reste tel quel — avec un avertissement.
  case "$SITE_ATUAL" in
    ""|"http://localhost:3000"|"http://localhost:3000/") SITE_NOVO="$APP_URL";;
    *)
      if [ "${SITE_ATUAL%/}" != "${APP_URL%/}" ]; then
        c_ylw "  • Site URL est déjà sur $SITE_ATUAL (laissé tel quel ; l'app utilise $APP_URL)"
      fi;;
  esac
fi

ALLOW_NOVO="$ALLOW_ATUAL"
if [ -n "$APP_URL" ]; then
  for entrada in "${APP_URL%/}/auth/confirm" "${APP_URL%/}/**"; do
    case ",$ALLOW_NOVO," in
      *",$entrada,"*) ;;
      *) [ -n "$ALLOW_NOVO" ] && ALLOW_NOVO="$ALLOW_NOVO,$entrada" || ALLOW_NOVO="$entrada";;
    esac
  done
fi

# ── 5. Pousse ──────────────────────────────────────────────────────────────
corpo="{
  \"mailer_subjects_confirmation\": \"$(json_escape "Confirmez votre e-mail — $APP_NOME")\",
  \"mailer_subjects_recovery\": \"$(json_escape "Réinitialiser le mot de passe — $APP_NOME")\",
  \"mailer_templates_confirmation_content\": \"$(json_escape "$HTML_CONFIRM")\",
  \"mailer_templates_recovery_content\": \"$(json_escape "$HTML_RECOVERY")\",
  \"site_url\": \"$(json_escape "$SITE_NOVO")\",
  \"uri_allow_list\": \"$(json_escape "$ALLOW_NOVO")\"
}"

resposta="$(api PATCH "/projects/$REF/config/auth" "$corpo")"

# ── 6. RELECTURE — la seule preuve qui vaille ──────────────────────────────
#
# Ne vous fiez pas au 2xx. Mesuré : un projet en pause renvoie 400 avec
# {"message":"Project is paused."} et un script qui ne regarderait que le code de sortie
# de curl rapporterait un succès. Et le pire mode d'échec est l'inverse — une API qui
# ACCEPTE et IGNORE — qu'aucun code de statut ne dénonce.
depois="$(api GET "/projects/$REF/config/auth")"
if grep -qF "$MARCADOR" <<<"$depois"; then
  c_grn "✓ e-mails d'accès configurés et VÉRIFIÉS (j'ai relu ce que j'ai écrit)"
  c_dim "    objet :   Confirmez votre e-mail — $APP_NOME"
  c_dim "    bouton :  $ACCENT avec texte $ACCENT_FG"
  [ "$SITE_NOVO" = "$SITE_ATUAL" ] || c_dim "    site url : $SITE_NOVO"
  [ "$ALLOW_NOVO" = "$ALLOW_ATUAL" ] || c_dim "    redirect : $ALLOW_NOVO"
  exit 0
fi

motivo="$(json_str "$resposta" message)"
[ -n "$motivo" ] || motivo="$(json_str "$depois" message)"
instrua_e_saia "les e-mails d'accès N'ont PAS été configurés${motivo:+ — $motivo}.
    J'ai relu la configuration après l'écriture et le contenu envoyé n'y était pas.
    L'installation continue de fonctionner ; seuls les e-mails restent sur le modèle par défaut."
