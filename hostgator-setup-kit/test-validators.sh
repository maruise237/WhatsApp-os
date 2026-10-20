#!/usr/bin/env bash
#
# Teste les validateurs d'install.sh — les garde-fous qui empêchent quelqu'un d'avancer
# dans l'installation avec une donnée erronée. Seulement les cas qui NE dépendent PAS du réseau : format,
# rôle de la clé, projet croisé, Direct connection et mot de passe non encodé.
# Les vérifications en ligne (curl/psql) sont prouvées lors de l'installation réelle.
#
#   bash hostgator-setup-kit/test-validators.sh
#
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# _common.sh vient avant parce que c'est de lui que sortent `nome_do_projeto_compose`,
# `veredito_rede_do_proxy` et `garantir_rede_do_proxy` — install.sh et update.sh
# partagent ces trois-là, et la suite les exerce depuis un seul endroit.
. ./_common.sh

# Lit UNE clé du .env via le `load_env` du kit, et non par grep de format.
#
# Les trois boucles de packaging ci-dessous comparaient la LIGNE (`^CLÉ='?valeur'?$`), ce qui
# liait l'assertion à l'encodage du `.env` — et cela a cassé quand `envq` s'est mis à
# écrire des guillemets doubles pour que Docker Compose accepte l'apostrophe (`L'Atelier`).
# Comparer la VALEUR plutôt que le TEXTE rend le test insensible à l'encodage, ce qui est
# justement ce qu'il n'a jamais voulu tester. `load_env` tourne en sous-shell : il ne
# fait pas fuir de variable vers le cas suivant.
valor_no_env() {
  ( load_env "$1" >/dev/null 2>&1; eval "printf '%s' \"\${$2:-}\"" )
}

INSTALL_SH_LIB=1 . ./install.sh
set +e   # les deux activent `set -e` ; ici nous attendons que des validateurs échouent exprès

fail=0

# ── Bac à sable : la suite NE doit PAS écrire dans le crontab de la machine qui la lance ──
# Ce n'est pas une hypothèse : les tests ont DÉJÀ sali le crontab du mainteneur avec 10 lignes
# orphelines — l'une d'elles un `curl` avec Bearer frappant un domaine d'exemple chaque
# minute, pointant vers un répertoire temporaire que la suite elle-même efface.
# Désormais le `crontab` que voient les tests est une doublure qui écrit dans
# CRONTAB_SANDBOX ; la vérification à la fin du fichier compare le crontab RÉEL d'avant
# avec celui d'après et échoue s'il a changé.
SUITE_TMP="$(mktemp -d)"
trap 'rm -rf "$SUITE_TMP"' EXIT
CRONTAB_SANDBOX="$SUITE_TMP/crontab-dubles.txt"      # ce que les tests ont écrit
CRONTAB_REAL_ANTES="$SUITE_TMP/crontab-real-antes.txt"
CRONTAB_REAL_DEPOIS="$SUITE_TMP/crontab-real-depois.txt"
# Sans crontab sur la machine, `crontab -l` sort 1 et le fichier reste vide — le même
# état qu'« utilisateur sans crontab ». La distinction n'importe pas pour la comparaison ;
# ce qui importe c'est qu'elle soit faite avec la MÊME commande aux deux bouts.
crontab -l >"$CRONTAB_REAL_ANTES" 2>/dev/null || : >"$CRONTAB_REAL_ANTES"
# ok <description> <pass|reject> <validateur> <valeur> [extrait attendu dans le message]
#
# L'extrait attendu n'est pas un caprice : sans lui le test passe par hasard. Prouvé —
# en retirant le garde-fou de la Direct connection, l'URL allait jusqu'au psql et était
# rejetée pour *échec de connexion*, avec le test toujours vert. Un rejet ne compte
# que s'il a la bonne raison, et c'est le message qui dit la raison à la personne.
ok() {
  local desc="$1" expect="$2" fn="$3" val="${4-}" want="${5-}"
  local out rc
  if out="$("$fn" "$val" 2>&1)"; then rc=0; else rc=$?; fi
  if [ "$expect" = pass ]; then
    if [ $rc -eq 0 ]; then printf '  ✓ %s\n' "$desc"
    else printf '  ✗ %s  (devait accepter, a rejeté : %s)\n' "$desc" "$(printf '%s' "$out" | head -1)"; fail=1; fi
    return
  fi
  if [ $rc -eq 0 ]; then
    printf '  ✗ %s  (devait rejeter, a accepté)\n' "$desc"; fail=1; return
  fi
  if [ -n "$want" ] && ! printf '%s' "$out" | grep -qi -- "$want"; then
    printf '  ✗ %s  (a rejeté, mais pour la mauvaise raison)\n     attendait que le message parle de : %s\n     a dit : %s\n' \
      "$desc" "$want" "$(printf '%s' "$out" | head -1)"; fail=1; return
  fi
  printf '  ✓ %s\n' "$desc"
}

# La anon/service_role et la db_url sont comparées au projet déclaré.
NEON_DATA_API_URL="https://abcdefghijklmnop.supabase.co"

# Faux JWT : header.payload.signature, payload avec role et ref.
mkjwt() {
  local payload; payload="$(printf '{"iss":"supabase","ref":"%s","role":"%s"}' "$2" "$1" \
    | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')"
  printf 'eyJhbGciOiJIUzI1NiJ9.%s.signature' "$payload"
}

echo "domaine"
ok "accepte un sous-domaine"       pass   v_domain "crm.entreprise.cm"
ok "rejette avec https://"         reject v_domain "https://crm.entreprise.cm"  "sans https"
ok "rejette avec un chemin"        reject v_domain "crm.entreprise.cm/app"      "sans barre"
ok "rejette sans point"            reject v_domain "localhost"                  "il manque le point"

echo "e-mail"
ok "accepte un e-mail valide"      pass   v_email "vous@entreprise.cm"
ok "rejette sans @"                reject v_email "vous.entreprise.cm"          "invalide"

echo "URL de la base : celle du cloud ET celle d'une base auto-hébergée"
# Le contrôle de format exigeait `.supabase.co` et tuait qui fait tourner une base
# auto-hébergée avec la phrase « Elle se termine par .supabase.co » — refus de la BONNE donnée, et
# sans aucune issue : il n'existe rien à taper qui passe. Désormais le format n'exige que
# https://, et le message de refus doit enseigner les DEUX cas, sinon il
# recrée la même impasse en prose.
#
# FRONTIÈRE (l'en-tête de ce fichier) : ici on mesure seulement le `case` de format. L'
# appel à /auth/v1/health est doublé, parce que lier cette suite au DNS, c'est échanger
# un test contre un oracle. Ce que cet appel prouve vraiment — et ce qu'il NE
# prouve PAS — relève d'une mesure d'installation réelle ; voir le rapport du tri.
sburl_ok() {  # sburl_ok <description> <pass|reject> <url> [extrait attendu]...
  local desc="$1" expect="$2" url="$3" out rc want
  shift 3
  out="$(bash -c '
      INSTALL_SH_LIB=1 . ./install.sh
      set +e
      # Seul le format est testé : pour la doublure, le réseau répond 200 à tous.
      curl() { printf 200; }
      v_supabase_url "$1"' _ "$url" 2>&1)"; rc=$?
  if [ "$expect" = pass ]; then
    if [ $rc -eq 0 ]; then printf '  ✓ %s\n' "$desc"
    else printf '  ✗ %s  (devait accepter, a rejeté : %s)\n' "$desc" "$(printf '%s' "$out" | head -1)"; fail=1; fi
    return
  fi
  if [ $rc -eq 0 ]; then printf '  ✗ %s  (devait rejeter, a accepté)\n' "$desc"; fail=1; return; fi
  for want in "$@"; do
    if ! printf '%s' "$out" | grep -qi -- "$want"; then
      printf '  ✗ %s  (a rejeté, mais le message ne parle pas de : %s)\n     a dit : %s\n' \
        "$desc" "$want" "$(printf '%s' "$out" | head -1)"; fail=1; return
    fi
  done
  printf '  ✓ %s\n' "$desc"
}
sburl_ok "accepte l'URL du cloud"                     pass   "https://abcdefghijklmnop.supabase.co"
# VOICI le cas qui n'existait pas : base auto-hébergée, hôte qui n'a pas .supabase.co.
sburl_ok "accepte une base auto-hébergée"             pass   "https://db-crm.exemple.cm"
sburl_ok "accepte un hôte sans point (base sur le réseau interne)" pass "https://supabase-interno"
# Sans https:// cela reste un refus — c'est ce qui casse le curl juste en dessous, et le
# cas du `.supabase.co` collé sans schéma a son propre message, plus spécifique.
sburl_ok "rejette .supabase.co collé sans schéma"     reject "abcdefghijklmnop.supabase.co" "https://"
sburl_ok "rejette http:// (sans TLS)"                 reject "http://db-crm.exemple.cm" "https://"
# Le message doit nommer les DEUX mondes. Un refus qui ne parle que du cloud
# renvoie l'auto-hébergeur dans l'impasse d'où cette correction l'a sorti — le défaut
# migrerait du `case` vers la prose, où il n'y a aucun cliquet.
sburl_ok "le refus enseigne le cas du CLOUD"          reject "meu-supabase" "supabase.co"
sburl_ok "le refus enseigne le cas AUTO-HÉBERGÉ"      reject "meu-supabase" "serveur"

echo "clés de la base (format/rôle/projet)"
ok "rejette service_role dans le champ anon" reject v_anon    "$(mkjwt service_role abcdefghijklmnop)" "il me faut la 'anon'"
ok "rejette anon dans le champ service_role" reject v_service "$(mkjwt anon abcdefghijklmnop)"         "il me faut la 'service_role'"
ok "rejette une clé d'un autre projet"       reject v_anon    "$(mkjwt anon zzzzzzzzzzzzzzzz)"         "AUTRE projet"
ok "rejette un texte qui n'est pas une clé"  reject v_anon    "ma-cle-secrete"                         "ne ressemble pas à une clé"

echo "connection string"
ok "rejette [YOUR-PASSWORD] non remplacé"    reject v_db_url "postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-1-us-west-2.pooler.supabase.com:5432/postgres" "remplacez-le par le mot de passe"
ok "rejette la Direct connection (IPv6)"     reject v_db_url "postgresql://postgres:motdepasse@db.abcdefghijklmnop.supabase.co:5432/postgres"                           "Session pooler"
ok "rejette une chaîne d'un autre projet"    reject v_db_url "postgresql://postgres.zzzzzzzzzzzzzzzz:motdepasse@aws-1-us-west-2.pooler.supabase.com:5432/postgres"     "même projet"
ok "rejette ce qui n'est pas une URL Postgres" reject v_db_url "aws-1-us-west-2.pooler.supabase.com"                                                                "commence par postgresql"

echo "connection string : une base AUTO-HÉBERGÉE n'a pas de <ref> de projet"
# La comparaison de projet lit le `postgres.<ref>` du pooler DU CLOUD. Sur une base
# auto-hébergée il n'existe pas de <ref> et le rôle peut être n'importe lequel, donc la vérification
# accusait « la chaîne est du projet 'crmuser', mais l'URL est du projet 'db-crm' » —
# phrase sur deux choses qui n'existent pas, et sans issue. Désormais elle ne tourne que quand
# l'URL est vraiment celle du cloud.
#
# Le cas du cloud est de nouveau ici (il existe déjà plus haut) parce que l'assertion est AUTRE :
# là on mesure le message, ici on mesure que le refus se produit AVANT de toucher à la
# base. C'est cette frontière que le nouveau `case` aurait pu déplacer sans que personne ne le voie.
#
# Ce qui reste pour barrer la donnée erronée sur le chemin auto-hébergé, c'est SEULEMENT le `select 1`, et
# il prouve que la base RÉPOND, pas que c'est la bonne base : mesuré, une chaîne
# pointant vers la base de quelqu'un d'autre passe. C'est noté dans le rapport du
# tri comme constat — ce n'est pas un test rouge ici, exprès.
db_ok() {  # db_ok <description> <pass|reject> <NEON_DATA_API_URL> <chaîne> [extrait attendu]
  local desc="$1" expect="$2" sburl="$3" conn="$4" want="${5-}" dir out rc tocou
  dir="$(mktemp -d)"; mkdir -p "$dir/bin"
  # Le `select 1` tourne via `docker run postgres:17-alpine`. La doublure n'est pas une
  # commodité : sans elle un cas d'ACCEPTATION téléchargerait une image et ouvrirait une connexion
  # réseau, ce que l'en-tête de ce fichier promet justement de ne pas faire.
  # Elle laisse une trace pour l'assertion de vacuité juste en dessous.
  printf '#!/usr/bin/env bash\ntouch "%s/tocou-no-banco"\nprintf 1\n' "$dir" > "$dir/bin/docker"
  chmod +x "$dir/bin/docker"
  out="$(env PATH="$dir/bin:$PATH" NEON_DATA_API_URL="$sburl" bash -c '
      INSTALL_SH_LIB=1 . ./install.sh
      set +e
      v_db_url "$1"' _ "$conn" 2>&1)"; rc=$?
  tocou=nao; [ -e "$dir/tocou-no-banco" ] && tocou=sim
  rm -rf "$dir"
  if [ "$expect" = pass ]; then
    if [ $rc -ne 0 ]; then
      printf '  ✗ %s  (devait accepter, a rejeté : %s)\n' "$desc" "$(printf '%s' "$out" | head -1)"; fail=1
    elif [ "$tocou" != sim ]; then
      # Vacuité : accepter SANS arriver au psql est un autre défaut avec la même tête de
      # vert — ce serait un `return 0` anticipé, et l'installation continuerait avec une
      # connection string que personne n'a testée.
      printf '  ✗ %s  (a accepté sans jamais essayer de se connecter — return 0 anticipé ?)\n' "$desc"; fail=1
    else printf '  ✓ %s\n' "$desc"; fi
    return
  fi
  if [ $rc -eq 0 ]; then printf '  ✗ %s  (devait rejeter, a accepté)\n' "$desc"; fail=1; return; fi
  if [ -n "$want" ] && ! printf '%s' "$out" | grep -qi -- "$want"; then
    printf '  ✗ %s  (a rejeté, mais pour la mauvaise raison)\n     a dit : %s\n' "$desc" "$(printf '%s' "$out" | head -1)"; fail=1; return
  fi
  if [ "$tocou" = sim ]; then
    printf '  ✗ %s  (a refusé seulement APRÈS avoir essayé de se connecter — le garde-fou est de formulaire)\n' "$desc"; fail=1; return
  fi
  printf '  ✓ %s\n' "$desc"
}
db_ok "auto-hébergée : un rôle arbitraire ne devient plus un 'projet'" pass \
  "https://db-crm.exemple.cm" "postgresql://crmuser:motdepasse@db-crm.exemple.cm:5432/postgres"
db_ok "auto-hébergée : le rôle 'postgres' continue de passer"       pass \
  "https://db-crm.exemple.cm" "postgresql://postgres:motdepasse@db-crm.exemple.cm:5432/postgres"
# La régression qui compte : assouplir l'auto-hébergé ne pouvait pas assouplir le CLOUD,
# où le <ref> existe et pointer vers le mauvais projet est l'erreur classique.
db_ok "CLOUD : le projet croisé reste barré avant la base" reject \
  "https://abcdefghijklmnop.supabase.co" \
  "postgresql://postgres.zzzzzzzzzzzzzzzz:motdepasse@aws-1-us-west-2.pooler.supabase.com:5432/postgres" \
  "même projet"
db_ok "CLOUD : le même projet passe"                       pass \
  "https://abcdefghijklmnop.supabase.co" \
  "postgresql://postgres.abcdefghijklmnop:motdepasse@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
# L'URL du cloud N'arrive PAS toujours en se terminant par '.supabase.co'. La barre d'adresse du
# navigateur livre une barre finale ; qui copie depuis la documentation apporte un chemin ; qui
# colle à la souris apporte une espace. Décider « est-ce le cloud ? » sur la chaîne entière désactive la
# comparaison de projet en silence dans ces trois cas — et l'issue est la pire
# possible : le baseline.sql va dans une base et l'app parle à une autre, chacune d'un
# projet. Ces trois cas gardent l'extraction d'HÔTE qui empêche cela.
for _sufixo in "/" "/rest/v1" " "; do
  db_ok "CLOUD avec '${_sufixo}' dans l'URL : le projet croisé reste barré" reject \
    "https://abcdefghijklmnop.supabase.co${_sufixo}" \
    "postgresql://postgres.zzzzzzzzzzzzzzzz:motdepasse@aws-1-us-west-2.pooler.supabase.com:5432/postgres" \
    "même projet"
done
unset _sufixo
# Et l'autre côté de la même extraction : une base auto-hébergée avec barre finale reste
# une base auto-hébergée — la correction ci-dessus ne peut pas réintroduire le refus de la
# bonne donnée que cette PR est venue retirer.
db_ok "auto-hébergée avec barre finale continue sans comparer de projet" pass \
  "https://db-crm.exemple.cm/" "postgresql://crmuser:motdepasse@db-crm.exemple.cm:5432/postgres"
# Qui répond la connection string AVANT l'URL (ou saute l'URL) n'a rien avec quoi
# comparer — et ne peut pas être bloqué pour cela.
db_ok "pas encore d'URL répondue : rien à comparer"   pass \
  "" "postgresql://postgres.zzzzzzzzzzzzzzzz:motdepasse@aws-1-us-west-2.pooler.supabase.com:5432/postgres"

echo "clés d'IA et mot de passe"
ok "rejette une clé Anthropic au mauvais préfixe" reject v_anthropic "sk-proj-abc123" "commence par 'sk-ant-'"
# `v_openrouter` a été référencée comme validateur du champ OpenRouter sans
# jamais avoir été définie — et la suite n'avait pas une seule ligne qui la
# mentionnait. Ce cas est ce qui rend l'ABSENCE de la fonction rouge : un nom
# inexistant renvoie 127, que `ok` lit comme un rejet, donc la paire (rejette par
# préfixe / accepte vide-non) est ce qui sépare « existe et valide » de « n'existe pas ».
ok "rejette une clé OpenRouter au mauvais préfixe" reject v_openrouter "sk-ant-abc123" "commence par 'sk-or-'"
ok "rejette une clé OpenRouter vide"               reject v_openrouter ""              "commence par 'sk-or-'"
ok "rejette une clé OpenAI au mauvais préfixe"     reject v_openai    "ma-cle"         "commence par 'sk-'"
ok "accepte une OpenAI vide (optionnelle)"         pass   v_openai    ""
ok "rejette un mot de passe court"                 reject v_password  "1234567"        "trop court"
ok "accepte un mot de passe de 8+"                 pass   v_password  "12345678"

echo "réseau hors service : la sentinelle 000 (issue #190)"
# La doublure de curl des autres sections est `printf 200` INCONDITIONNEL, donc la branche
# `000` des six validateurs n'était exercée par aucun cas — et c'est
# ainsi qu'elle a passé 6 versions à être du code mort.
#
# La doublure ici imite le VRAI curl quand le réseau échoue : `-w '%{http_code}'`
# le fait AFFICHER `000` et sortir avec un code d'erreur. C'était ce duo qui cassait le
# `|| echo 000` à l'intérieur de la substitution de commande : l'echo se CONCATÉNAIT avec ce
# que curl avait déjà affiché et la variable devenait `000000`, qui ne correspond à
# aucune branche. Les deux issues étaient fausses, dans des directions opposées — et les deux
# sont couvertes ci-dessous, parce que corriger l'une sans mesurer l'autre laisserait la moitié
# du défaut vivante.
rede_morta() {  # rede_morta <description> <pass|reject> <validateur> <valeur> [extrait attendu]...
  local desc="$1" expect="$2" fn="$3" val="$4" out rc want
  shift 4
  out="$(bash -c '
      INSTALL_SH_LIB=1 . ./install.sh
      NEON_DATA_API_URL="https://abcdefghijklmnop.supabase.co"
      set +e
      # vrai curl avec -w : affiche 000 ET renvoie exit != 0.
      curl() { printf 000; return 6; }
      "$1" "$2"' _ "$fn" "$val" 2>&1)"; rc=$?
  if [ "$expect" = pass ] && [ $rc -ne 0 ]; then
    printf '  ✗ %s  (devait continuer, a bloqué : %s)\n' "$desc" "$(printf '%s' "$out" | head -1)"; fail=1; return
  fi
  if [ "$expect" = reject ] && [ $rc -eq 0 ]; then
    printf '  ✗ %s  (devait bloquer, a continué)\n' "$desc"; fail=1; return
  fi
  for want in "$@"; do
    if ! printf '%s' "$out" | grep -qi -- "$want"; then
      printf '  ✗ %s  (le message ne parle pas de : %s)\n     a dit : %s\n' \
        "$desc" "$want" "$(printf '%s' "$out" | head -1)"; fail=1; return
    fi
  done
  printf '  ✓ %s\n' "$desc"
}

# CÔTÉ 1 — le cas signalé : l'URL injoignable était ACCEPTÉE. `v_supabase_url` est le seul
# des six qui exige une réponse en ligne, et son `000` était inatteignable : mesuré dans
# f9abedd0, `rc=0` et sortie vide pour un hôte qui ne se résout pas.
rede_morta "une URL de base injoignable est REFUSÉE" reject v_supabase_url \
  "https://abcdefghijklmnop.supabase.co" "impossible d'atteindre"

# CÔTÉ 2 — l'inverse, et pire pour qui installe : avec le réseau coupé, la BONNE clé
# tombait dans la branche `*)` et était REFUSÉE avec « Vérifiez la clé et le projet » — l'erreur
# accusant qui a configuré, dans une boucle dont on ne sort pas en tapant juste. Le code
# a toujours voulu avertir et continuer ; c'était la variable `000000` qui l'en empêchait.
rede_morta "la bonne clé service_role CONTINUE avec un avertissement" pass v_service \
  "$(mkjwt service_role abcdefghijklmnop)" "impossible de vérifier" "je continue avec"
rede_morta "la bonne clé anon CONTINUE avec un avertissement"         pass v_anon \
  "$(mkjwt anon abcdefghijklmnop)"         "je continue avec"

# Les trois d'IA continuaient déjà (leur `*)` est aussi tolérant), mais le message
# montrait `000000` à l'utilisateur. Ici on exige la bonne branche, pas seulement l'issue :
# sans vérifier le texte, un `*)` déguisé en `000` passerait.
rede_morta "clé Anthropic continue par la branche 000"  pass v_anthropic  "sk-ant-abc123" "impossible de vérifier"
rede_morta "clé OpenRouter continue par la branche 000" pass v_openrouter "sk-or-abc123"  "impossible de vérifier"
rede_morta "clé OpenAI continue par la branche 000"     pass v_openai     "sk-abc123"     "impossible de vérifier"

echo "lecture du .env (load_env)"
. ./_common.sh
set +e
TMP="$(mktemp -d)"
cat > "$TMP/.env" <<'EOF'
# un commentaire doit être ignoré
APP_NAME='Boutique do Kofi'
SENHA_COM_HASH='a#b'
SENHA_COM_CIFRAO='p$ass'
COM_ASPAS_DUPLAS="valeur avec espace"
SEM_ASPAS=simples
LEGADO_SEM_ASPAS=Ancienne Boutique
ligne sans egal
EOF
( load_env "$TMP/.env"
  eq() { if [ "$2" = "$3" ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s  attendait [%s] a obtenu [%s]\n' "$1" "$3" "$2"; exit 1; fi; }
  eq "nom avec espace"                 "$APP_NAME"            "Boutique do Kofi"
  eq "mot de passe avec # non tronqué" "$SENHA_COM_HASH"      'a#b'
  eq "mot de passe avec \$ non développé" "$SENHA_COM_CIFRAO" 'p$ass'
  eq "guillemets doubles"              "$COM_ASPAS_DUPLAS"    "valeur avec espace"
  eq "sans guillemets"                 "$SEM_ASPAS"           "simples"
  eq "hérité sans guillemets avec espace" "$LEGADO_SEM_ASPAS" "Ancienne Boutique"
) || fail=1
rm -rf "$TMP"

echo "identifiants du provisionnement (sb_carrega_credenciais)"
# Ce bloc existe parce que la lecture a déjà été faite avec `eval`, et avec `eval` elle
# EXÉCUTAIT le contenu : le provisionnement affiche `CLÉ='valeur'` sans échapper le
# guillemet simple, et NEON_REGION — qui vient de l'environnement — est interpolée dans la
# connection string. Mesuré : avec `eval`, le marqueur ci-dessous était créé.
TMP2="$(mktemp -d)"
(
  MARCA="$TMP2/executou"
  # Exactement ce qu'émet le provisionnement quand la région porte un guillemet simple.
  VENENO="postgresql://postgres.ref:motdepasse@aws-0-sa-east-1'\$(touch $MARCA)'.pooler.supabase.com:5432/postgres"
  PATH_ANTES="$PATH"
  unset NEON_DATA_API_URL NEON_TEST_JWT NEON_SERVICE_ROLE_JWT NEON_DATABASE_URL

  sb_carrega_credenciais "$(printf "NEON_DATABASE_URL='%s'\n" "$VENENO")"

  eq() { if [ "$2" = "$3" ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s  attendait [%s] a obtenu [%s]\n' "$1" "$3" "$2"; exit 1; fi; }
  if [ -e "$MARCA" ]; then printf '  ✗ un guillemet simple dans la valeur a EXÉCUTÉ une commande\n'; exit 1; fi
  printf '  ✓ un guillemet simple dans la valeur n’exécute pas de commande\n'
  eq "une valeur avec guillemet arrive littérale" "${NEON_DATABASE_URL:-}"  "$VENENO"

  # Une clé hors de la liste fixe est ignorée — la sortie ne peut pas créer n'importe quelle variable.
  sb_carrega_credenciais "PATH='/pwn'"
  eq "une clé inconnue est ignorée"   "$PATH"                 "$PATH_ANTES"

  # Et le chemin heureux reste entier.
  unset NEON_DATABASE_URL
  sb_carrega_credenciais "$(printf "NEON_DATA_API_URL='https://abc.supabase.co'\nNEON_DATABASE_URL='postgresql://u:p@h:5432/postgres'\n")"
  eq "une url normale arrive intacte"        "${NEON_DATA_API_URL:-}" "https://abc.supabase.co"
  eq "une db_url normale arrive intacte"     "${NEON_DATABASE_URL:-}"          "postgresql://u:p@h:5432/postgres"
) || fail=1
rm -rf "$TMP2"

echo "intégration : install.sh N'INTERPRÈTE PAS la sortie du provisionnement"
# Le bloc du dessus garde la FONCTION ; celui-ci garde le POINT D'APPEL — remplacer
# `sb_carrega_credenciais "$_sb_out"` de nouveau par `eval "$_sb_out"` passait
# inaperçu, parce que la fonction restait correcte et que plus personne ne l'appelait.
#
# Garde le COMPORTEMENT, pas le texte : une assertion du type « le mot
# eval n'existe pas » n'attraperait que la récidive littérale, et `. <(printf %s "$_sb_out")` exécute
# pareil. Ici install.sh tourne pour de vrai (docker est un stub, pas de réseau) avec un
# provisionnement qui renvoie un guillemet simple dans la valeur ; si un mécanisme quelconque
# interprète cela, le marqueur apparaît.
TMP3="$(mktemp -d)"
(
  MARCA="$TMP3/executou"
  mkdir -p "$TMP3/bin" "$TMP3/proj"
  cp install.sh _common.sh "$TMP3/"
  : > "$TMP3/proj/docker-compose.prod.yml"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP3/bin/docker"; chmod +x "$TMP3/bin/docker"
  cat > "$TMP3/supabase-provision.sh" <<'PROV'
#!/usr/bin/env bash
# Ce qu'émet le provisionnement quand NEON_REGION (qui vient de l'environnement)
# porte un guillemet simple : il ferme le littéral du printf et le reste devient du code.
VENENO="postgresql://u:p@aws-0-x'\$(touch $MARCA)'.pooler.supabase.com:5432/postgres"
printf "NEON_DATA_API_URL='https://ref.supabase.co'\n"
printf "NEON_TEST_JWT='a'\n"
printf "NEON_SERVICE_ROLE_JWT='s'\n"
printf "NEON_DATABASE_URL='%s'\n" "$VENENO"
PROV

  saida="$(cd "$TMP3/proj" && env PATH="$TMP3/bin:$PATH" MARCA="$MARCA" \
    NEON_MANAGEMENT_TOKEN=fake NEON_DATA_API_URL= \
    bash "$TMP3/install.sh" --yes 2>&1 || true)"

  # Sans cette vérification le test passerait par VACUITÉ : si install.sh mourait
  # avant le bloc (stub cassé, refactor déplaçant l'extrait), rien n'exécuterait le
  # poison et le silence serait lu comme une approbation.
  if ! printf '%s' "$saida" | grep -q "identifiants sont entrés tout seuls"; then
    printf '  ✗ install.sh n’est pas arrivé au bloc de provisionnement — test non concluant, pas vert\n'; exit 1
  fi
  if [ -e "$MARCA" ]; then
    printf '  ✗ install.sh a INTERPRÉTÉ la sortie du provisionnement (eval/source au point d’appel ?)\n'; exit 1
  fi
  printf '  ✓ le point d’appel n’interprète pas la sortie\n'
) || fail=1
rm -rf "$TMP3"

echo "synchronisation : install.sh écrit les clés que promet .env.hostgator.example"
# install.sh monte le .env à partir d'une LISTE FERMÉE d'`envq` et ferme avec
# `} > .env`, qui TRONQUE. Une clé hors de la liste n'est tout simplement pas écrite — et si la
# personne l'a mise à la main, elle disparaît à la prochaine installation, dans un script que le README
# présente comme idempotent. Mesuré : une clé mise à la main est chargée par load_env
# puis JETÉE à l'écriture.
#
# C'est passé inaperçu parce que l'env-example-sync du dépôt compare .env.example avec
# lib/env.ts et ne regarde jamais install.sh — personne ne gardait ce bout.
#
# DETTE : clés qu'install.sh n'écrit pas aujourd'hui. La liste ne peut que RÉTRÉCIR ; si
# l'une d'elles se met à être écrite, le test demande de la retirer d'ici.
DIVIDA="AGENT_DISPATCH_CONSUMER NUVEMSHOP_APP_ID NUVEMSHOP_CLIENT_ID NUVEMSHOP_CLIENT_SECRET"
EXEMPLO="${EXEMPLO_ENV:-../.env.hostgator.example}"
if [ ! -f "$EXEMPLO" ]; then
  # Sauter est acceptable (le kit tourne aussi seul, hors du dépôt), mais à voix haute :
  # un saut silencieux est indiscernable d'un test qui a passé.
  printf '  — sauté : %s n’existe pas (kit hors du dépôt)\n' "$EXEMPLO"
else
  GRAVA="$(grep -oE '^[[:space:]]*envq [A-Z_0-9]+' install.sh | awk '{print $2}' | sort -u)"
  novas=""
  for k in $(grep -oE '^[A-Z_0-9]+=' "$EXEMPLO" | tr -d '=' | sort -u); do
    printf '%s\n' "$GRAVA" | grep -qx "$k" && continue
    case " $DIVIDA " in *" $k "*) continue ;; esac
    novas="$novas $k"
  done
  if [ -n "$novas" ]; then
    printf '  ✗ .env.hostgator.example promet des clé(s) qu’install.sh n’écrit pas :%s\n' "$novas"
    printf '     qui installe par le kit ne reçoit pas cette configuration ; qui la met à la main la perd à la prochaine installation\n'
    fail=1
  else
    printf '  ✓ aucune nouvelle clé hors de la liste d’écriture\n'
  fi
  estagnada=""
  for k in $DIVIDA; do
    printf '%s\n' "$GRAVA" | grep -qx "$k" && estagnada="$estagnada $k"
  done
  if [ -n "$estagnada" ]; then
    printf '  ✗ déjà écrite par install.sh — retirez-la de la liste DETTE de ce test :%s\n' "$estagnada"
    fail=1
  else
    printf '  ✓ la dette correspond toujours (%s clés connues, ne peut que rétrécir)\n' "$(printf '%s' "$DIVIDA" | wc -w | tr -d ' ')"
  fi
fi

echo "réponse affirmative (resposta_sim)"
# Le contrôle DNS comparait la réponse à la chaîne « s » EXACTE : qui tapait « S »
# ou « sim » — la bonne réponse, avec la mauvaise touche — était tué par un `die` qui
# disait encore « Ajustez le DNS », phrase qui ne correspond pas à ce que la personne
# a choisi. Même défaut dans reset-mfa.sh. Ces cas sont le contrat qu'aucune
# invite du kit ne lise de nouveau l'intention par l'orthographe.
sim_ok() {  # sim_ok <description> <sim|nao> <entrée>
  local desc="$1" esperado="$2" val="${3-}" real
  if resposta_sim "$val"; then real=sim; else real=nao; fi
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (attendait %s, a donné %s pour "%s")\n' "$desc" "$esperado" "$real" "$val"; fail=1; fi
}
sim_ok "o minuscule"                  sim "o"
sim_ok "O majuscule"                  sim "O"
sim_ok "oui en toutes lettres"        sim "oui"
sim_ok "OUI en capitales"             sim "OUI"
sim_ok "y (clavier anglais)"          sim "y"
sim_ok "yes"                          sim "yes"
sim_ok "espaces autour"               sim "  o  "
sim_ok "Entrée (vide) vaut non"       nao ""
sim_ok "n"                            nao "n"
sim_ok "non"                          nao "non"
sim_ok "NON en capitales"             nao "NON"
sim_ok "mot quelconque"               nao "peut-etre"
sim_ok "'ouis' ne devient pas oui"    nao "ouis"

echo "jumelles : resposta_sim vaut dans les DEUX fichiers"
# Cette suite source install.sh, mais d'autres blocs sourcent _common.sh — et la
# définition qui survit est celle du dernier. Découvert en sabotant : avec la jumelle d'
# install.sh renvoyant « oui » pour tout, les cas ci-dessus restaient VERTS,
# parce que c'était la bonne copie de _common.sh qui répondait. La moitié de la correction
# était sans filet. Chaque jumelle est désormais exercée dans son propre fichier,
# dans un shell séparé.
gemea_ok() {  # gemea_ok <fichier> <entrée> <sim|nao>
  local arq="$1" val="$2" esperado="$3" real
  if bash -c 'INSTALL_SH_LIB=1 . "./$0" >/dev/null 2>&1; resposta_sim "$1"' "$arq" "$val"
  then real=sim; else real=nao; fi
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s : "%s" → %s\n' "$arq" "$val" "$real"
  else printf '  ✗ %s : "%s" a donné %s, attendait %s\n' "$arq" "$val" "$real" "$esperado"; fail=1; fi
}
for arquivo in install.sh _common.sh; do
  gemea_ok "$arquivo" "O"      sim
  gemea_ok "$arquivo" "oui"    sim
  gemea_ok "$arquivo" "non"    nao
  gemea_ok "$arquivo" ""       nao
done

echo "RAM : l'avertissement ne doit pas tomber sur qui a acheté le VPS recommandé"
# MemTotal est toujours INFÉRIEUR à ce qui est vendu (le noyau se réserve une part). Mesuré : 8 Gio
# configurés rapportent 8025284 Ko (95,7 %). Les valeurs ci-dessous sont ce que chaque
# taille de VPS rapporte réellement — celle de 4 Go est le cas que ce test existe
# pour protéger, dans les deux conventions où les fournisseurs vendent « 4 Go ».
ram_ok() {  # ram_ok <description> <avisa|silencia> <mem_kb>
  local desc="$1" esperado="$2" kb="$3" real
  if ram_abaixo_do_recomendado "$kb"; then real=avisa; else real=silencia; fi
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (%s Ko → %s, attendait %s)\n' "$desc" "$kb" "$real" "$esperado"; fail=1; fi
}
ram_ok "VPS de 4 Gio (95,7 % rapporté)"          silencia 4012000
ram_ok "VPS de 4 Go décimaux (pire cas)"         silencia 3735000
ram_ok "VPS de 8 Go (mesuré pour de vrai)"       silencia 8025284
ram_ok "VPS de 3 Go — sous la recommandation"    avisa    2900000
ram_ok "VPS de 2 Go — l'offre qui ne suffit pas" avisa    1950000

echo "santé de l'app (wait_app_healthy)"
# install.sh considérait l'app bonne quand le PORT 3000 acceptait la connexion — ce qui
# arrive dès que Node démarre, avant qu'il sache s'il atteint la base. Le cas
# « corps vide » ci-dessous est exactement celui-là : avec l'ancienne sonde il était vert, et
# « Installation terminée ! » sortait par-dessus une app cassée.
# Les payloads ci-dessous sont le CONTRAT RÉEL de la route, capturé sur l'app en production
# — pas un format inventé ici. La version précédente de ces tests simulait
# {"status":"ok"}, que le produit n'émet JAMAIS : `ok` est le vocabulaire des checks
# individuels, et le statut global utilise healthy|degraded|unhealthy. Le test passait
# en validant un contrat qui n'existait pas.
HEALTHY='{"data":{"status":"healthy","version":"0.1.0","checks":{"supabase":{"status":"ok","latency_ms":268},"redis":{"status":"ok","latency_ms":4},"waha":{"status":"ok","latency_ms":6}}}}'
DEGRADED='{"data":{"status":"degraded","checks":{"supabase":{"status":"ok"},"waha":{"status":"degraded","error":"not_configured"}}}}'
UNHEALTHY='{"data":{"status":"unhealthy","checks":{"supabase":{"status":"down","error":"http_500"},"redis":{"status":"ok"}}}}'

saude_ok() {  # saude_ok <description> <saudavel|nao> <statut> <corps réel>
  local desc="$1" esperado="$2" st="$3" corpo="$4" real
  if ST="$st" CORPO="$corpo" bash -c '
        . ./_common.sh
        app_health_probe() { printf "%s\n%s\n" "${ST}" "${CORPO}"; }
        wait_app_healthy 2 0
      ' >/dev/null 2>&1
  then real=saudavel; else real=nao; fi
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (a donné %s, attendait %s)\n' "$desc" "$real" "$esperado"; fail=1; fi
}
saude_ok "healthy (payload réel de production)"       saudavel healthy   "$HEALTHY"
saude_ok "degraded : service optionnel sans config"  saudavel degraded "$DEGRADED"
saude_ok "unhealthy MÊME SI redis est ok"            nao      unhealthy "$UNHEALTHY"
saude_ok "port ouvert, app muette"                   nao      ''        ''
saude_ok "le proxy a renvoyé du HTML d'erreur"       nao      ''        '<html>502 Bad Gateway</html>'

echo "brouillon des réponses (save_partial → load_env)"
# Qui bloque sur la connection string — la question la plus difficile, et la dernière des
# identifiants — perdait les 11 réponses précédentes. Ce qui compte ici est
# l'ALLER-RETOUR : la valeur qui revient doit être octet par octet ce qui a été tapé,
# sinon la reprise livre un mot de passe altéré et l'erreur n'apparaît que dans le
# psql. Les valeurs ci-dessous sont celles qui cassent un parseur naïf.
partial_ok() {  # partial_ok <description> <valeur>
  # kit capturé AVANT le cd : dans $( cd "$dir" && … ) le $PWD est déjà le
  # temporaire, et le passer comme origine des scripts faisait que le sous-shell ne trouvait
  # ni install.sh ni _common.sh — et l'aller-retour revenait vide, indiscernable
  # de « la valeur s'est perdue dans le fichier ».
  local desc="$1" val="$2" dir out kit="$PWD"
  dir="$(mktemp -d)"
  # Les deux sources : envq/save_partial vivent dans install.sh, load_env dans
  # _common.sh — et le garde de bibliothèque d'install.sh revient avant de
  # le sourcer. Charger un seul des deux laisse la moitié manquante indéfinie, et
  # l'aller-retour revient vide comme si la valeur s'était perdue.
  out="$(cd "$dir" && PARTIAL_FILE=".p" bash -c '
      . "$1/_common.sh"
      INSTALL_SH_LIB=1 . "$1/install.sh"
      SENHA="$2"
      save_partial SENHA
      unset SENHA
      load_env .p
      printf "%s" "$SENHA"
    ' _ "$kit" "$val")"
  rm -rf "$dir"
  if [ "$out" = "$val" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s\n     a écrit :  [%s]\n     est revenu : [%s]\n' "$desc" "$val" "$out"; fail=1; fi
}
partial_ok "mot de passe simple"          'abc123'
partial_ok "avec espace"                  'mon bon motdepasse'
partial_ok "avec # (pas un commentaire)"  'mot#passe'
partial_ok "avec \$ (non développé)"      'mot$passe$HOME'
partial_ok "avec guillemet simple"        "mot'passe"
partial_ok "avec guillemets doubles"      'mot"passe"'
partial_ok "avec barre oblique inverse"   'C:\rota\nova'
partial_ok "avec accent grave"            'mot`passe`'
partial_ok "vraie connection string"      'postgresql://postgres.abc:p%40ss@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'

echo "format du .env : les TROIS consommateurs lisent ce qu'écrit envq"
# Le .env n'a pas un lecteur, il en a trois, et chacun apporte un parseur différent :
#
#   1. `load_env` (_common.sh) — lecture manuelle, par où passe tout script du kit
#   2. `env_file: .env` de docker-compose.prod.yml (:34 et :71)
#   3. `source .env && curl …` — la recette du README (:143)
#
# Jusqu'en 2026-08 cette suite n'exerçait que le (1), et avec un fixture sans apostrophe. Le
# (2) est le trou par où le défaut est passé : avec des guillemets simples, envq écrivait
# `APP_NAME='L'\''Atelier Dentaire'` — du shell valide, et refusé EN ENTIER par le
# parseur dotenv de Compose (mesuré en v2.38.2) :
#
#   failed to read .env: line 1: unexpected character "\" in variable name
#   "\''Atelier Dentaire'"
#
# Ce n'était pas une seule commande : `config`, `ps` et `pull` sortaient tous rc=1. L'acheteur
# terminait l'installation avec la base provisionnée, le schéma appliqué, l'admin
# créé, et toute commande docker du kit morte — à cause de l'apostrophe du nom de sa
# clinique.
#
# C'est pourquoi la liste de valeurs est UNIQUE et les trois blocs ci-dessous la parcourent
# en entier : un encodage qui plaît à deux lecteurs et casse le troisième est
# exactement la forme qu'a eue le défaut.
ENV_CASOS=(
  "apostrophe — le cas qui cassait Compose|L'Atelier Dentaire"
  'guillemets doubles|Maison "Belle"'
  'dollar non développé|Boutique P$ss'
  'dièse pas un commentaire|Boutique #1'
  "combiné, comme un vrai nom|Chez N'Diaye & Fils #2 \$X"
  'barre oblique inverse|C:\rota\nova'
  'mot de passe avec apostrophe|mot de p@sse L'"'"'Atelier 8'
  # L'accent grave est le caractère qui sépare « valeur erronée » de « commande exécutée » : sans
  # échappement, le `source` du README exécute ce qui se trouve entre eux. RÉSIDU MESURÉ :
  # le parseur dotenv de Compose défait `\"`, `\\` et `\$`, mais NE défait PAS
  # l'accent grave échappé — le conteneur reçoit `Boutique \`date\` SARL`. L'échapper
  # quand même est le choix noté dans le commentaire d'envq (valeur moche dans le conteneur
  # < exécution de commande). Les deux autres consommateurs reçoivent la valeur intacte,
  # et c'est ce que les cas ci-dessous exigent d'eux.
  'accent grave (sans échappement, source EXÉCUTE)|Boutique `date` SARL'
)

# Écrit UN .env avec le VRAI envq d'install.sh, dans le dossier demandé. Sort
# d'install.sh pour de vrai (pas une réimplémentation) : un envq copié ici
# resterait vert avec install.sh saboté, qui est le mode d'échec noté dans le
# bloc `reexec_neg` à la fin de ce fichier.
env_fixture() {  # env_fixture <dir> <dir du kit> <valeur>
  rm -f "$1/.env"
  ( cd "$1" && KIT="$2" VAL="$3" bash -c '
      INSTALL_SH_LIB=1 . "$KIT/install.sh"
      envq APP_NAME "$VAL" > .env
    ' )
  # Le dossier du bloc Compose est RÉUTILISÉ entre les cas : sans cette vérification,
  # une génération qui échouerait laisserait le .env du cas PRÉCÉDENT en place et le cas
  # suivant passerait en mesurant le fixture du voisin — vert par vacuité.
  [ -s "$1/.env" ]
}

le_ok() {  # le_ok <description> <valeur>
  local desc="$1" val="$2" dir out kit="$PWD"
  dir="$(mktemp -d)"
  if ! env_fixture "$dir" "$kit" "$val"; then
    printf '  ✗ %s — envq n’a généré aucun .env\n' "$desc"; fail=1; rm -rf "$dir"; return
  fi
  out="$(cd "$dir" && KIT="$kit" bash -c '
      . "$KIT/_common.sh"
      load_env .env
      printf "%s" "$APP_NAME"
    ')"
  rm -rf "$dir"
  if [ "$out" = "$val" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s\n     a écrit :  [%s]\n     est revenu : [%s]\n' "$desc" "$val" "$out"; fail=1; fi
}

# C'est le consommateur qui NE pardonne PAS : `source` c'est le shell qui interprète le
# fichier, donc un accent grave mal échappé ne renvoie pas une valeur erronée — il EXÉCUTE. C'est
# pourquoi envq échappe l'accent grave même en sachant que Compose ne le défait pas.
src_ok() {  # src_ok <description> <valeur>
  local desc="$1" val="$2" dir out kit="$PWD"
  dir="$(mktemp -d)"
  if ! env_fixture "$dir" "$kit" "$val"; then
    printf '  ✗ %s — envq n’a généré aucun .env\n' "$desc"; fail=1; rm -rf "$dir"; return
  fi
  # Processus séparé : si l'encodage régresse, qui exécute le contenu du .env
  # est ce bash jetable, pas la suite.
  out="$(cd "$dir" && bash -c 'set -a; . ./.env; set +a; printf "%s" "$APP_NAME"' 2>/dev/null)"
  rm -rf "$dir"
  if [ "$out" = "$val" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s\n     a écrit :  [%s]\n     est revenu : [%s]\n' "$desc" "$val" "$out"; fail=1; fi
}

echo "  consommateur 1 — load_env (tout script du kit)"
for _caso in "${ENV_CASOS[@]}"; do le_ok  "${_caso%%|*}" "${_caso#*|}"; done
echo "  consommateur 3 — source (la recette du README)"
for _caso in "${ENV_CASOS[@]}"; do src_ok "${_caso%%|*}" "${_caso#*|}"; done
unset _caso

echo "  consommateur 2 — docker compose (env_file: .env)"
# `docker compose config` est 100 % côté client : il ne parle pas au daemon et ne télécharge pas
# d'image (mesuré — avec DOCKER_HOST pointant vers un socket inexistant il
# signale encore l'erreur de parse du .env). Autrement dit, il tient dans ce que l'en-tête de ce
# fichier promet : sans réseau.
#
# L'assertion est « Compose PARVIENT À LIRE le fichier », et non l'égalité de la valeur,
# pour une raison mesurée : la sortie de `config` ré-échappe `$` en `$$` (c'est
# l'encodage d'interpolation de compose lui-même), donc comparer octet par octet
# recalerait un fichier correct. Et lire est ce que le défaut empêchait — rc=1 sur
# config, ps et pull.
if ! docker compose version >/dev/null 2>&1; then
  # Saut à voix haute, en nommant ce qui reste sans couverture : un saut silencieux est
  # indiscernable d'un test qui a passé.
  printf '  — sauté : pas de `docker compose` sur cette machine\n'
  printf '     NON mesuré : si le .env généré par envq est lisible par le `env_file:` de compose\n'
  printf '     (c’est le consommateur par lequel est passé le défaut de l’apostrophe ; les deux autres ci-dessus ont tourné)\n'
else
  DC_DIR="$(mktemp -d)"
  cat > "$DC_DIR/docker-compose.yml" <<'YML'
services:
  app:
    image: alpine:3.20
    env_file: .env
YML
  dc_ok() {  # dc_ok <description> <valeur>
    local desc="$1" val="$2" err rc kit="$PWD"
    if ! env_fixture "$DC_DIR" "$kit" "$val"; then
      printf '  ✗ %s — envq n’a généré aucun .env\n' "$desc"; fail=1; return
    fi
    err="$(cd "$DC_DIR" && docker compose config -q 2>&1)"; rc=$?
    if [ $rc -eq 0 ]; then printf '  ✓ %s\n' "$desc"
    else printf '  ✗ %s — Compose a refusé le .env (rc=%s)\n     %s\n' "$desc" "$rc" "$(printf '%s' "$err" | head -1)"; fail=1; fi
  }
  for _caso in "${ENV_CASOS[@]}"; do dc_ok "${_caso%%|*}" "${_caso#*|}"; done
  unset _caso

  # CONTRÔLE POSITIF. Sans lui les cas ci-dessus passeraient par vacuité : un
  # `docker compose config` qui ignorerait l'env_file, ou un .env vide, sortiraient aussi
  # rc=0. Ici l'ANCIEN format est écrit à la main — c'est ce que le kit écrivait
  # avant 2026-08 — et il DOIT être refusé. Si un jour ceci devient vert,
  # Compose s'est mis à accepter `'\''` et la raison d'être du nouvel encodage a changé :
  # relisez le commentaire d'envq avant de toucher à quoi que ce soit.
  cat > "$DC_DIR/.env" <<'EOF'
APP_NAME='L'\''Atelier Dentaire'
EOF
  if (cd "$DC_DIR" && docker compose config -q >/dev/null 2>&1); then
    printf '  ✗ contrôle positif : Compose a ACCEPTÉ l’ancien format à guillemets simples\n'
    printf '     les cas ci-dessus ne distinguent plus le défaut de la correction\n'; fail=1
  else
    printf '  ✓ contrôle positif : l’ANCIEN format (guillemets simples) est refusé par Compose\n'
  fi
  rm -rf "$DC_DIR"
fi

echo "rétrocompatibilité : le .env d'une ancienne installation reste lisible"
# Qui a installé avant 2026-08 a un .env à guillemets simples avec `'\''`, et il
# N'est PAS réécrit à la mise à jour : update.sh ne change que APP_IMAGE et APP_PULL_POLICY
# (:159 et :165) et laisse les autres clés comme elles étaient. Si la branche
# guillemets simples de load_env disparaît dans un « maintenant tout est en guillemets doubles », le nouveau kit
# se met à renvoyer mot de passe et connection string avec quatre caractères de trop, et
# l'ancienne installation casse à la mise à jour, loin de toute piste.
#
# Le fixture est écrit à la main, dans l'ANCIEN format, exprès : le générer avec
# l'envq d'aujourd'hui mesurerait le format d'aujourd'hui et n'aurait rien de rétrocompatible.
TMP_LEGADO="$(mktemp -d)"
cat > "$TMP_LEGADO/.env" <<'EOF'
APP_NAME='L'\''Atelier Dentaire'
SENHA_LEGADA='mot'\''passe avec espace'
DB_LEGADA='postgresql://postgres.abc:p%40ss@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
CIFRAO_LEGADO='p$ass'
EOF
( . ./_common.sh
  load_env "$TMP_LEGADO/.env"
  eq() { if [ "$2" = "$3" ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s  attendait [%s] a obtenu [%s]\n' "$1" "$3" "$2"; exit 1; fi; }
  eq "ancien nom avec apostrophe"            "$APP_NAME"      "L'Atelier Dentaire"
  eq "ancien mot de passe avec apostrophe"   "$SENHA_LEGADA"  "mot'passe avec espace"
  eq "ancienne connection string"            "$DB_LEGADA"     'postgresql://postgres.abc:p%40ss@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
  eq "ancien dollar non développé"           "$CIFRAO_LEGADO" 'p$ass'
) || fail=1
rm -rf "$TMP_LEGADO"

echo "cron : installer une instance ne doit pas faire taire l'autre"
# Fixture = le crontab RÉEL d'un VPS avec la production en marche (le Bearer remplacé par
# un placeholder). L'ancien filtre était `grep -v 'event-log-drain'`, qui correspondait à
# la ligne de N'IMPORTE QUELLE installation : démarrer une seconde instance sur la même machine
# effaçait les deux lignes de la première, en silence.
CRONTAB_VIZINHO='0 8 * * * /root/trend-radar/run_full_vps.sh
* * * * * curl -fsS -H "Authorization: Bearer SEGREDO" "https://crm.deskcomm.com.br/api/v1/cron/event-log-drain" >/dev/null 2>&1
*/5 * * * * cd /root/Aula-Youtube/DeskcommCRM && bash hostgator-setup-kit/agent.sh >/dev/null 2>&1'

cron_ok() {  # cron_ok <description> <attendu_dans_le_résultat> <marqueur> <hérité> <nouvelle_ligne>
  local desc="$1" espera="$2" marcador="$3" legado="$4" nova="$5" out
  out="$(printf '%s\n' "$CRONTAB_VIZINHO" | cron_merge "$marcador" "$legado" "$nova")"
  if printf '%s' "$out" | grep -qF -e "$espera"; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s\n     a disparu du crontab : %s\n' "$desc" "$espera"; fail=1; fi
}
NOVO_TAG='# deskcomm:/root/instalacao-nova'
NOVA_URL='https://crm-novo.exemplo.com.br/api/v1/cron/event-log-drain'
cron_ok "le drain du voisin survit"  'crm.deskcomm.com.br/api/v1/cron/event-log-drain' \
        "$NOVO_TAG" "$NOVA_URL" "* * * * * curl \"$NOVA_URL\" $NOVO_TAG"
cron_ok "l'agent du voisin survit" 'cd /root/Aula-Youtube/DeskcommCRM && bash hostgator-setup-kit/agent.sh' \
        "$NOVO_TAG" "cd /root/instalacao-nova && bash hostgator-setup-kit/agent.sh" \
        "*/5 * * * * cd /root/instalacao-nova && bash hostgator-setup-kit/agent.sh $NOVO_TAG"
cron_ok "la ligne étrangère (trend-radar) survit" '/root/trend-radar/run_full_vps.sh' \
        "$NOVO_TAG" "$NOVA_URL" "* * * * * curl \"$NOVA_URL\" $NOVO_TAG"

# Réexécuter la MÊME installation remplace sa propre ligne au lieu d'empiler —
# y compris l'héritée, écrite avant que le marqueur n'existe.
reexec="$(printf '%s\n' "$CRONTAB_VIZINHO" | cron_merge '# deskcomm:/root/Aula-Youtube/DeskcommCRM' \
          'cd /root/Aula-Youtube/DeskcommCRM && bash hostgator-setup-kit/agent.sh' \
          '*/5 * * * * cd /root/Aula-Youtube/DeskcommCRM && bash hostgator-setup-kit/agent.sh # deskcomm:/root/Aula-Youtube/DeskcommCRM')"
n_agent="$(printf '%s\n' "$reexec" | grep -cF 'hostgator-setup-kit/agent.sh')"
if [ "$n_agent" = 1 ]; then printf '  ✓ réexécuter la même installation ne duplique pas la ligne\n'
else printf '  ✗ la réexécution a dupliqué : %s lignes agent.sh\n' "$n_agent"; fail=1; fi

# Les DEUX lignes de la même installation doivent coexister. Avec un seul marqueur par
# installation (sans le rôle), la seconde fonction exécutée effaçait la ligne de la
# première — les deux correspondaient au même marqueur. Mesuré sur le VPS : après
# l'installation il ne restait que l'agent, et le CRM se retrouvait SANS le drain d'événements, avec
# toute l'automatisation arrêtée en silence. Ce test exécute les deux à la suite,
# comme le fait l'installation.
DIR=/root/instalacao-nova
TAG_DRAIN="# deskcomm:${DIR}:drain"; TAG_AGENT="# deskcomm:${DIR}:agent"
L_DRAIN="* * * * * curl \"https://novo.exemplo.com.br/api/v1/cron/event-log-drain\" $TAG_DRAIN"
L_AGENT="*/5 * * * * cd ${DIR} && bash hostgator-setup-kit/agent.sh $TAG_AGENT"
depois_drain="$(printf '%s\n' "$CRONTAB_VIZINHO" | cron_merge "$TAG_DRAIN" 'https://novo.exemplo.com.br/api/v1/cron/event-log-drain' "$L_DRAIN")"
depois_agent="$(printf '%s\n' "$depois_drain" | cron_merge "$TAG_AGENT" "cd ${DIR} && bash hostgator-setup-kit/agent.sh" "$L_AGENT")"
# Compte les DEUX lignes par ce qu'elles font (l'URL du drain, le cd de l'agent), pas
# par le format du marqueur : une assertion sur le marqueur recalerait un changement
# de format inoffensif et passerait à côté de ce qui compte, à savoir que les deux
# tâches restent planifiées.
tem_drain="$(printf '%s\n' "$depois_agent" | grep -cF 'novo.exemplo.com.br/api/v1/cron/event-log-drain')"
tem_agent="$(printf '%s\n' "$depois_agent" | grep -cF "cd ${DIR} && bash hostgator-setup-kit/agent.sh")"
if [ "$tem_drain" -ge 1 ] && [ "$tem_agent" -ge 1 ]; then
  printf '  ✓ drain et agent de la même installation coexistent\n'
else
  printf '  ✗ l’une a effacé l’autre (drain=%s, agent=%s — attendait 1 de chaque)\n' "$tem_drain" "$tem_agent"; fail=1
fi

echo "provisionnement de la base : mot de passe de la base"
# Deux tests distincts, parce que le défaut et le contrat vivent à des endroits
# différents — et le premier test que j'ai écrit ici était VIDE faute de les séparer.
#
# (1) POINT D'APPEL. Le bug était l'affectation au niveau du script : avec pipefail, le
#     SIGPIPE de `tr` devenait le statut de l'affectation et le `set -e` tuait tout,
#     juste après que le mot de passe existe. Mesuré : le même pipe DANS une fonction
#     survit (le statut devient celui du printf final), au niveau du script il sort 141.
#     Donc tester la fonction n'attrape pas la régression qui compte — ce qui l'attrape, c'est
#     lancer le script et exiger qu'il ARRIVE à l'étape suivante.
#     L'étape 3 affiche le titre avant de toucher au réseau, donc l'assertion ne
#     dépend pas de la réponse de l'API (et le jeton ici est volontairement invalide).
saida="$(NEON_MANAGEMENT_TOKEN=token-invalido-de-teste SUPABASE_ORG_ID=org-de-teste \
         bash ./supabase-provision.sh "Projet de Test" sa-east-1 2>&1 || true)"
if printf '%s' "$saida" | grep -q 'Création du projet'; then
  printf '  ✓ le script dépasse la génération du mot de passe et arrive à l’étape de création\n'
else
  printf '  ✗ le script est MORT avant de créer le projet (le défaut est revenu)\n'
  printf '     dernière ligne vue : %s\n' "$(printf '%s' "$saida" | sed -E 's/\x1b\[[0-9;]*m//g' | grep -v '^$' | tail -1)"
  fail=1
fi

# (2) CONTRAT du mot de passe. Il entre dans la connection string : un '@' ou '/' ici
#     coupe l'hôte en deux, et l'erreur n'apparaîtrait que dans psql.
senha="$(bash -c 'set -euo pipefail; SUPABASE_PROVISION_LIB=1 . ./supabase-provision.sh; gen_db_pass' 2>/dev/null)"
if [ "${#senha}" = 32 ]; then printf '  ✓ 32 caractères\n'
else printf '  ✗ mot de passe de %s caractères, attendait 32\n' "${#senha}"; fail=1; fi
case "$senha" in
  *[!A-Za-z0-9]*) printf '  ✗ contient un caractère qui casse la connection string\n'; fail=1;;
  '')             printf '  ✗ mot de passe vide\n'; fail=1;;
  *)              printf '  ✓ seulement des alphanumériques (ne coupe pas la connection string)\n';;
esac

echo "e-mails d'accès : marca-emails.sh"
# POURQUOI CE BLOC EXISTE : l'e-mail de confirmation de compte est le PREMIER
# artefact qu'un client du revendeur reçoit, et il est monté par un processus
# TIERS (GoTrue). Aucun test de l'app ne l'atteint — la seule façon de
# surveiller cela est d'exercer le script qui pousse le texte.
#
# Les cas ci-dessous couvrent tout ce qui peut être prouvé SANS réseau : rendu,
# échappement, et les trois sorties qui ne doivent pas faire tomber l'installation. Le chemin avec
# réseau (PATCH + relecture) a été mesuré à la main contre la Management API le
# 2026-08-14 et est déclaré dans l'en-tête du script.
ME_TMP="$(mktemp -d)"

# (1) Sans jeton, sort 0 et ENSEIGNE l'étape manuelle. C'est le cas courant : qui crée
#     le projet dans le panneau et colle les 4 identifiants n'a jamais eu de jeton.
saida_me="$(NEON_MANAGEMENT_TOKEN= bash ./marca-emails.sh --env /dev/null 2>&1)"; rc_me=$?
if [ $rc_me -ne 0 ]; then
  printf '  ✗ sans jeton le script est sorti %s — il NE doit PAS faire tomber install.sh\n' "$rc_me"; fail=1
else
  printf '  ✓ sans jeton : sort 0 (l’installation continue)\n'
fi
if printf '%s' "$saida_me" | grep -q 'NEON_MANAGEMENT_TOKEN'; then
  printf '  ✓ sans jeton : dit quelle clé manque\n'
else
  printf '  ✗ sans jeton : le message ne nomme pas NEON_MANAGEMENT_TOKEN\n'; fail=1
fi
# L'étape manuelle doit enseigner `&`. C'est un `?` dans cette même recette (dans la doc de
# déploiement) qui a enregistré le lien cassé dans le projet de production.
if printf '%s' "$saida_me" | grep -q '{{ .RedirectTo }}&token_hash'; then
  printf '  ✓ sans jeton : l’étape manuelle enseigne le séparateur & (jamais ?)\n'
else
  printf '  ✗ sans jeton : l’étape manuelle ne montre pas le lien avec &\n'; fail=1
fi

# (2) Une base AUTO-HÉBERGÉE n'a pas de Management API : avec jeton et tout,
#     le bon geste est d'enseigner le chemin GoTrue, pas de tenter un PATCH qui n'existe pas.
saida_me="$(NEON_MANAGEMENT_TOKEN=sbp_de_teste NEON_DATA_API_URL=https://supabase.monclient.cm \
            bash ./marca-emails.sh --env /dev/null 2>&1)"; rc_me=$?
if [ $rc_me -eq 0 ] && printf '%s' "$saida_me" | grep -q 'GOTRUE_MAILER_TEMPLATES'; then
  printf '  ✓ base auto-hébergée : sort 0 et renvoie vers le chemin GoTrue\n'
else
  printf '  ✗ base auto-hébergée : rc=%s, message sans GOTRUE_MAILER_TEMPLATES\n' "$rc_me"; fail=1
fi

# (3) VACUITÉ : les modèles sur le disque doivent AVOIR le placeholder, sinon le cas
#     (4) comparerait l'absence de marque avec l'absence de marque et passerait.
for modelo in ../supabase/templates/confirmation.html ../supabase/templates/recovery.html; do
  if grep -q '__APP_NAME__' "$modelo"; then
    printf '  ✓ %s a __APP_NAME__ à remplacer\n' "$(basename "$modelo")"
  else
    printf '  ✗ %s N’a PAS __APP_NAME__ — le remplacement ci-dessous ne prouve rien\n' "$(basename "$modelo")"; fail=1
  fi
done

# (4) Rendu avec un nom HOSTILE. `&` à droite d'un `sed` (ou d'un
#     `${x//p/r}` en bash 5.2) vaut « l'extrait correspondant » — mesuré : `Boutique
#     <b>Top</b> & Cie` sortait `Boutique <lt;b>gt;Top…`. Et un `<b>` brut injecterait du balisage
#     dans le corps de l'e-mail de chaque client du revendeur.
NEON_MANAGEMENT_TOKEN= APP_NAME='Boutique <b>Top</b> & Cie' APP_ACCENT_HEX='#f2c94c' \
  bash ./marca-emails.sh --env /dev/null --render-em "$ME_TMP/render" >/dev/null 2>&1
rend="$ME_TMP/render/confirmation.html"
if [ ! -f "$rend" ]; then
  printf '  ✗ --render-em n’a pas écrit confirmation.html\n'; fail=1
else
  if grep -q '__APP_NAME__\|__ACCENT__\|__ACCENT_FG__' "$rend"; then
    printf '  ✗ il reste un placeholder dans le HTML rendu : %s\n' "$(grep -o '__[A-Z_]*__' "$rend" | sort -u | tr '\n' ' ')"; fail=1
  else
    printf '  ✓ aucun placeholder ne reste dans le HTML rendu\n'
  fi
  if grep -qF 'Boutique &lt;b&gt;Top&lt;/b&gt; &amp; Cie' "$rend"; then
    printf '  ✓ le nom de la marque sort échappé (aucun balisage injecté dans l’e-mail)\n'
  else
    printf '  ✗ le nom de la marque N’est PAS sorti échappé : %s\n' "$(grep -o 'Boutique [^.]*' "$rend" | head -1)"; fail=1
  fi
  # Le jaune est clair : un texte blanc par-dessus serait illisible. C'est le cas exact que le
  # `#ffffff` fixe produisait — et c'est la marque qu'un revendeur colle sans prévenir.
  if grep -q 'color: #171f15' "$rend"; then
    printf '  ✓ un accent clair (#f2c94c) choisit un texte FONCÉ\n'
  else
    printf '  ✗ un accent clair n’a pas choisi un texte foncé : %s\n' "$(grep -o 'background: #f2c94c[^"]*' "$rend" | head -1)"; fail=1
  fi
  # La note de maintenance en haut du modèle parle de placeholder et de --render-em :
  # elle s'adresse à qui édite le dépôt, pas au client final.
  if grep -q 'MODELO — os' "$rend"; then
    printf '  ✗ la note interne du modèle est partie dans l’e-mail\n'; fail=1
  else
    printf '  ✓ la note interne du modèle reste hors de l’e-mail\n'
  fi
fi

# (5) La paire clair/foncé : un accent foncé doit choisir le BLANC. Sans ce cas,
#     un `frente_sobre` qui renverrait toujours "#171f15" passerait le cas (4).
NEON_MANAGEMENT_TOKEN= APP_NAME='Marque Sombre' APP_ACCENT_HEX='#0b3d2e' \
  bash ./marca-emails.sh --env /dev/null --render-em "$ME_TMP/escuro" >/dev/null 2>&1
if grep -q 'color: #ffffff' "$ME_TMP/escuro/confirmation.html" 2>/dev/null; then
  printf '  ✓ un accent foncé (#0b3d2e) choisit un texte BLANC\n'
else
  printf '  ✗ un accent foncé n’a pas choisi un texte blanc\n'; fail=1
fi

# (6) Un hex invalide dans le .env ne peut pas devenir du CSS cassé dans l'e-mail : il retombe sur l'accent
#     du produit, qui est le même plancher que lib/branding/saida.ts.
NEON_MANAGEMENT_TOKEN= APP_NAME='Marque Tordue' APP_ACCENT_HEX='vert-citron' \
  bash ./marca-emails.sh --env /dev/null --render-em "$ME_TMP/torto" >/dev/null 2>&1
if grep -q 'background: #506d48; background: #506d48' "$ME_TMP/torto/confirmation.html" 2>/dev/null; then
  printf '  ✓ un APP_ACCENT_HEX invalide retombe sur l’accent du produit\n'
else
  printf '  ✗ un APP_ACCENT_HEX invalide est devenu du CSS invalide : %s\n' \
    "$(grep -o 'background: [^;]*;' "$ME_TMP/torto/confirmation.html" 2>/dev/null | head -2 | tr '\n' ' ')"; fail=1
fi

rm -rf "$ME_TMP"

# (7) Le VALIDATEUR de la couleur, dans install.sh — l'autre bout des cas (4)-(6).
#     `v_hex` est étroit exprès : n'accepte QUE `#` + 6 chiffres, qui est la seule
#     forme que le `case` de `marca-emails.sh:125` reconnaît. L'`ehHexValido` de l'app
#     (`lib/branding/rampa.ts:49`) en accepte quatre de plus (`#abc`, `abc`, `aabbcc`),
#     et les laisser passer ici produirait la pire issue : la couleur du revendeur à
#     l'écran et le vert du produit dans le premier e-mail — une marque coupée en deux que personne
#     ne remarque, parce que chaque moitié semble correcte seule.
ok "couleur hex à 6 chiffres"                     pass   v_hex "#7a5cd6"
ok "couleur vide (Entrée) — le champ est optionnel" pass v_hex ""
ok "un nom de couleur n'est pas un hex"           reject v_hex "vert-citron" "6 chiffres"
ok "hex à 3 chiffres : l'e-mail ne le lit pas"    reject v_hex "#7a5"        "6 chiffres"

# (8) RÉGRESSION DE LA BOUCLE. Le cas d'intégration du VPS propre prouve déjà le
#     comportement (la couleur répondue revient via `load_env`) ; celui-ci existe
#     pour NOMMER la ligne qui manque quand celui-là échoue — « la couleur n'est pas revenue »
#     ne dit pas au lecteur que le trou est dans la liste d'`envq`.
if grep -qE '^[[:space:]]*envq APP_ACCENT_HEX' install.sh; then
  printf '  ✓ install.sh écrit APP_ACCENT_HEX dans le .env\n'
else
  printf '  ✗ install.sh N’écrit PAS APP_ACCENT_HEX : demander sans écrire fait que la personne\n'
  printf '     répond et perd la réponse dans la même exécution (le bloc se termine par `} > .env`,\n'
  printf '     qui tronque à partir de la liste d’envq).\n'; fail=1
fi

echo "proxy inverse : qui tient les ports 80/443"
# La version précédente ne savait chercher que Traefik. Tout autre proxy — y compris le
# Caddy d'un AUTRE DeskcommCRM sur le même VPS — tombait dans la branche « ports libres », et
# l'installation allait jusqu'à la phase 4 pour mourir sur « Bind for 0.0.0.0:80 failed:
# port is already allocated ». Mesuré sur un VPS avec la production en marche.
# dono_das_portas lit ce que `docker ps` affiche réellement. Les cas avec "->"
# viennent de la vraie colonne Ports ; ce qui décide est le côté AVANT la flèche (le port de
# l'HÔTE). La première version de ceci regardait le port INTERNE et se trompait des deux côtés.
dono_ok() {  # dono_ok <description> <attendu : nom|image ou vide> <lignes de docker ps>
  local desc="$1" esperado="$2" linhas="$3" real
  real="$(printf '%s\n' "$linhas" | dono_das_portas || true)"
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s\n     a donné :  [%s]\n     attendait : [%s]\n' "$desc" "$real" "$esperado"; fail=1; fi
}
dono_ok "un proxy publiant 80 sur l'hôte est trouvé" \
  'traefik|infra|traefik:v3.3' 'traefik|infra|traefik:v3.3|0.0.0.0:80->80/tcp, [::]:80->80/tcp'
dono_ok "une app en 8080->80 N'occupe PAS (80 de l'hôte libre)" \
  '' 'phpmyadmin|web|phpmyadmin:latest|0.0.0.0:8080->80/tcp'
dono_ok "un proxy sans privilège (80->8080) OCCUPE" \
  'traefik|infra|traefik:v3' 'traefik|infra|traefik:v3|0.0.0.0:80->8080/tcp'
dono_ok "le Caddy d'un autre Deskcomm est trouvé" \
  'outro-caddy-1|outro|caddy:2-alpine' 'outro-caddy-1|outro|caddy:2-alpine|0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp'
dono_ok "un conteneur sans port publié est ignoré" \
  '' 'worker|app|meu/worker|'
dono_ok "443 seul sur l'hôte compte aussi" \
  'proxy|infra|nginx' 'proxy|infra|nginx|0.0.0.0:443->443/tcp'
# Le balayage N'exclut plus personne : c'est l'appelant qui décide, en comparant le
# projet. Exclure ici produisait un « occupé par personne » — blocage sans
# commande actionnable — parce que le test de bind n'a aucun moyen de s'auto-exclure.
dono_ok "un conteneur de cette installation est IDENTIFIÉ (avec le projet)" \
  'crm-caddy-1|meu-projeto|caddy:2-alpine' 'crm-caddy-1|meu-projeto|caddy:2-alpine|0.0.0.0:80->80/tcp'
# Sans label compose, le champ du milieu arrive VIDE — avec un IFS tab il s'effondrait
# et l'image disparaissait, faisant d'un Traefik `docker run` un intrus.
dono_ok "un conteneur sans label compose garde l'image" \
  'meu-traefik||traefik:v3.1' 'meu-traefik||traefik:v3.1|0.0.0.0:80->80/tcp'

echo "proxy inverse : est-ce un Traefik ?"
tk_ok() {  # tk_ok <description> <sim|nao> <image> <nom>
  local desc="$1" esperado="$2" real
  if eh_traefik "${3:-}" "${4:-}"; then real=sim; else real=nao; fi
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (a donné %s, attendait %s)\n' "$desc" "$real" "$esperado"; fail=1; fi
}
tk_ok "image traefik"                     sim "traefik:v3.3"      "proxy-01"
tk_ok "nom en majuscules (TRAEFIK)"       sim "meureg/proxy:3"    "TRAEFIK-PROXY"
tk_ok "coolify-proxy est traefik par l'image" sim "traefik:v2.11" "coolify-proxy"
tk_ok "caddy n'est pas traefik"           nao "caddy:2-alpine"    "outro-caddy-1"
tk_ok "nginx n'est pas traefik"           nao "nginxproxy/nginx"  "webproxy"

echo "proxy inverse : la décision"
dec_ok() {  # dec_ok <description> <attendu> <occupés> <proj_propriétaire> <proj_actuel> <img> <nom> [arbo_propriétaire] [arbo_actuelle]
  local desc="$1" esperado="$2" real
  real="$(decide_proxy "${3:-}" "${4:-}" "${5:-}" "${6:-}" "${7:-}" "${8:-}" "${9:-}")"
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (a donné %s, attendait %s)\n' "$desc" "$real" "$esperado"; fail=1; fi
}
dec_ok "ports libres → notre Caddy"         caddy    ""        ""          "crm" ""              ""
# VOICI le cas que la revue a attrapé : le test de bind n'a aucun moyen de
# s'auto-exclure, donc lors d'une réexécution les ports apparaissent occupés — par notre
# PROPRE Caddy. Traiter cela comme intrus bloque l'installation que le kit demande de
# relancer pour corriger une réponse, et sans même une commande actionnable.
dec_ok "réexécution : ports tenus par cette même installation" caddy "80 et 443" "crm" "crm" "caddy:2-alpine" "crm-caddy-1"
dec_ok "Caddy d'un AUTRE Deskcomm → bloque" bloqueia "80 et 443" "outro"     "crm" "caddy:2-alpine" "outro-caddy-1"
# Le fixture ci-dessus nomme « un autre Deskcomm » mais utilise un projet DIFFÉRENT (« outro » vs
# « crm ») — et c'est justement le nom du projet qui NE diffère PAS dans le cas réel : le
# projet compose est le basename du dossier, et toute copie du dépôt s'appelle
# DeskcommCRM. Mesuré sur un VPS de production le 2026-08-24 : l'installation d'un
# cours dans /root/apagar7/DeskcommCRM a vu le Caddy de la production dans
# /root/DeskcommCRM avec le MÊME projet `deskcommcrm`, a conclu « c'est la
# réexécution » et a démarré par-dessus — changeant la base du CRM en ligne sans un avertissement.
# Ce qui distingue les deux est l'ARBORESCENCE (label com.docker.compose.project.working_dir),
# pas le nom.
dec_ok "copie sœur : même projet, AUTRE arborescence → bloque" \
  bloqueia "80 et 443" "deskcommcrm" "deskcommcrm" "caddy:2-alpine" "deskcommcrm-caddy-1" \
  "/root/DeskcommCRM" "/root/apagar7/DeskcommCRM"
# L'autre face de la même pièce : une VRAIE réexécution, c'est la même arborescence, et elle doit
# continuer de passer (c'est le chemin que le kit demande d'utiliser pour corriger une réponse).
dec_ok "vraie réexécution : même projet, MÊME arborescence → continue" \
  caddy "80 et 443" "deskcommcrm" "deskcommcrm" "caddy:2-alpine" "deskcommcrm-caddy-1" \
  "/root/DeskcommCRM" "/root/DeskcommCRM"
# Conteneur sans le label d'arborescence (pas créé par compose, ou ancien) :
# impossible d'affirmer que c'est une copie sœur, et fermer ici casserait une réexécution
# légitime. Garde le comportement antérieur — le balayage des ports reste
# le filet qui attrape le reste.
dec_ok "arborescence inconnue : garde le comportement antérieur" \
  caddy "80 et 443" "deskcommcrm" "deskcommcrm" "caddy:2-alpine" "deskcommcrm-caddy-1" \
  "" "/root/apagar7/DeskcommCRM"
dec_ok "Traefik de l'hébergeur → par lui"   traefik  "80 et 443" "coolify"   "crm" "traefik:v3.3"   "coolify-proxy"
dec_ok "occupant non identifié → bloque"    bloqueia "80"     ""          "crm" ""              ""
dec_ok "projet vide ne correspond pas à projet vide" bloqueia "80" ""     ""    "nginx"         "web"

echo "proxy inverse : Traefik en MODE HOST (le cas d'Hostinger, issue #139)"
# Les fixtures ci-dessus ont tous un port publié, et c'est pourquoi la suite entière passait
# sans jamais exercer le proxy en mode host — le scénario qui a généré l'issue.
# Mesuré avec docker 28.3.2 : un conteneur en `--network host` sort de `docker ps` avec la
# colonne Ports VIDE, même démarré avec `-p 80:80` (le daemon avertit
# « Published ports are discarded when using host network mode »). Contrôle
# positif : le même nginx sur un bridge avec `-p 8080:80` sort avec
# "0.0.0.0:8080->80/tcp". Donc dono_das_portas ne le trouve JAMAIS — c'est pourquoi
# il existe un second balayage, sur `docker ps --filter network=host`.
uni_ok() {  # uni_ok <description> <attendu : nom|projet|image ou vide> <lignes>
  local desc="$1" esperado="$2" linhas="$3" real
  real="$(printf '%s\n' "$linhas" | unico_traefik || true)"
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s\n     a donné :  [%s]\n     attendait : [%s]\n' "$desc" "$real" "$esperado"; fail=1; fi
}
# Ports vide est la donnée RÉELLE du mode host, pas un champ oublié dans le fixture.
uni_ok "un Traefik en mode host (Ports vide) est trouvé" \
  'traefik|hostinger|traefik:v3.3' 'traefik|hostinger|traefik:v3.3|'
uni_ok "parmi d'autres conteneurs en mode host, trouve le Traefik" \
  'proxy-hostinger||traefik:v3' 'node-exporter||prom/node-exporter|
proxy-hostinger||traefik:v3|
netdata||netdata/netdata|'
# Ferme FERMÉ au pluriel : avec deux, impossible de savoir lequel tient 80/443, et
# pointer vers le mauvais publie un CRM qui s'installe « avec succès » et ne répond pas.
uni_ok "deux Traefik → n'élit personne" \
  '' 'traefik-a||traefik:v3|
traefik-b||traefik:v2.11|'
uni_ok "aucun Traefik → n'élit personne" \
  '' 'nginx-host||nginx:alpine|'
uni_ok "liste vide → n'élit personne" '' ''

echo "proxy inverse : quel réseau écrire dans TRAEFIK_NETWORK"
# Les deux conclusions sont OPPOSÉES et les deux ont été, à un moment, la seule
# implémentée. Bridge propre → le réseau du PROXY (mesuré avec Traefik v3.3 : avec le
# label sur le réseau du projet la requête reste en HTTP 000). Mode host → un bridge
# À NOUS (mesuré : un conteneur en `--network host` atteint par IP un conteneur sur un
# bridge séparé, HTTP 200 ; et compose refuse un `external` pointant vers le réseau
# qu'il créerait lui-même).
rt_ok() {  # rt_ok <description> <attendu> <netmode> <réseaux du conteneur> <bridge du projet>
  local desc="$1" esperado="$2" real
  real="$(rede_do_traefik "${3:-}" "${4:-}" "${5:-}")"
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (a donné [%s], attendait [%s])\n' "$desc" "$real" "$esperado"; fail=1; fi
}
# NetworkMode et Networks mesurés avec docker 28.3.2 (pas inventés) : un réseau personnalisé
# renvoie son nom dans les deux champs ; le mode host renvoie "host" dans les deux.
rt_ok "Traefik sur son propre bridge → SON réseau" coolify    coolify    "coolify "        crm_proxy
rt_ok "Traefik sur le bridge par défaut → bridge"  bridge     bridge     "bridge "         crm_proxy
rt_ok "Traefik sur 2 réseaux → le premier"         coolify    coolify    "coolify web "    crm_proxy
# VOICI le défaut de l'issue #139 : en mode host `.NetworkSettings.Networks` renvoie
# la chaîne "host", qui est un réseau de driver `host` — l'écrire dans TRAEFIK_NETWORK
# tue le `up -d` avec « network host declared as external, but could not be found ».
rt_ok "le mode host N'écrit PAS le pseudo-réseau 'host'" crm_proxy  host  "host "      crm_proxy

echo "proxy inverse : le réseau externe existe-t-il et sert-il ?"
vr_ok() {  # vr_ok <description> <attendu> <driver trouvé> <réseau> <bridge du projet> [attachable]
  local desc="$1" esperado="$2" real
  # L'attachable n'est passé que quand le cas le déclare, et ce N'est PAS un caprice de
  # signature : l'appel à 3 arguments est le point d'appel d'avant Swarm, et il
  # doit continuer de refuser l'overlay. Passer "" toujours effacerait cette mesure en
  # silence — la fonction traite absent et vide de la même façon, donc les deux cas resteraient
  # verts par le même chemin et celui de compatibilité cesserait d'exister.
  if [ $# -ge 6 ]; then real="$(veredito_rede_do_proxy "${3:-}" "${4:-}" "${5:-}" "$6")"
  else                  real="$(veredito_rede_do_proxy "${3:-}" "${4:-}" "${5:-}")"; fi
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (a donné %s, attendait %s)\n' "$desc" "$real" "$esperado"; fail=1; fi
}
vr_ok "bridge existant → continue"               ok            bridge  coolify    crm_proxy
# Sans ce cas la NOUVELLE installation en mode host meurt : le bridge du projet n'existe
# pas encore (c'est cet installateur qui le crée), et refuser ici ne laisserait installer
# que qui avait déjà installé.
vr_ok "le bridge du PROJET n'existe pas encore → crée" criar    ""      crm_proxy  crm_proxy
vr_ok "réseau d'un autre qui n'existe pas → meurt" inexistente  ""      coolify    crm_proxy
# TRAEFIK_NETWORK=host écrit à la main : il existe, mais n'accepte pas de conteneur de bridge.
vr_ok "driver host → meurt"                      driver_errado host    host       crm_proxy
# Appel à 3 arguments EXPRÈS : c'est le point d'appel d'avant l'attachable.
# Sans ce cas, effacer l'`att` de garantir_rede_do_proxy (en laissant la fonction
# intacte et le symbole présent) ne serait attrapé par aucun test.
vr_ok "driver overlay, appel à 3 args → meurt"   driver_errado overlay traefik    crm_proxy
# Sans bridge du projet connu (appel défensif), l'absence redevient une mort.
vr_ok "sans réseau à nous déclaré → n'invente pas" inexistente  ""      crm_proxy  ""

# ── Overlay Swarm ───────────────────────────────────────────────────────────
# Sur un VPS avec Docker Swarm, Traefik vit sur un overlay, et le refus par driver
# tuait l'installation avec « mettez le bon bridge dans TRAEFIK_NETWORK » — instruction
# impossible à suivre, parce que là il n'existe pas de bridge Traefik. Ce qui sépare
# l'overlay qui SERT de celui qui ne sert pas est --attachable : sans lui un conteneur
# compose ordinaire n'entre pas dans le réseau et le `up -d` meurt sur « could not attach to
# network ». C'est pourquoi le verdict lit les DEUX champs, jamais seulement le driver.
#
# Les valeurs ci-dessous sont ce que `docker network inspect -f '{{.Attachable}}'`
# affiche RÉELLEMENT (mesuré avec docker 28.3.2) : `true` ou `false`, en minuscules et
# sans guillemets, et VIDE quand le réseau n'existe pas (alors inspect sort != 0). Un test
# écrit avec "True" ou "1" garderait un format que Docker n'émet pas.
vr_ok "overlay attachable → sert comme bridge"     ok            overlay traefik crm_proxy true
vr_ok "overlay SANS attachable → meurt"            driver_errado overlay traefik crm_proxy false
# Vide est la réponse de qui ne sait pas, pas un « on peut entrer ». Traiter l'absence de
# réponse comme une permission est exactement l'échec-en-vert que ce fichier existe
# pour empêcher.
vr_ok "overlay avec attachable vide → meurt"       driver_errado overlay traefik crm_proxy ""
# L'attachable NE peut PAS devenir le critère unique : le bridge par défaut de Docker et ceux que
# les panneaux créent rapportent Attachable=false (mesuré avec docker 28.3.2, y compris
# sur le réseau `bridge`). L'exiger de tout le monde casserait toute installation avec Traefik
# sur bridge qui fonctionne aujourd'hui — c'est-à-dire la majorité.
vr_ok "bridge avec attachable=false reste ok"      ok            bridge  coolify crm_proxy false
# Et le driver continue de commander : attachable=true sur un réseau `host` ne change pas le fait qu'un
# conteneur de bridge n'y entre pas.
vr_ok "host avec attachable=true continue de mourir" driver_errado host  host    crm_proxy true

echo "proxy inverse : le POINT D'APPEL demande l'attachable à Docker"
# Garder la fonction ne garde pas la correction. Effacer l'`att=` et le 4e argument de
# `garantir_rede_do_proxy` laisse `veredito_rede_do_proxy` intacte, le symbole
# présent et tout grep vert — et le VPS avec Swarm recommence à mourir, dans l'update.sh
# qu'agent.sh lance tout seul toutes les 5 minutes, sans personne qui lit l'écran. C'est le
# point d'appel qui a besoin de filet, et ici _common.sh tourne pour de vrai contre une
# doublure de `docker` qui répond comme répondrait un Swarm.
rede_e2e() {  # rede_e2e <description> <segue|morre> <driver> <attachable>
  local desc="$1" esperado="$2" drv="$3" att="$4" dir real perguntou kit="$PWD"
  dir="$(mktemp -d)"; mkdir -p "$dir/bin"
  cat > "$dir/bin/docker" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$dir/chamadas.log"
if [ "\$1" = network ] && [ "\$2" = inspect ]; then
  case "\$*" in
    *Driver*)     printf '$drv\n'; exit 0 ;;
    *Attachable*) printf '$att\n'; exit 0 ;;
  esac
fi
exit 0
STUB
  chmod +x "$dir/bin/docker"
  # Le kit est capturé AVANT le cd : dans le sous-shell le \$PWD est déjà le temporaire,
  # et _common.sh ne serait pas trouvé — le test « mourrait » faute de trouver le
  # fichier, indiscernable d'un refus légitime.
  if (cd "$dir" && env PATH="$dir/bin:$PATH" REVERSE_PROXY=traefik \
        TRAEFIK_NETWORK=traefik PROJECT_DIR="$dir" \
        bash -c '. "$1/_common.sh"; garantir_rede_do_proxy' _ "$kit") >/dev/null 2>&1
  then real=segue; else real=morre; fi
  # Vacuité : « continue » ne veut dire quelque chose que si le point d'appel A
  # demandé l'attachable à Docker. Sans cette vérification, un point d'appel qui cesserait de
  # demander — et un verdict qui accepterait l'overlay les yeux fermés — passerait
  # avec la même tête d'approuvé.
  perguntou=nao
  grep -q 'Attachable' "$dir/chamadas.log" 2>/dev/null && perguntou=sim
  rm -rf "$dir"
  if [ "$perguntou" != sim ]; then
    printf '  ✗ %s  (le point d’appel n’a pas demandé l’attachable à Docker)\n' "$desc"; fail=1
  elif [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (a donné %s, attendait %s)\n' "$desc" "$real" "$esperado"; fail=1; fi
}
rede_e2e "overlay attachable : install/update continuent" segue overlay true
rede_e2e "overlay sans attachable : meurt en expliquant"  morre overlay false

echo "proxy inverse : quelle confiance mérite l'élection"
# L'élection par port publié apporte la preuve (la colonne Ports dit ':80->') ; le
# balayage par mode host n'en apporte aucune — en mode host la colonne est vide pour
# TOUS, donc il sait seulement dire « il y a un unique Traefik en mode host ici ».
cf_ok() {  # cf_ok <description> <attendu> <venu du balayage host> <noninteractive>
  local desc="$1" esperado="$2" real
  real="$(confianca_no_dono_das_portas "${3:-}" "${4:-}")"
  if [ "$real" = "$esperado" ]; then printf '  ✓ %s\n' "$desc"
  else printf '  ✗ %s  (a donné %s, attendait %s)\n' "$desc" "$real" "$esperado"; fail=1; fi
}
cf_ok "propriétaire par la colonne Ports → continue (a la preuve)" segue    0 0
cf_ok "propriétaire par la colonne Ports, --yes → continue"        segue    0 1
cf_ok "élu par le balayage host, interactif → demande"             pergunta 1 0
cf_ok "élu par le balayage host, --yes → refuse"                   recusa   1 1

# ── Fixture de VPS : les scripts du kit tournent POUR DE VRAI contre des doublures ──
# Les blocs unitaires ci-dessus gardent les FONCTIONS ; ceux d'intégration ci-dessous gardent
# le CHEMIN ENTIER, qui est là où cette correction a déjà échoué une fois. La branche du mode
# host a été écrite en étant INATTEIGNABLE : elle dépendait de `traefik_container`,
# affecté seulement quand le propriétaire des ports était identifié par la colonne Ports —
# vide en mode host. Les fonctions restaient correctes et le VPS continuait de mourir sur le
# panneau « port 80 déjà occupé ».
#
# Il y a trois VPS différents à partir d'ici, et ce qui change entre eux c'est SEULEMENT la doublure
# de `docker`. Curl, crontab et .env sont les mêmes : une copie par scénario serait
# une copie qui vieillirait seule.
#
# .env complet pour le mode --yes : ce qui intéresse ici est le proxy, et les autres
# réponses n'ont qu'à passer les validateurs. REVERSE_PROXY et TRAEFIK_NETWORK
# restent DEHORS — c'est justement ce que l'installateur décide. Il faut réécrire
# à chaque tour : install.sh lui-même réécrit les deux dans le .env, et le second
# tour ne déciderait plus rien.
BASE_ENV="DOMAIN='crm.exemple.cm'
ACME_EMAIL='moi@exemple.cm'
NEON_DATA_API_URL='https://abcdefghijklmnop.supabase.co'
NEON_TEST_JWT='$(mkjwt anon abcdefghijklmnop)'
NEON_SERVICE_ROLE_JWT='$(mkjwt service_role abcdefghijklmnop)'
NEON_DATABASE_URL='postgresql://postgres.abcdefghijklmnop:motdepasse@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
ANTHROPIC_API_KEY='sk-ant-teste'
OWNER_EMAIL='moi@exemple.cm'
OWNER_PASSWORD='motdepasse12345'"

# montar_vps <racine> <dossier du projet>   < corps de la doublure de `docker`
# Définit VPS_RAIZ / VPS_PROJ / VPS_LOG pour le `rodar` juste en dessous.
montar_vps() {
  local raiz="$1" pasta="$2"
  VPS_RAIZ="$raiz"; VPS_PROJ="$raiz/$pasta"; VPS_LOG="$raiz/docker.log"
  mkdir -p "$raiz/bin" "$VPS_PROJ"
  cp install.sh update.sh backup.sh _common.sh "$raiz/"
  : > "$VPS_PROJ/docker-compose.prod.yml"
  cat > "$raiz/bin/docker"
  # Seul v_supabase_url exige une réponse en ligne (000 recale) ; les autres tolèrent.
  #
  # La doublure parle DEUX protocoles parce qu'install.sh s'est mis à sonder GHCR
  # avant d'épingler les images (`ghcr_status`/`trio_publicado` dans _common.sh) : l'
  # endpoint de jeton renvoie du JSON, celui du manifest renvoie le code HTTP. Une
  # doublure qui répondrait `200` à tout ferait sortir vide le `sed` du jeton, la
  # sonde renverrait `000`, et la suite se mettrait à exercer la branche de repli
  # en croyant exercer la normale — vert en mesurant autre chose.
  #
  # `DUBLE_GHCR` permet au test de choisir le scénario : vide/`200` = les trois
  # images publiées ; `403` = paquet privé ; `404` = n'existe pas.
  cat > "$raiz/bin/curl" <<'STUBCURL'
#!/usr/bin/env bash
case "$*" in
  *ghcr.io/token*) printf '{"token":"dublê"}' ;;
  *ghcr.io/v2/*)   printf '%s' "${DUBLE_GHCR:-200}" ;;
  *)               printf 200 ;;
esac
STUBCURL
  # install.sh et update.sh vont jusqu'au bout, et au bout ils PLANIFIENT LE CRON. Sans
  # doublure la suite écrirait dans le crontab de qui la lance — en pointant vers un
  # répertoire temporaire qu'elle efface elle-même ensuite. Un test qui salit la machine
  # du développeur est un défaut du test ; mesuré : 10 lignes orphelines dans le crontab du
  # mainteneur, l'une d'elles un `curl` avec Bearer frappant une URL d'exemple chaque
  # minute.
  #
  # La doublure imite le vrai crontab au lieu de tout avaler. La version précédente
  # était `cat >/dev/null` INCONDITIONNEL, et cela BLOQUAIT LA SUITE POUR TOUJOURS : le
  # _common.sh fait `crontab -l | grep -qF ...`, le `cat` de la doublure restait à lire le
  # stdin hérité du processus — dans un terminal, le tty, qui ne donne jamais EOF — et le
  # `grep` de l'autre côté attendait une fin qui ne venait pas. Mesuré : avec stdin sur le tty,
  # tuée à coups de marteau après 90 s dans une suite qui tourne entièrement en moins que ça ;
  # avec `< /dev/null`, elle passait. Une doublure ne peut consommer stdin que là où la commande
  # réelle le consommerait : `crontab -` et `crontab <fichier>`, jamais `crontab -l`.
  cat > "$raiz/bin/crontab" <<'STUB'
#!/usr/bin/env bash
: "${CRONTAB_SANDBOX:?doublure de crontab sans bac à sable — je ne touche pas au vrai crontab}"
# Remplacement ATOMIQUE, comme le vrai crontab (écrit un temporaire et le
# renomme sur le spool). Sans cela la doublure ment sur un point qui compte : le kit
# fait `crontab -l | ... | crontab -`, les deux côtés du tuyau tournent en même temps,
# et un `cat > fichier` tronquait le fichier que le lecteur était encore en train de lire. Le
# merge recevait un crontab vide et chaque écriture effaçait la ligne de la précédente —
# la suite « isolait » bien et mesurait peu.
grava() { cat > "$CRONTAB_SANDBOX.novo" && mv "$CRONTAB_SANDBOX.novo" "$CRONTAB_SANDBOX"; }
case "${1:-}" in
  -l) [ -f "$CRONTAB_SANDBOX" ] || { printf 'no crontab for %s\n' "$(id -un)" >&2; exit 1; }
      cat "$CRONTAB_SANDBOX" ;;
  -r) rm -f "$CRONTAB_SANDBOX" ;;
  -)  grava ;;
  -*) ;;                                # option que le kit n'utilise pas : rien à faire
  *)  [ -n "${1:-}" ] && grava < "$1" ;;
esac
exit 0
STUB
  chmod +x "$raiz/bin/docker" "$raiz/bin/curl" "$raiz/bin/crontab"
}

# rodar <script> <options> [ligne de .env supplémentaire] [réponses du mode interactif]
#   → renvoie la sortie sans ANSI, en vidant le journal docker avant.
#
# Sans réponses le stdin est CELUI DE LA SUITE, exprès : un `< /dev/null` ici
# cacherait le blocage que la doublure de crontab ci-dessus existe pour éviter (c'était
# `cat >/dev/null` inconditionnel, et sur un tty la suite ne finissait jamais). Avec
# des réponses, lit depuis un fichier — c'est la seule façon d'exercer une QUESTION.
# `NEON_MANAGEMENT_TOKEN=` dans l'`env` : install.sh appelle marca-emails.sh, et un
# jeton EXPORTÉ dans le shell de qui lance la suite entrerait dans le scénario sans que personne ne
# l'ait demandé — le test se mettrait à dépendre de la machine, et ferait un appel réseau à
# partir d'un .env factice. Le scénario déclare son propre environnement.
rodar() {
  local script="$1" flags="$2"
  printf '%s\n%s\n' "$BASE_ENV" "${3-}" > "$VPS_PROJ/.env"
  : > "$VPS_LOG"
  if [ $# -ge 4 ]; then
    printf '%s' "$4" > "$VPS_RAIZ/respostas.txt"
    (cd "$VPS_PROJ" && env PATH="$VPS_RAIZ/bin:$PATH" DOCKER_LOG="$VPS_LOG" CRONTAB_SANDBOX="$CRONTAB_SANDBOX" \
      NEON_MANAGEMENT_TOKEN= \
      bash "$VPS_RAIZ/$script" $flags <"$VPS_RAIZ/respostas.txt" 2>&1 || true) | sed -E 's/\x1b\[[0-9;]*m//g'
  else
    (cd "$VPS_PROJ" && env PATH="$VPS_RAIZ/bin:$PATH" DOCKER_LOG="$VPS_LOG" CRONTAB_SANDBOX="$CRONTAB_SANDBOX" \
      NEON_MANAGEMENT_TOKEN= \
      bash "$VPS_RAIZ/$script" $flags 2>&1 || true) | sed -E 's/\x1b\[[0-9;]*m//g'
  fi
}
# Vacuité, utilisée à chaque tour d'install.sh : sans cela, un install.sh qui
# mourrait AVANT la détection (doublure incomplète, refactor déplaçant le bloc)
# passerait — l'absence du panneau de blocage serait lue comme une approbation. Le
# marqueur est la MÉCANIQUE, pas une phrase : le test de bind est la porte d'entrée.
chegou_na_deteccao() {
  grep -q -- '-p 80:80' "$VPS_LOG" && return 0
  printf '  ✗ install.sh n’est pas arrivé à tester le port 80 — test non concluant, pas vert\n'
  return 1
}
# Les RÉPONSES du mode interactif, dans l'ordre où l'installateur demande : le
# proxy (ce qui est testé ici), puis les 7 champs que BASE_ENV laisse vides
# exprès (APP_IMAGE, OPENAI_API_KEY, APP_NAME, APP_ACCENT_HEX, SUPPORT_EMAIL,
# RESEND_API_KEY, RESEND_FROM_EMAIL — tous avec Entrée), l'écran de vérification,
# la télémétrie et l'avertissement DNS ('c' = continuer quand même).
# Les réponses qui viennent APRÈS celle du proxy inverse, dans l'ordre où install.sh
# les consomme. C'est une file positionnelle : une nouvelle question au milieu du script décale
# tout ce qui suit, et le symptôme NE pointe PAS ici — le scénario n'arrive simplement
# pas où il l'attendait et échoue sous un autre nom (mesuré : la question de quelle
# IA va répondre, dans `install.sh:916`, a fait tomber le cas TRAEFIK_NETWORK).
#
# Le premier `\n` est le « Entrée = défaut » d'`escolher_provedor` (install.sh:916),
# qui tourne après la question du proxy (:768) et avant l'entretien (:975).
# Qui ajoute une question interactive à install.sh ajoute la réponse ici,
# à la même position relative.
#
# Nombre d'Entrée avant le 'c', mesuré avec
#   eval "$(grep -m1 '^RESTO_DAS_PERGUNTAS=' test-validators.sh)"
#   printf '%s' "${RESTO_DAS_PERGUNTAS%%c*}" | grep -c ''
# → c'était 9 avant qu'APP_ACCENT_HEX n'entre dans FIELDS, c'est 10 maintenant.
RESTO_DAS_PERGUNTAS=$'\n\n\n\n\n\n\n\n\n\nc\n'

# La position de la couleur DANS la file ci-dessus — le fournisseur est la 1re réponse, puis viennent
# APP_IMAGE, APP_NAME et elle est la 4e : la clé Anthropic existe déjà dans BASE_ENV, donc
# il n'y a pas de question pour elle. Reste dans une variable parce que la file avec la couleur RÉPONDUE
# (ci-dessous) est DÉRIVÉE de celle du dessus au lieu d'être copiée : deux files positionnelles
# maintenues à la main se désynchronisent au premier nouveau champ, et alors l'une passe et l'autre
# échoue sous un nom qui n'est pas le sien.
POSICAO_DA_COR=4
COR_DE_TESTE='#f2c94c'
# fila_com <file> <position> <valeur> → la même file, avec une réponse à la place d'un
# Entrée. `awk` parce que la substitution se fait par NUMÉRO DE LIGNE : un `sed s///`
# correspondrait à la première ligne vide, qui est une autre question.
fila_com() { printf '%s' "$1" | awk -v n="$2" -v v="$3" 'NR==n{print v; next} {print}'; }

echo "intégration : NOUVELLE installation sur un VPS PROPRE (le chemin Caddy)"
# Le chemin le plus parcouru de tous — VPS nu, ports libres, le kit démarre son
# propre Caddy — et celui qui apparaissait le moins ici : les scénarios de proxy externe sont
# les intéressants, donc l'intégration ne couvrait qu'eux. Un chemin sans test est un
# chemin où un refactor de proxy casse l'installation COURANTE sans que personne ne le voie :
# `set -u` est activé, et il suffit qu'une variable du bloc Traefik cesse de recevoir une
# valeur par défaut pour que le VPS propre meure sur « unbound variable » au moment d'écrire le
# .env — avec toutes les assertions Traefik vertes.
TMP3B="$(mktemp -d)"
(
  montar_vps "$TMP3B" "crmlimpa" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
esac
# VPS nu : le bind de test PASSE (personne sur les ports) et il n'y a aucun conteneur.
exit 0
STUB
  saida="$(rodar install.sh --yes)"
  chegou_na_deteccao || exit 1
  if ! grep -qx 'REVERSE_PROXY="caddy"' "$VPS_PROJ/.env"; then
    printf '  ✗ le VPS propre n’a pas choisi Caddy : %s\n' \
      "$(grep -E '^REVERSE_PROXY=' "$VPS_PROJ/.env" || echo '(absent)')"; exit 1
  fi
  # Le .env entier sort d'un `{ … } > .env` : une variable sans défaut interrompt le
  # bloc au milieu et le fichier reste À MOITIÉ — REVERSE_PROXY (ligne du début)
  # présent, et rien du reste. C'est pourquoi l'assertion regarde la DERNIÈRE ligne du bloc,
  # pas le message d'erreur : `set -u` parle la langue du shell de qui lance
  # (« unbound variable » ici, « variable sans liaison » dans un shell en français), et un
  # test lié à un texte système passe en silence sur la mauvaise machine.
  if ! grep -qE '^OWNER_PASSWORD="' "$VPS_PROJ/.env"; then
    printf '  ✗ le .env est sorti à moitié (arrêté avant la dernière ligne du bloc)\n'
    printf '     dernières clés écrites : %s\n' \
      "$(grep -oE '^[A-Z_]+=' "$VPS_PROJ/.env" | tail -3 | tr '\n' ' ')"; exit 1
  fi
  printf '  ✓ ports libres → Caddy, et le .env sort entier même sans proxy externe\n'

  # `--yes` ne demande rien, et un champ sans défaut et sans `opcional` meurt dans
  # `die` — la ligne ci-dessus le prouverait déjà à moitié (le .env sortirait tronqué).
  # Ce que CETTE assertion ajoute, c'est la différence entre ABSENTE et DÉCLARÉE ET
  # VIDE, que `valor_no_env` ne voit pas : `lib/branding/resolve.ts:416` appelle la
  # clé vide « état d'usine d'install.sh » et traite la couche comme
  # silencieuse sur la couleur. Une clé absente est la même chose pour le résolveur, mais
  # pas pour qui ouvre le .env en cherchant où changer la couleur.
  if ! grep -qE '^APP_ACCENT_HEX=' "$VPS_PROJ/.env"; then
    printf '  ✗ en --yes APP_ACCENT_HEX n’est même pas apparu dans le .env (attendu : déclarée et vide)\n'; exit 1
  fi
  if [ -n "$(valor_no_env "$VPS_PROJ/.env" APP_ACCENT_HEX)" ]; then
    printf '  ✗ en --yes APP_ACCENT_HEX est venue avec une valeur : [%s] — personne n’a rien répondu\n' \
      "$(valor_no_env "$VPS_PROJ/.env" APP_ACCENT_HEX)"; exit 1
  fi
  printf '  ✓ en --yes la couleur sort DÉCLARÉE et vide (l’« état d’usine » de resolve.ts)\n'

  # ── La règle d'or de la doctrine de packaging, là où elle s'applique ───────
  # Une nouvelle installation écrivait `APP_IMAGE=…:latest`, et `latest` ici signifie
  # SOMMET DE MAIN (le canal suit la branche par défaut), pas la dernière
  # release. Deux installations faites à des semaines d'écart faisaient tourner du code
  # différent, toutes deux disant « je suis sur latest » — et l'issue #184 est arrivée avec l'
  # environnement décrit comme « latest du 06/08/2026 ».
  #
  # Cette preuve existe parce que la précédente n'attrapait rien : j'ai saboté install.sh pour
  # qu'il réécrive `:latest` en dur et toute la suite est passée au vert. La règle la plus
  # importante de la doctrine n'avait aucun contrôle.
  #
  # Note : dans ce fixture le dépôt distant est une doublure sans tags, donc `ultima_versao_publicada`
  # renvoie vide et l'installation retombe — exprès — sur le canal mobile. C'est pourquoi
  # l'assertion n'est pas « la tag est 1.2.3 » : c'est que les TROIS images sortent sur la
  # MÊME référence et avec le pull_policy qui lui correspond. C'est l'invariant qui
  # survit aux deux chemins, avec réseau et sans.
  img_app="$(valor_no_env "$VPS_PROJ/.env" APP_IMAGE)"
  tag_app="${img_app##*:}"
  for par in "WORKER_IMAGE:deskcomm-worker" "SCHEDULER_IMAGE:deskcomm-scheduler"; do
    chave="${par%%:*}"; repo="${par##*:}"
    if [ "$(valor_no_env "$VPS_PROJ/.env" "$chave")" != "ghcr.io/melgarafael/${repo}:${tag_app}" ]; then
      printf '  ✗ %s ne suit pas la version de l’app (%s) : %s\n' "$chave" "$tag_app" \
        "$(grep -E "^${chave}=" "$VPS_PROJ/.env" || echo '(absent)')"
      printf '     l’app sur une version et le worker sur une autre, c’est la matrice que personne n’a testée.\n'; exit 1
    fi
  done
  case "$tag_app" in
    latest|main|stable) esperado="always" ;;
    *)                  esperado="missing" ;;
  esac
  for chave in APP_PULL_POLICY WORKER_PULL_POLICY SCHEDULER_PULL_POLICY; do
    if [ "$(valor_no_env "$VPS_PROJ/.env" "$chave")" != "$esperado" ]; then
      printf '  ✗ %s devait être %s pour la tag %s : %s\n' "$chave" "$esperado" "$tag_app" \
        "$(grep -E "^${chave}=" "$VPS_PROJ/.env" || echo '(absent)')"; exit 1
    fi
  done
  printf '  ✓ les trois images sortent sur la MÊME référence (%s), avec pull_policy=%s\n' "$tag_app" "$esperado"

  # Le .env l'EMPORTE sur le compose — et c'est pourquoi ce bloc existe. Le compose
  # épinglait déjà WAHA, et l'installation écrivait `WAHA_IMAGE=devlikeapro/waha` (sans tag,
  # c'est-à-dire `:latest`) par-dessus : l'épinglage existait et n'atteignait personne. Un contrôle
  # qui ne regarde que le compose donne du vert à toute cette classe de défaut, et c'est
  # un sabotage qui a révélé l'angle mort.
  img_waha="$(grep -E '^WAHA_IMAGE=' "$VPS_PROJ/.env" | head -1 | cut -d= -f2- | tr -d "'\"")"
  ref_waha="${img_waha##*/}"
  case "$ref_waha" in
    *:*) tag_waha="${ref_waha##*:}" ;;
    *)   tag_waha="latest" ;;   # une image sans ':' est :latest par définition de Docker
  esac
  if [ -z "$img_waha" ] || [ "$tag_waha" = "latest" ]; then
    printf '  ✗ WAHA écrit sans épinglage dans le .env : %s (tag résolue : %s)\n' "${img_waha:-(absent)}" "$tag_waha"
    printf '     sans tag = :latest, et le `dc pull` de chaque mise à jour livre au client n’importe quelle\n'
    printf '     version que l’amont publie — sans que personne ne l’ait testée.\n'; exit 1
  fi
  printf '  ✓ WAHA sort épinglé dans le .env (%s), pas en :latest\n' "$img_waha"

  # ── La couleur de la marque sort de l'ENTRETIEN et arrive au .env ──────────
  # C'est le cas qui prouve le défaut que l'épopée de la marque avait laissé ouvert : le
  # revendeur mettait son nom et recevait le VERT DU PRODUIT dans chaque e-mail
  # d'accès, parce qu'`install.sh` ne demandait ni n'écrivait jamais `APP_ACCENT_HEX`
  # (mesuré dans `c8fc877d` : `grep -c APP_ACCENT_HEX install.sh` → 0).
  #
  # Doit être INTERACTIF, et sur un `.env` qui N'apporte PAS la clé. Deux pièges du
  # kit lui-même rendent tout raccourci vide :
  #   1. `ask_one` revient dès la première ligne si la variable a déjà une valeur, et le
  #      `load_env .env` d'`install.sh:757` tourne AVANT l'entretien — semer le .env
  #      ferait passer le test sans que la question n'ait jamais existé ;
  #   2. tant que la clé était hors de la liste d'`envq`, elle était aussi hors
  #      de `CONHECIDAS`, donc une valeur mise à la main revenait par la boucle de
  #      PRÉSERVATION — vert en mesurant la préservation, pas l'entretien.
  # Avec l'entretien qui répond et le .env qui naît sans la clé, le seul chemin
  # qui reproduit la valeur est `FIELDS` + `envq`, les deux.
  saida="$(rodar install.sh "" "" "$(fila_com "$RESTO_DAS_PERGUNTAS" "$POSICAO_DA_COR" "$COR_DE_TESTE")")"
  chegou_na_deteccao || exit 1
  cor_gravada="$(valor_no_env "$VPS_PROJ/.env" APP_ACCENT_HEX)"
  if [ "$cor_gravada" != "$COR_DE_TESTE" ]; then
    printf '  ✗ la couleur répondue dans l’entretien n’est pas arrivée au .env : [%s]\n' "$cor_gravada"
    # Les deux moitiés échouent avec la MÊME tête — mesuré en sabotant chacune : sans l'
    # `envq` la réponse est récoltée et jetée ; sans le champ dans `FIELDS` la
    # question n'a même pas lieu et le `#f2c94c` tombe dans le champ suivant. Le lecteur a besoin
    # des deux bouts, sinon il corrige celui qui était déjà correct.
    printf '     attendait [%s]. Ce sont deux points, et le symptôme est le même dans les deux :\n' "$COR_DE_TESTE"
    printf '       (a) le champ APP_ACCENT_HEX dans FIELDS — sans lui la question n’existe pas ;\n'
    printf '       (b) l’`envq APP_ACCENT_HEX` dans le bloc qui se termine par `} > .env` — il TRONQUE\n'
    printf '           à partir de la liste d’envq, donc répondre sans écrire perd la réponse.\n'
    printf '     dernières clés écrites : %s\n' \
      "$(grep -oE '^[A-Z_]+=' "$VPS_PROJ/.env" | tail -5 | tr '\n' ' ')"; exit 1
  fi
  # Vacuité de la file : si la question de la couleur était sortie de FIELDS, la réponse
  # `#f2c94c` tomberait dans le champ suivant (SUPPORT_EMAIL, avec v_email) et
  # l'installateur rejetterait — toute la file déraille à partir de là. Sans cette
  # assertion le cas ci-dessus passerait encore par la boucle de préservation sur un .env que
  # quelqu'un viendrait semer.
  if [ "$(valor_no_env "$VPS_PROJ/.env" SUPPORT_EMAIL)" != "" ]; then
    printf '  ✗ la file des réponses a déraillé : SUPPORT_EMAIL est resté [%s], il devait être vide\n' \
      "$(valor_no_env "$VPS_PROJ/.env" SUPPORT_EMAIL)"; exit 1
  fi
  printf '  ✓ la couleur répondue dans l’entretien (%s) arrive au .env, et la file n’a pas déraillé\n' "$COR_DE_TESTE"
) || fail=1
rm -rf "$TMP3B"

echo "packaging : l'installation résout la dernière version publiée"
# L'autre face de la règle d'or : avec un dépôt distant qui A des tags, l'installation doit
# choisir la plus grande — et non la première qui apparaît. `git ls-remote` renvoie par
# ordre alphabétique de ref, où "v1.10.0" vient AVANT "v1.9.0" ; sans le
# `--sort=-v:refname` l'installation naîtrait sur une vieille version en croyant que c'est la
# nouvelle. C'est le type d'erreur qui n'apparaît qu'à la dixième release.
(
  # `ultima_versao_publicada` est déjà dans la portée : le préambule de cette suite fait
  # `. ./_common.sh`. Sourcer de nouveau dans un sous-shell qui change de
  # répertoire, c'est comme ça que la première version de ceci a cassé.
  repo_falso="$(mktemp -d)"
  git init --quiet --bare "$repo_falso/origem.git"
  trabalho="$(mktemp -d)"
  git clone --quiet "$repo_falso/origem.git" "$trabalho/w" 2>/dev/null
  (
    cd "$trabalho/w" || exit 1
    git config user.email t@t; git config user.name t
    echo x > a; git add -A; git commit --quiet -m init
    for t in v1.0.0 v1.9.0 v1.10.0 v1.2.0; do git tag "$t"; done
    git push --quiet origin HEAD --tags 2>/dev/null
  )

  achou="$(ultima_versao_publicada "$repo_falso/origem.git")"
  if [ "$achou" != "1.10.0" ]; then
    printf '  ✗ a choisi la mauvaise version : attendu 1.10.0, reçu "%s"\n' "$achou"
    printf '     (l’ordre alphabétique met v1.9.0 après v1.10.0 — il faut --sort=-v:refname)\n'
    rm -rf "$repo_falso" "$trabalho"; exit 1
  fi
  printf '  ✓ entre v1.0.0/v1.2.0/v1.9.0/v1.10.0, choisit 1.10.0 (ordre de VERSION, pas alphabétique)\n'

  vazio="$(mktemp -d)"; git init --quiet --bare "$vazio/sem-tags.git"
  semtag="$(ultima_versao_publicada "$vazio/sem-tags.git")"
  if [ -n "$semtag" ]; then
    printf '  ✗ un dépôt distant sans tag devait renvoyer vide, reçu "%s"\n' "$semtag"
    rm -rf "$repo_falso" "$trabalho" "$vazio"; exit 1
  fi
  printf '  ✓ un dépôt distant sans aucune tag renvoie vide (l’installation retombe sur le canal mobile et avertit)\n'
  rm -rf "$repo_falso" "$trabalho" "$vazio"
) || fail=1

echo "packaging : l'installation ÉCRIT la version résolue (pas seulement elle la connaît)"
# La preuve ci-dessus montre que la fonction choisit bien ; celle-ci montre qu'install.sh
# l'UTILISE. Ce sont des choses différentes, et la différence n'est pas académique : j'ai saboté l'installation
# pour qu'elle réécrive `:latest` en dur et TOUTE la suite est passée au vert, parce que rien
# ne reliait la fonction au fichier que reçoit le client.
#
# Hors ligne exprès : REPO_URL pointe vers un dépôt local avec des tags
# connues, donc l'assertion est exacte (1.10.0) et ne dépend pas de ce que la CI atteigne
# GitHub. Un test qui a besoin du réseau pour prouver l'épinglage échoue pour la mauvaise
# raison le jour où le réseau oscille.
TMP_PIN="$(mktemp -d)"
(
  origem="$TMP_PIN/origem.git"
  git init --quiet --bare "$origem"
  (
    cd "$TMP_PIN" || exit 1
    git clone --quiet "$origem" w 2>/dev/null
    cd w || exit 1
    git config user.email t@t; git config user.name t
    echo x > a; git add -A; git commit --quiet -m init
    for t in v1.0.0 v1.9.0 v1.10.0; do git tag "$t"; done
    git push --quiet origin HEAD --tags 2>/dev/null
  )

  montar_vps "$TMP_PIN/vps" "crmpin" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
esac
exit 0
STUB
  export REPO_URL="$origem"
  rodar install.sh --yes >/dev/null
  unset REPO_URL

  for par in "APP_IMAGE:deskcommcrm" "WORKER_IMAGE:deskcomm-worker" "SCHEDULER_IMAGE:deskcomm-scheduler"; do
    chave="${par%%:*}"; repo="${par##*:}"
    if [ "$(valor_no_env "$VPS_PROJ/.env" "$chave")" != "ghcr.io/melgarafael/${repo}:1.10.0" ]; then
      printf '  ✗ %s n’a pas été épinglée sur la version résolue (1.10.0) : %s\n' "$chave" \
        "$(grep -E "^${chave}=" "$VPS_PROJ/.env" || echo '(absent)')"
      printf '     une installation client ne naît JAMAIS sur une tag mobile — docs/doctrine/packaging.md, invariant 3.\n'
      exit 1
    fi
  done
  if [ "$(valor_no_env "$VPS_PROJ/.env" APP_PULL_POLICY)" = "always" ]; then
    printf '  ✗ tag immuable avec pull_policy=always : le CRM ne démarre que si GHCR est debout\n'; exit 1
  fi
  printf '  ✓ avec v1.0.0/v1.9.0/v1.10.0 sur le dépôt distant, le .env naît épinglé sur 1.10.0 (les trois images)\n'
) || fail=1
rm -rf "$TMP_PIN"

echo "packaging : la tag git ne suffit pas — les images doivent exister"
# La tag naît quelques minutes avant les images, et celles du worker/scheduler n'ont commencé à
# exister qu'après les releases déjà publiées : `deskcomm-worker:1.2.1`
# n'existera jamais, parce que la v1.2.1 appartient au passé. Sans sonder le registre, le .env du
# client recevrait des références impossibles et le kit les construirait ici EN
# SILENCE, depuis le sommet de main — l'app d'une release, le worker d'un autre code.
#
# 403 est le cas qui bloque au lancement d'une nouvelle image : un paquet fraîchement créé sur
# GHCR naît privé, et un dépôt public n'y change rien.
TMP_PRIV="$(mktemp -d)"
(
  montar_vps "$TMP_PRIV/vps" "crmpriv" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
esac
exit 0
STUB
  export DUBLE_GHCR=403          # le paquet existe mais est PRIVÉ
  saida="$(rodar install.sh --yes)"
  unset DUBLE_GHCR

  if ! printf '%s' "$saida" | grep -q "construites sur ce serveur"; then
    printf '  ✗ avec les images injoignables, l’installateur n’a pas averti qu’il allait construire ici\n'
    printf '     le silence ici est le défaut : le propriétaire ne découvre pas que deux pièces sont sorties des sources locales.\n'
    exit 1
  fi
  printf '  ✓ images injoignables (403) : avertit qu’il va construire sur le serveur, au lieu de se taire\n'

  # Et l'installation se TERMINE quand même — construire est lent, ce n'est pas un empêchement.
  if ! grep -qE "^APP_IMAGE=" "$VPS_PROJ/.env"; then
    printf '  ✗ l’installation n’est pas arrivée à écrire le .env\n'; exit 1
  fi
  printf '  ✓ et termine quand même l’installation (construire est lent, ce n’est pas un empêchement)\n'
) || fail=1
rm -rf "$TMP_PRIV"

echo "intégration : les TROIS fournisseurs d'IA que propose l'installateur"
# La question « quelle IA va répondre » a trois réponses, et jusqu'ici une seule d'entre elles
# était exercée : tout scénario de cette suite répond Entrée, et Entrée c'est [2]
# Anthropic. Les deux autres étaient cassées, chacune à sa façon, et la suite
# entière restait verte :
#
#   [1] OpenRouter → `v_openrouter` était déclarée comme validateur du champ et
#       jamais définie. `ask_one` appelle le validateur par son NOM, donc le nom
#       inexistant devient exit 127 : en mode interactif la boucle répète la question
#       à l'infini, et en `--yes` cela devient « OPENROUTER_API_KEY invalide / corrigez le
#       .env » avec le bon .env.
#   [3] OpenAI    → qui choisit OpenAI ne passe jamais par le champ Anthropic, et
#       le bloc qui écrit le .env faisait `envq ANTHROPIC_API_KEY
#       "$ANTHROPIC_API_KEY"` sans défaut. Sous `set -u` cela interrompt le `{ … } >
#       .env` au milieu : fichier à moitié, installation sans moyen de continuer.
#
# Le chemin mesuré est `--yes`, parce que c'est celui qu'utilisent `update.sh` et la 2e exécution,
# et parce que le choix y vient du .env — c'est ainsi qu'une installation qui
# existe déjà arrive ici. L'assertion est la MÊME que pour les autres tours : la dernière ligne du
# bloc doit être présente, sinon le .env est sorti à moitié.
provedor_ok() {  # provedor_ok <description> <VAR de la clé> <valeur> <AI_PROVIDER attendu>
  local desc="$1" var="$2" val="$3" esperado="$4" raiz env_ia
  raiz="$(mktemp -d)"
  (
    montar_vps "$raiz" "crmia" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
esac
exit 0
STUB
    # Le .env de qui a choisi CE fournisseur : sa clé, et AUCUNE autre. C'est tout
    # l'intérêt — un .env avec les trois clés cacherait les deux défauts.
    env_ia="$(printf '%s\n' "$BASE_ENV" | grep -v '^ANTHROPIC_API_KEY=')"
    printf '%s\n%s=%s\n' "$env_ia" "$var" "'$val'" > "$raiz/crmia/.env"
    : > "$raiz/docker.log"
    saida="$(cd "$raiz/crmia" && env PATH="$raiz/bin:$PATH" DOCKER_LOG="$raiz/docker.log" \
      CRONTAB_SANDBOX="$CRONTAB_SANDBOX" bash "$raiz/install.sh" --yes 2>&1 || true \
      | sed -E 's/\x1b\[[0-9;]*m//g')"
    if printf '%s' "$saida" | grep -q 'commande introuvable\|command not found'; then
      printf '  ✗ %s — l’installateur a appelé une commande qui n’existe pas :\n' "$desc"
      printf '%s\n' "$saida" | grep 'commande introuvable\|command not found' | head -2 | sed 's/^/       /'
      exit 1
    fi
    if ! grep -qE '^OWNER_PASSWORD="' "$raiz/crmia/.env"; then
      printf '  ✗ %s — le .env est sorti à moitié (arrêté avant la dernière ligne du bloc)\n' "$desc"
      printf '     dernières clés écrites : %s\n' \
        "$(grep -oE '^[A-Z_]+=' "$raiz/crmia/.env" | tail -3 | tr '\n' ' ')"
      exit 1
    fi
    # Le choix doit SURVIVRE dans le .env, sinon la 2e exécution le redevine —
    # et redeviner, c'est comme ça qu'une installation uniquement OpenRouter se retrouve traitée
    # comme Anthropic.
    if ! grep -qx "AI_PROVIDER=\"$esperado\"" "$raiz/crmia/.env"; then
      printf '  ✗ %s — AI_PROVIDER n’a pas été écrit comme %s : %s\n' "$desc" "$esperado" \
        "$(grep -E '^AI_PROVIDER=' "$raiz/crmia/.env" || echo '(absent)')"
      exit 1
    fi
    # Et la clé que la personne avait reste là, avec sa valeur.
    #
    # Le fixture entre dans l'ANCIEN format (le `"'$val'"` ci-dessus, guillemets simples) et sort
    # d'ici dans le NOUVEAU format : la valeur a traversé le load_env d'un kit à jour
    # lisant le .env d'une vieille installation, ce qui est la route de qui relance
    # install.sh après avoir mis à jour le kit. C'est pourquoi l'assertion compare la VALEUR,
    # et le format d'entrée diffère exprès de celui de sortie.
    if ! grep -qx "$var=\"$val\"" "$raiz/crmia/.env"; then
      printf '  ✗ %s — %s n’a pas survécu : %s\n' "$desc" "$var" \
        "$(grep -E "^$var=" "$raiz/crmia/.env" || echo '(absent)')"
      exit 1
    fi
    printf '  ✓ %s\n' "$desc"
  ) || fail=1
  rm -rf "$raiz"
}
provedor_ok "OpenRouter : installe et le .env sort entier"  OPENROUTER_API_KEY sk-or-v1-teste openrouter
provedor_ok "OpenAI : installe et le .env sort entier"      OPENAI_API_KEY     sk-teste       openai
provedor_ok "Anthropic : installe et le .env sort entier"   ANTHROPIC_API_KEY  sk-ant-teste   anthropic


echo "intégration : NOUVELLE installation sur un VPS avec Traefik en mode host"
# install.sh tourne contre une doublure de `docker` qui imite Hostinger : 80/443
# occupés, PERSONNE ne publie, un Traefik en `--network host`, et le réseau du
# projet n'existe pas encore (c'est une nouvelle installation). Les trois points mesurés avec
# docker 28.3.2 et compose v2.38.2 sont dans les commentaires d'install.sh.
#
# Le dossier a un point et une majuscule exprès : le nom de projet qu'utilise compose
# est `crmhost_teste`, et un `basename` brut ferait créer à l'installateur
# `CRM.Host_Teste_proxy` pendant que compose chercherait un autre réseau.
TMP4="$(mktemp -d)"
(
  montar_vps "$TMP4" "CRM.Host_Teste" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  # `dc exec app node` est la sonde de santé. Sans réponse l'installateur essaie 30
  # fois avec 3 s d'intervalle, et chaque tour de ce test coûterait 90 secondes —
  # une suite lente est une suite que personne ne lance.
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
  # `--entrypoint` n'apparaît que dans porta_publicavel : le bind échoue, 80/443 occupés.
  # Les autres `docker run` (psql du validateur) restent normaux.
  run)     case "$*" in *--entrypoint*) exit 1 ;; esac; exit 0 ;;
  # Personne ne publie de port ; le Traefik n'apparaît qu'en filtrant par réseau host.
  ps)      for a in "$@"; do [ "$a" = "network=host" ] && em_host=1; done
           [ "${em_host:-0}" = 1 ] && printf 'traefik-hostinger|hostinger|traefik:v3.3|\n'; exit 0 ;;
  inspect) case "$*" in *NetworkMode*) printf 'host\n';; *Networks*) printf 'host \n';; esac; exit 0 ;;
  # Nouvelle installation : le réseau du projet N'existe PAS encore.
  network) case "$2" in inspect) exit 1 ;; esac; exit 0 ;;
esac
exit 0
STUB
  LOG="$VPS_LOG"; PROJ="$VPS_PROJ"

  # ── 1) --yes sans REVERSE_PROXY : le balayage TROUVE, mais ne peut pas agir seul ──
  # En mode host Docker n'affiche de port pour PERSONNE, donc « unique Traefik en
  # mode host » ne prouve pas « c'est lui qui tient les ports » : avec un nginx natif
  # tenant 80/443 et un Traefik en mode host servant autre chose, le CRM démarrerait
  # derrière un proxy qui ne répond pas — installation « réussie » et site muet. Sans
  # personne à qui demander, il faut s'arrêter. Et s'arrêter doit être DIFFÉRENT de ne pas
  # trouver : le refus nomme le conteneur trouvé et enseigne l'issue.
  saida="$(rodar install.sh --yes)"
  chegou_na_deteccao || exit 1
  if printf '%s' "$saida" | grep -q 'sont déjà occupés'; then
    printf '  ✗ tombé dans le panneau générique : le balayage en mode host n’a pas trouvé le Traefik\n'
    printf '     %s\n' "$(printf '%s' "$saida" | grep -m1 'sont déjà occupés')"; exit 1
  fi
  if ! printf '%s' "$saida" | grep -q "traefik-hostinger"; then
    printf '  ✗ le refus ne nomme pas le Traefik trouvé — le lecteur ne sait pas quoi confirmer\n'; exit 1
  fi
  if ! printf '%s' "$saida" | grep -q 'REVERSE_PROXY=traefik'; then
    printf '  ✗ le refus n’enseigne pas l’issue (REVERSE_PROXY=traefik dans le .env)\n'; exit 1
  fi
  if grep -qE '^TRAEFIK_NETWORK=' "$PROJ/.env"; then
    printf '  ✗ a refusé mais a agi : a écrit %s dans le .env\n' "$(grep -E '^TRAEFIK_NETWORK=' "$PROJ/.env")"; exit 1
  fi
  printf '  ✓ --yes : trouve le Traefik en mode host et REFUSE en nommant ce qu’il a trouvé\n'

  # ── 2 et 3) interactif : le MÊME VPS, le même .env, seule la réponse change ──
  # La paire est le test. Si l'installateur s'était remis à décider seul par le
  # balayage, les deux côtés donneraient la même issue et l'un d'eux échouerait — impossible
  # de passer les deux sans lire la réponse. C'est pourquoi ici on ne cherche pas le
  # TEXTE de la question : le `read -p` de bash n'affiche l'invite que quand stdin est
  # un terminal, et lier le test à la prose, c'est lier le comportement à la rédaction.
  saida="$(rodar install.sh "" "" "o${RESTO_DAS_PERGUNTAS}")"
  chegou_na_deteccao || exit 1
  if ! printf '%s' "$saida" | grep -q 'traefik-hostinger'; then
    printf '  ✗ l’installateur n’a même pas montré ce qu’il a trouvé avant d’agir\n'; exit 1
  fi
  # Le réseau est EXTERNE dans le compose : s'il n'existe pas, le `up -d` meurt sur « declared as
  # external, but could not be found » — y compris sur une nouvelle installation, ce qui est le
  # normal. Créer est la réponse ; refuser ne laisserait installer que qui a déjà installé.
  if ! grep -qx 'network create crmhost_teste_proxy' "$LOG"; then
    printf '  ✗ le réseau du projet n’a pas été créé — le "up -d" mourrait sur "declared as external"\n'
    printf '     appels réseau vus : %s\n' "$(grep '^network' "$LOG" | tr '\n' ' ')"; exit 1
  fi
  if ! grep -qx 'TRAEFIK_NETWORK="crmhost_teste_proxy"' "$PROJ/.env"; then
    printf '  ✗ TRAEFIK_NETWORK erroné dans le .env : %s\n' "$(grep -E '^TRAEFIK_NETWORK=' "$PROJ/.env" || echo '(absent)')"
    exit 1
  fi
  printf '  ✓ en confirmant "o" : crée le bridge et écrit le réseau avec le nom qu’utilise compose\n'

  saida="$(rodar install.sh "" "" "n${RESTO_DAS_PERGUNTAS}")"
  chegou_na_deteccao || exit 1
  if grep -qx 'network create crmhost_teste_proxy' "$LOG"; then
    printf '  ✗ en répondant "n" l’installateur a continué quand même (a créé le réseau)\n'; exit 1
  fi
  if grep -qE '^TRAEFIK_NETWORK=' "$PROJ/.env"; then
    printf '  ✗ en répondant "n" il a quand même écrit %s dans le .env\n' "$(grep -E '^TRAEFIK_NETWORK=' "$PROJ/.env")"; exit 1
  fi
  printf '  ✓ en répondant "n" : s’arrête, sans écrire aucun proxy\n'

  # ── 4) REVERSE_PROXY=traefik à la main : le choix appartient à qui installe ──
  # C'est le chemin que le panneau de blocage ENSEIGNE — et le plus parcouru de tous.
  # Qui obéit SAUTE toute la détection et mourait plus loin sur « Impossible de
  # découvrir le réseau Docker de votre Traefik », parce que `traefik_container` n'était
  # rempli que dans la branche sautée. L'installateur demandait de faire une
  # chose qu'il ne savait pas lui-même terminer. Ici il n'y a pas de question : la déclaration
  # explicite dans le .env est déjà la réponse, y compris en --yes.
  saida="$(rodar install.sh --yes "REVERSE_PROXY='traefik'")"
  chegou_na_deteccao || exit 1
  if printf '%s' "$saida" | grep -q 'Impossible de découvrir le réseau'; then
    printf '  ✗ avec REVERSE_PROXY=traefik dans le .env l’installateur meurt sans trouver le réseau\n'; exit 1
  fi
  if ! grep -qx 'TRAEFIK_NETWORK="crmhost_teste_proxy"' "$PROJ/.env"; then
    printf '  ✗ REVERSE_PROXY=traefik à la main : TRAEFIK_NETWORK est sorti %s\n' \
      "$(grep -E '^TRAEFIK_NETWORK=' "$PROJ/.env" || echo '(absent)')"; exit 1
  fi
  printf '  ✓ REVERSE_PROXY=traefik écrit à la main trouve aussi le réseau, sans demander\n'
) || fail=1
rm -rf "$TMP4"

echo "intégration : installer depuis une COPIE SŒUR, avec le CRM déjà en ligne (2026-08-24)"
# Les cas de decide_proxy ci-dessus exercent la FONCTION. Celui-ci lance install.sh
# en entier, parce que le vrai défaut peut revenir par deux chemins indépendants : la
# règle (dans decide_proxy) ou le point d'appel (cesser de passer l'arborescence). Un
# test de la seule fonction reste vert pendant que le produit s'installe par-dessus la production.
#
# Le VPS de ce test est celui qui a existé pour de vrai : un DeskcommCRM en ligne dans
# /root/DeskcommCRM (Caddy publiant 80/443, projet `deskcommcrm`), et
# l'installateur lancé depuis UNE AUTRE copie — dont le dossier s'appelle aussi DeskcommCRM,
# donc le projet entre en collision et la version précédente disait « c'est la réexécution, continue ».
TMP_IRMA="$(mktemp -d)"
(
  montar_vps "$TMP_IRMA" "DeskcommCRM" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
  # 80/443 occupés : le bind de test échoue.
  run)     case "$*" in *--entrypoint*) exit 1 ;; esac; exit 0 ;;
  # Le Caddy de l'installation qui est EN LIGNE, avec le MÊME nom de projet.
  ps)      for a in "$@"; do [ "$a" = "network=host" ] && em_host=1; done
           [ "${em_host:-0}" = 1 ] && exit 0
           printf 'deskcommcrm-caddy-1|deskcommcrm|caddy:2-alpine|0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp\n'
           exit 0 ;;
  # L'arborescence qui a engendré ce conteneur — la donnée qui sépare sœur de réexécution.
  inspect) case "$*" in *working_dir*) printf '/root/DeskcommCRM\n' ;; esac; exit 0 ;;
  network) case "$2" in inspect) exit 1 ;; esac; exit 0 ;;
esac
exit 0
STUB
  LOG="$VPS_LOG"; PROJ="$VPS_PROJ"

  saida="$(rodar install.sh --yes)"
  chegou_na_deteccao || exit 1

  # 1. Refus. Le symptôme du défaut était d'installer en silence ; tout ce qui n'est
  #    pas s'arrêter ici, c'est le défaut qui revient.
  if ! printf '%s' "$saida" | grep -q 'Un DeskcommCRM est DÉJÀ EN LIGNE'; then
    printf '  ✗ N’a PAS refusé l’installation par-dessus celle qui est en ligne\n'
    printf '     dernières lignes : %s\n' "$(printf '%s' "$saida" | tail -3 | tr '\n' ' ')"; exit 1
  fi
  # 2. Nomme l'arborescence de l'AUTRE — sans cela le lecteur ne sait pas quel dossier utiliser.
  if ! printf '%s' "$saida" | grep -q '/root/DeskcommCRM'; then
    printf '  ✗ le refus ne dit pas OÙ se trouve l’installation qui existe déjà\n'; exit 1
  fi
  # 3. Enseigne l'issue actionnable (mettre à jour celle qui existe).
  if ! printf '%s' "$saida" | grep -q 'update.sh'; then
    printf '  ✗ le refus n’enseigne pas le chemin (update.sh dans le dossier qui existe déjà)\n'; exit 1
  fi
  # 4. A vraiment refusé : rien ne doit avoir démarré. Un `up -d` après le refus
  #    serait la pire issue — le bon message et le dégât fait quand même.
  if grep -qE '^compose .*up -d' "$LOG"; then
    printf '  ✗ a refusé mais a quand même démarré la stack : %s\n' "$(grep -m1 -E '^compose .*up -d' "$LOG")"; exit 1
  fi
  printf '  ✓ refuse, nomme l’installation en ligne et ne démarre rien\n'

  # ── L'autre côté : le MÊME VPS, le MÊME nom de projet, mais lancé depuis l'intérieur
  # de l'arborescence qui EST propriétaire. C'est une réexécution légitime — le chemin que le kit
  # enseigne pour corriger une réponse — et elle doit continuer. Sans cette paire, il suffirait
  # de tout bloquer pour que le test ci-dessus soit vert.
  cat > "$VPS_RAIZ/bin/docker" <<STUB2
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\$DOCKER_LOG"
case "\$1" in
  compose) case "\$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
  run)     case "\$*" in *--entrypoint*) exit 1 ;; esac; exit 0 ;;
  ps)      for a in "\$@"; do [ "\$a" = "network=host" ] && em_host=1; done
           [ "\${em_host:-0}" = 1 ] && exit 0
           printf 'deskcommcrm-caddy-1|deskcommcrm|caddy:2-alpine|0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp\n'
           exit 0 ;;
  inspect) case "\$*" in *working_dir*) printf '%s\n' "$VPS_PROJ" ;; esac; exit 0 ;;
  network) case "\$2" in inspect) exit 1 ;; esac; exit 0 ;;
esac
exit 0
STUB2
  chmod +x "$VPS_RAIZ/bin/docker"
  saida="$(rodar install.sh --yes)"
  chegou_na_deteccao || exit 1
  if printf '%s' "$saida" | grep -q 'Un DeskcommCRM est DÉJÀ EN LIGNE'; then
    printf '  ✗ a bloqué la RÉEXÉCUTION légitime (même arborescence) — le kit demande de relancer\n'; exit 1
  fi
  printf '  ✓ et la réexécution depuis sa propre arborescence continue de passer\n'
) || fail=1
rm -rf "$TMP_IRMA"

echo "intégration : NOUVELLE installation sur un VPS avec Traefik sur son PROPRE bridge (Coolify)"
# Le chemin NON-host, qui est la majorité des VPS avec panneau — et celui que la nouvelle
# question aurait pu abîmer sans que personne ne le voie. Ici la colonne Ports de `docker ps`
# dit qui tient les ports : la PREUVE existe, donc on ne demande rien, même en --yes.
# Resserrer l'élection du mode host ne pouvait pas coûter une question à qui n'en a jamais
# eu besoin — ni un réseau créé pour rien : le bridge du panneau existe déjà, et le
# réseau à désigner est LE SIEN (mesuré avec un vrai Traefik v3.3 : avec le label sur le réseau du
# projet la requête reste en HTTP 000 ; sur le réseau du proxy, HTTP 200).
TMP5="$(mktemp -d)"
(
  montar_vps "$TMP5" "crmcoolify" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
  run)     case "$*" in *--entrypoint*) exit 1 ;; esac; exit 0 ;;
  # Le Traefik du panneau PUBLIE les ports — la colonne Ports est exactement la preuve
  # qui manque en mode host. Le balayage par réseau host ne trouve rien ici.
  ps)      for a in "$@"; do [ "$a" = "network=host" ] && em_host=1; done
           [ "${em_host:-0}" = 1 ] && exit 0
           printf 'traefik-coolify|coolify|traefik:v3.3|0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp\n'
           exit 0 ;;
  inspect) case "$*" in *NetworkMode*) printf 'coolify\n';; *Networks*) printf 'coolify \n';; esac; exit 0 ;;
  # Le réseau du panneau existe déjà, et c'est un bridge.
  network) case "$2" in inspect) printf 'bridge\n' ;; esac; exit 0 ;;
esac
exit 0
STUB
  saida="$(rodar install.sh --yes)"
  chegou_na_deteccao || exit 1
  if printf '%s' "$saida" | grep -q "je m'arrête ici au lieu de deviner"; then
    printf '  ✗ a refusé une élection qui A une preuve (la colonne Ports dit qui publie)\n'; exit 1
  fi
  if ! grep -qx 'TRAEFIK_NETWORK="coolify"' "$VPS_PROJ/.env"; then
    printf '  ✗ TRAEFIK_NETWORK devait être le réseau du proxy : est sorti %s\n' \
      "$(grep -E '^TRAEFIK_NETWORK=' "$VPS_PROJ/.env" || echo '(absent)')"; exit 1
  fi
  if grep -q '^network create' "$VPS_LOG"; then
    printf '  ✗ a créé un réseau pour rien : %s\n' "$(grep -m1 '^network create' "$VPS_LOG")"; exit 1
  fi
  printf '  ✓ avec la preuve dans la colonne Ports continue sans demander, et utilise le réseau du proxy\n'
) || fail=1
rm -rf "$TMP5"

echo "DDL : la connexion du schéma est séparée de celle qui va aux conteneurs (issue #192)"
# `NEON_DATABASE_URL` cumulait deux rôles dans une seule chaîne : elle va dans le `.env`
# — et compose livre le `.env` entier à l'`app` et au `worker` (`env_file`) —
# ET c'était la même qui lançait `create extension`, le `baseline.sql` et la promotion du
# propriétaire. Dans le cloud cela passe inaperçu : la chaîne du pooler arrive déjà privilégiée. Sur une
# base AUTO-HÉBERGÉE cela bloque la première installation, et la seule issue était d'éditer le
# `.env` à la main entre deux étapes (issue #192, trouvée en installant pour de vrai).
#
# Les deux scénarios ci-dessous forment une paire, et un seul ne prouve rien : SANS la nouvelle
# variable rien ne peut changer (le parc déjà installé), et AVEC elle le DDL doit passer par une
# chaîne pendant que le `.env` reçoit l'autre. Seule la différence entre les deux montre
# que la résolution existe — un scénario seul reste vert avec la variable ignorée.
#
# Le fixture a besoin du `supabase/baseline.sql` : sans ce fichier install.sh
# saute toute l'étape 7 et le journal n'aurait aucun psql à mesurer. C'est pourquoi
# aucun scénario précédent de cette suite ne touchait ce chemin.

# Les connection strings arrivées à psql/pg_dump dans le scénario, sans répétition.
strings_de_banco() { grep -oE '(psql|pg_dump) [^ ]+' "$VPS_LOG" | awk '{print $2}' | sort -u; }
# Idem, en retirant la sonde du validateur (`psql <url> -tAc select 1`) : elle existe
# justement pour tester la connexion DE L'APP, donc utiliser la chaîne de l'app là est le
# bon comportement — c'est ce que la personne vient de répondre. Sans cette distinction
# le cas mesurerait « ils ont tout changé », ce qui est autre chose (et un défaut).
strings_de_schema() {
  grep -E '(psql|pg_dump) ' "$VPS_LOG" | grep -v -- '-tAc select 1$' \
    | grep -oE '(psql|pg_dump) [^ ]+' | awk '{print $2}' | sort -u
}
# Dérivée de BASE_ENV, pas copiée : deux copies du même littéral se désynchronisent
# le jour où le scénario de base change de chaîne, et alors le test échoue par erreur.
URL_DO_APP="$(printf '%s\n' "$BASE_ENV" | sed -n "s/^NEON_DATABASE_URL='\(.*\)'$/\1/p")"
URL_DO_DONO='postgresql://supabase_admin:motdepasseproprietaire@db-proprio.exemple.cm:5432/postgres'

TMP_DDL_A="$(mktemp -d)"
(
  montar_vps "$TMP_DDL_A" "crmddla" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
esac
exit 0
STUB
  mkdir -p "$VPS_PROJ/supabase"; : > "$VPS_PROJ/supabase/baseline.sql"
  rodar install.sh --yes >/dev/null

  # Vacuité : sans appel à Postgres il n'y a rien à mesurer, et la liste vide de
  # « chaînes erronées » serait lue comme une approbation.
  n="$(grep -cE '(psql|pg_dump) ' "$VPS_LOG")"
  if [ "${n:-0}" -lt 5 ]; then
    printf '  ✗ install.sh a parlé %s fois à Postgres — test non concluant, pas vert\n' "${n:-0}"
    printf '     (attendues : extensions, sonde de schéma, baseline, comptage des tables, promotion du propriétaire)\n'; exit 1
  fi
  vistas="$(strings_de_banco)"
  if [ "$vistas" != "$URL_DO_APP" ]; then
    printf '  ✗ sans NEON_DATABASE_ADMIN_URL le kit a cessé d’utiliser la chaîne habituelle — qui a déjà installé casse :\n'
    printf '%s\n' "$vistas" | sed 's/^/       /'; exit 1
  fi
  printf '  ✓ sans la nouvelle variable : les %s échanges avec Postgres utilisent la chaîne habituelle\n' "$n"
) || fail=1
rm -rf "$TMP_DDL_A"

TMP_DDL_B="$(mktemp -d)"
(
  montar_vps "$TMP_DDL_B" "crmddlb" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
esac
exit 0
STUB
  mkdir -p "$VPS_PROJ/supabase"; : > "$VPS_PROJ/supabase/baseline.sql"
  # Par l'ENVIRONNEMENT, et non par une ligne dans le `.env` : c'est le chemin qui NE laisse PAS
  # l'identifiant du propriétaire dans le fichier que compose livre aux conteneurs. Si le
  # scénario la déclarait dans le `.env`, la boucle de préservation d'install.sh la
  # recopierait et l'assertion du dessous mesurerait le test, pas le kit.
  export NEON_DATABASE_ADMIN_URL="$URL_DO_DONO"
  rodar install.sh --yes >/dev/null
  unset NEON_DATABASE_ADMIN_URL

  n="$(grep -cE '(psql|pg_dump) ' "$VPS_LOG")"
  if [ "${n:-0}" -lt 5 ]; then
    printf '  ✗ install.sh a parlé %s fois à Postgres — test non concluant, pas vert\n' "${n:-0}"; exit 1
  fi
  vistas="$(strings_de_schema)"
  if [ "$vistas" != "$URL_DO_DONO" ]; then
    printf '  ✗ avec NEON_DATABASE_ADMIN_URL déclarée, le schéma N’est PAS passé par elle :\n'
    printf '%s\n' "$vistas" | sed 's/^/       /'
    printf '     attendait seulement : %s\n' "$URL_DO_DONO"
    grep -nE '(psql|pg_dump) ' "$VPS_LOG" | sed 's/^/       /'; exit 1
  fi
  printf '  ✓ avec la nouvelle variable : tout le travail de schéma passe par la connexion du propriétaire\n'

  # L'autre côté, et c'est lui qui distingue la correction d'un « ils ont tout changé » : dans la
  # MÊME exécution, la sonde qui vérifie la connection string de l'app doit
  # continuer d'utiliser celle de l'app. Un patch qui remplacerait la variable en bloc
  # laisserait l'assertion du dessus verte et celle-ci rouge.
  if ! grep -qF -- "psql $URL_DO_APP -tAc select 1" "$VPS_LOG"; then
    printf '  ✗ la sonde qui valide la connexion de l’APP a cessé d’utiliser la chaîne de l’app\n'
    printf '     — elle se mettrait à approuver un identifiant que l’app n’utilisera jamais.\n'
    grep -nE 'psql .* -tAc select 1$' "$VPS_LOG" | sed 's/^/       /'; exit 1
  fi
  printf '  ✓ et la vérification de la connexion de l’app continue de se faire avec celle de l’app\n'

  gravada="$(valor_no_env "$VPS_PROJ/.env" NEON_DATABASE_URL)"
  if [ "$gravada" != "$URL_DO_APP" ]; then
    printf '  ✗ le .env n’a pas reçu la chaîne de l’APP : [%s]\n' "$gravada"; exit 1
  fi
  printf '  ✓ et le .env continue de recevoir la chaîne de l’app\n'

  # La moitié qui donne son sens à la séparation : si l'identifiant du propriétaire finit dans le
  # `.env`, compose le livre à l'app et au worker via `env_file` — et l'app retrouve
  # en main le pouvoir que cette issue lui a retiré.
  if grep -q 'NEON_DATABASE_ADMIN_URL' "$VPS_PROJ/.env"; then
    printf '  ✗ l’identifiant du PROPRIÉTAIRE a été écrit dans le .env — compose le livre aux conteneurs :\n'
    printf '       %s\n' "$(grep -m1 'NEON_DATABASE_ADMIN_URL' "$VPS_PROJ/.env")"; exit 1
  fi
  printf '  ✓ et N’écrit PAS celle du propriétaire dans le .env (que compose livrerait aux conteneurs)\n'
) || fail=1
rm -rf "$TMP_DDL_B"

echo "DDL : update.sh réapplique le baseline par la connexion du propriétaire"
# update.sh est la moitié qui fait le plus mal et que personne ne voit : il tourne seul via le
# cron d'agent.sh, et c'est lui qui livre les nouvelles migrations au clone. Avec le rôle restreint
# dans le `.env` — ce que recommande `docs/deploy-selfhost/README.md` §2 — le
# `baseline.sql` se mettait à échouer à chaque mise à jour, sans personne qui lit l'écran.
#
# Ici la variable vient du `.env` exprès : c'est la seule façon pour le cron d'avoir
# l'identifiant, et c'est ce que la documentation prescrit à qui veut une mise à jour automatique.
# La sauvegarde entre aussi (sans `--skip-backup`) parce que `pg_dump` a le même
# problème avec une pire tête : avec un rôle restreint il ne vide que ce que celui-ci voit et sort
# VERT — une sauvegarde partielle qui n'apparaît qu'au moment de restaurer.
TMP_DDL_C="$(mktemp -d)"
(
  montar_vps "$TMP_DDL_C" "crmddlc" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
esac
exit 0
STUB
  mkdir -p "$VPS_PROJ/supabase"; : > "$VPS_PROJ/supabase/baseline.sql"
  # update.sh décide quoi installer par TAG : sans version publiée il s'arrête
  # avant la base, et le test passerait à vide.
  (cd "$VPS_PROJ" && git init -q -b main . \
    && git -c user.email=t@exemplo -c user.name=teste add -A \
    && git -c user.email=t@exemplo -c user.name=teste commit -qm base \
    && git tag v9.9.9) >/dev/null 2>&1

  saida="$(rodar update.sh "" "NEON_DATABASE_ADMIN_URL='$URL_DO_DONO'
INTERNAL_SECRET='secret-de-test'
NEXT_PUBLIC_APP_URL='https://crm.exemple.cm'")"

  n_dump="$(grep -cE 'pg_dump ' "$VPS_LOG")"
  n_psql="$(grep -cE 'psql ' "$VPS_LOG")"
  if [ "${n_dump:-0}" -lt 1 ] || [ "${n_psql:-0}" -lt 2 ]; then
    printf '  ✗ update.sh n’est pas arrivé à la base (pg_dump=%s psql=%s) — non concluant, pas vert\n' \
      "${n_dump:-0}" "${n_psql:-0}"
    printf '     dernière ligne de la sortie : %s\n' "$(printf '%s' "$saida" | tail -1)"; exit 1
  fi
  vistas="$(strings_de_banco)"
  if [ "$vistas" != "$URL_DO_DONO" ]; then
    printf '  ✗ la mise à jour n’a pas utilisé la connexion du propriétaire :\n'
    printf '%s\n' "$vistas" | sed 's/^/       /'; exit 1
  fi
  printf '  ✓ baseline (%s psql) et sauvegarde (%s pg_dump) par la connexion du propriétaire\n' "$n_psql" "$n_dump"
) || fail=1
rm -rf "$TMP_DDL_C"

echo "DDL : aucun script du kit n'envoie la chaîne de l'APP à Postgres"
# Le garde-fou de CLASSE. Les trois scénarios ci-dessus prouvent install.sh et update.sh
# par le comportement ; cette ligne atteint les frères qu'aucun fixture ne lance
# (backup.sh, restore.sh, reset-mfa.sh via psql_run) — où le même défaut
# réapparaîtrait sans que personne ne le voie. Un endroit qui revient à `psql "$NEON_DATABASE_URL"`
# échoue ici.
# `--exclude` pour ne pas correspondre aux phrases de ce fichier lui-même — qui parle du
# défaut pour l'expliquer, et resterait éternellement rouge en citant ce qu'il surveille.
sobrando="$(grep -nE --exclude='test-validators.sh' '(psql|pg_dump) "\$NEON_DATABASE_URL"' ./*.sh 2>/dev/null || true)"
convertidos="$(grep -hoE --exclude='test-validators.sh' '(psql|pg_dump) "\$\(url_do_schema\)"' ./*.sh 2>/dev/null | grep -c . || true)"
if [ -n "$sobrando" ]; then
  printf '  ✗ un script du kit envoie encore la chaîne de l’app à Postgres :\n'
  printf '%s\n' "$sobrando" | sed 's/^/       /'
  fail=1
elif [ "${convertidos:-0}" -lt 10 ]; then
  # Vacuité : un balayage qui ne trouverait RIEN renverrait la même liste vide
  # de contrevenants. Le nombre est un plancher, pas une égalité — un nouvel endroit ne doit pas échouer.
  printf '  ✗ le balayage n’a trouvé que %s endroit(s) converti(s) — il est aveugle, pas propre\n' "${convertidos:-0}"
  fail=1
else
  printf '  ✓ %s endroit(s) par la connexion du schéma, aucun par celle de l’app\n' "$convertidos"
fi

echo "intégration : update.sh quand le réseau du proxy a disparu"
# Le garde-fou du réseau est né seulement dans install.sh, et le `dc up -d` d'update.sh court le
# même risque : le bridge est un artefact comme un autre et disparaît avec un
# `docker network prune` — ou avec le `down -v` que le kit lui-même enseigne comme chemin
# de redémarrage. Sans le garde-fou, la mise à jour meurt sur l'opaque « network X declared as
# external, but could not be found », et pire : qui lance update.sh c'est agent.sh,
# toutes les 5 minutes, sans personne qui lit l'écran.
#
# L'ORDRE est la moitié du test : créer le réseau APRÈS le `up -d` ne servirait à rien.
TMP6="$(mktemp -d)"
(
  montar_vps "$TMP6" "crmupdate" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  compose) case "$*" in *" exec "*) printf 'healthy\n{"data":{"status":"healthy"}}\n' ;; esac; exit 0 ;;
  # Le réseau a disparu (prune / down -v) : le `network inspect` ne le trouve pas.
  network) case "$2" in inspect) exit 1 ;; esac; exit 0 ;;
esac
exit 0
STUB
  # update.sh décide quoi installer par TAG : sans dépôt avec une version
  # publiée il s'arrête avant d'arriver au `up -d`, et le test passerait à vide.
  (cd "$VPS_PROJ" && git init -q -b main . \
    && git -c user.email=t@exemplo -c user.name=teste add -A \
    && git -c user.email=t@exemplo -c user.name=teste commit -qm base \
    && git tag v9.9.9) >/dev/null 2>&1

  # INTERNAL_SECRET/NEXT_PUBLIC_APP_URL entrent parce que c'est ce qui fait arriver update.sh
  # à la planification du cron — la doublure du crontab doit être exercée
  # ici aussi (c'est ce qui donne du poids à la vérification d'isolement à la fin du fichier).
  saida="$(rodar update.sh --skip-backup "REVERSE_PROXY='traefik'
TRAEFIK_NETWORK='crmupdate_proxy'
INTERNAL_SECRET='secret-de-test'
NEXT_PUBLIC_APP_URL='https://crm.exemple.cm'")"

  # Vacuité : si update.sh s'est arrêté avant (git, tag, doublure incomplète), l'
  # absence de l'erreur de compose ne prouve rien.
  n_up="$(grep -n -E '^compose .* up -d$' "$VPS_LOG" | head -1 | cut -d: -f1)"
  if [ -z "$n_up" ]; then
    printf '  ✗ update.sh n’est pas arrivé au "up -d" — test non concluant, pas vert\n'
    printf '     dernière ligne de la sortie : %s\n' "$(printf '%s' "$saida" | tail -1)"; exit 1
  fi
  n_create="$(grep -n -x 'network create crmupdate_proxy' "$VPS_LOG" | head -1 | cut -d: -f1)"
  if [ -z "$n_create" ]; then
    printf '  ✗ update.sh n’a pas recréé le réseau — le "up -d" mourrait sur "declared as external"\n'
    printf '     appels réseau vus : %s\n' "$(grep '^network' "$VPS_LOG" | tr '\n' ' ')"; exit 1
  fi
  if [ "$n_create" -gt "$n_up" ]; then
    printf '  ✗ le réseau a été créé APRÈS le "up -d" (ligne %s vs %s) — trop tard\n' "$n_create" "$n_up"; exit 1
  fi
  printf '  ✓ update.sh recrée le bridge du proxy avant de démarrer la stack\n'
) || fail=1
rm -rf "$TMP6"

echo "nom du projet qu'utilise docker compose"
# Compose fait TrimLeft("_-") sur le basename. Sans cela, un dossier /root/_deskcomm
# fait calculer "_deskcomm" au kit alors que les conteneurs portent "deskcomm" — l'
# installation ne se reconnaît plus et se traite comme intruse. Mesuré contre
# docker compose v2.38.2.
np_ok() {  # np_ok <chemin> <attendu>
  local real; real="$(nome_do_projeto_compose "$1")"
  if [ "$real" = "$2" ]; then printf '  ✓ %s → %s\n' "$1" "$real"
  else printf '  ✗ %s → a donné [%s], attendait [%s]\n' "$1" "$real" "$2"; fail=1; fi
}
np_ok /root/deskcommcrm  deskcommcrm
np_ok /root/DeskcommCRM  deskcommcrm
np_ok /root/_deskcomm    deskcomm
np_ok /root/-deskcomm    deskcomm
np_ok /root/_-_crm       crm
np_ok /root/_123         123
np_ok /root/deskcomm.crm deskcommcrm
np_ok /root/crm_cliente  crm_cliente

echo "réexécution : le kit est appelé par chemin RELATIF, comme le demande le README"
# Le harnais ci-dessus invoque toujours `bash "$VPS_RAIZ/$script"` — ABSOLU. Le README
# documente `bash install.sh` (:34) et la réexécution comme prise en charge (:126, :138),
# et c'est là que se trouve la différence : un `grep ... "$0"` APRÈS le `cd` vers le répertoire
# du projet cherche le script au mauvais endroit et meurt sur « No such file or
# directory », tuant la 2e exécution. C'est passé vert pendant des années parce que la seule sonde
# qui lançait l'installateur utilisait un chemin absolu.
#
# Ce cas ne lance pas install.sh en entier : il isole le mécanisme (le `cd` suivi de la
# lecture du script lui-même), qui est ce qui régresse en silence.
reexec_ok() {
  local desc="$1" dir raiz achou linha
  raiz="$(mktemp -d)"; dir="$raiz/deskcommcrm"; mkdir -p "$dir"
  cp ./install.sh "$raiz/install.sh"
  # La VRAIE LIGNE d'install.sh, extraite du fichier — pas une réimplémentation.
  # Réimplémenter le mécanisme ici laisserait ce cas VERT avec install.sh
  # saboté (mesuré : j'ai prévu 1 rouge et observé 0 dans la première version de ce
  # fichier). Le test doit exécuter ce que le kit exécute.
  linha="$(grep -n 'CONHECIDAS=' "$raiz/install.sh" | head -1 | cut -d: -f2-)"
  if [ -z "$linha" ]; then
    printf '  ✗ %s — ligne CONHECIDAS= introuvable dans install.sh (le test est devenu aveugle)\n' "$desc"; fail=1; return
  fi
  achou="$(cd "$dir" && KIT_DIR="$raiz" bash -c "
    set +e
    $linha
    printf '%s' \"\$CONHECIDAS\" | grep -c .
  " install.sh 2>/dev/null)"
  rm -rf "$raiz"
  if [ "${achou:-0}" -gt 0 ]; then printf '  ✓ %s (%s vars)\n' "$desc" "$achou"
  else printf '  ✗ %s — le kit ne se retrouve pas après le cd ; la 2e exécution meurt\n' "$desc"; fail=1; fi
}
# Le CONTRÔLE NÉGATIF. Il a été PROMIS par écrit dans le commentaire ci-dessus et
# appelé ici, mais jamais défini — `reexec_neg` était une commande inexistante,
# qui dans un script sans `set -e` affiche seulement « command not found » sur stderr et
# continue. La suite se terminait alors sur « tous les validateurs ont passé »
# en ayant exécuté une assertion de moins que ce qu'elle disait.
#
# Sans lui, `reexec_ok` seul ne prouve rien : une sonde qui renverrait « j'ai trouvé
# des vars » en toute circonstance serait aussi verte. Ce cas lance la MÊME
# ligne extraite d'install.sh, en échangeant seulement `$KIT_DIR/install.sh` contre `"$0"` —
# la forme qu'avait le kit avant la correction — et exige qu'elle ÉCHOUE. Si elle
# passe, la sonde ne distingue pas le défaut de la correction et le cas du dessus est
# décoratif.
reexec_neg() {
  local dir raiz linha achou
  raiz="$(mktemp -d)"; dir="$raiz/deskcommcrm"; mkdir -p "$dir"
  cp ./install.sh "$raiz/install.sh"
  linha="$(grep -n 'CONHECIDAS=' "$raiz/install.sh" | head -1 | cut -d: -f2-)"
  if [ -z "$linha" ]; then
    printf '  ✗ contrôle négatif — ligne CONHECIDAS= introuvable dans install.sh (le test est devenu aveugle)\n'; fail=1; rm -rf "$raiz"; return
  fi
  # La vérification de cible vient AVANT la substitution, et regarde la ligne ORIGINALE. Si
  # elle regardait la ligne déjà réécrite, un install.sh saboté de retour vers `"$0"`
  # laisserait ce cas VERT — il mesurerait exactement ce que le cas du
  # dessus mesure, et un contrôle négatif qui fait écho au positif ne contrôle rien.
  # (Mesuré : j'ai prévu 2 rouges en sabotant la source et observé 1, et c'est ainsi que
  # cette vacuité est apparue.)
  case "$linha" in
    *'"$KIT_DIR/install.sh"'*) ;;
    *) printf '  ✗ contrôle négatif — la ligne CONHECIDAS= n’utilise plus $KIT_DIR ; le défaut est revenu ou le cas a perdu sa cible\n'; fail=1; rm -rf "$raiz"; return;;
  esac
  # L'ANCIENNE forme, reconstruite à partir de la vraie ligne : le `$KIT_DIR/install.sh`
  # devient `"$0"`, et rien d'autre ne change.
  linha="${linha//\"\$KIT_DIR\/install.sh\"/\"\$0\"}"
  achou="$(cd "$dir" && KIT_DIR="$raiz" bash -c "
    set +e
    $linha
    printf '%s' \"\$CONHECIDAS\" | grep -c .
  " install.sh 2>/dev/null)"
  rm -rf "$raiz"
  if [ "${achou:-0}" -eq 0 ]; then printf '  ✓ contrôle négatif : avec "$0" relatif après le cd, le kit NE se retrouve PAS\n'
  else printf '  ✗ contrôle négatif ÉCHOUÉ — la sonde a trouvé %s vars même avec le défaut ; elle ne distingue rien\n' "$achou"; fail=1; fi
}
reexec_neg
reexec_ok "le bloc des variables connues retrouve le kit après le cd"

echo "isolement : la suite n'écrit pas dans le crontab de la machine"
# Ce n'est pas une hypothèse défensive : les tests ont DÉJÀ écrit 10 lignes orphelines dans le
# crontab du mainteneur, l'une d'elles un `curl` avec Bearer qui se déclenchait chaque minute
# vers un domaine d'exemple en pointant vers un répertoire temporaire que la
# suite elle-même efface. Lancer un test ne doit pas toucher à la machine de qui le lance.
#
# La comparaison seule passerait par vacuité — un crontab que personne n'a essayé
# d'écrire reste identique faute de tentative, pas grâce à l'isolement. C'est pourquoi la
# première assertion est le CONTRÔLE POSITIF : la doublure doit avoir reçu les lignes
# du kit. Ce n'est que lorsqu'une écriture capturée existe que « le réel n'a pas changé »
# signifie quelque chose.
crontab -l >"$CRONTAB_REAL_DEPOIS" 2>/dev/null || : >"$CRONTAB_REAL_DEPOIS"
if [ ! -s "$CRONTAB_SANDBOX" ] || ! grep -q '# deskcomm:' "$CRONTAB_SANDBOX"; then
  printf '  ✗ rien n’a été écrit dans le faux crontab — le test n’a mesuré aucun isolement\n'
  printf '     (le kit aurait dû planifier drain et agent pendant les tours d’intégration)\n'
  fail=1
elif ! cmp -s "$CRONTAB_REAL_ANTES" "$CRONTAB_REAL_DEPOIS"; then
  printf '  ✗ le crontab RÉEL de la machine a changé pendant la suite :\n'
  diff "$CRONTAB_REAL_ANTES" "$CRONTAB_REAL_DEPOIS" | sed 's/^/       /'
  fail=1
else
  printf '  ✓ le kit a planifié %s ligne(s) — toutes dans le bac à sable, le crontab réel intact\n' \
    "$(grep -c '# deskcomm:' "$CRONTAB_SANDBOX")"
fi

echo
if [ "$fail" = 0 ]; then echo "tous les validateurs ont passé"; else echo "ÉCHEC"; fi
exit "$fail"
