#!/usr/bin/env bash
#
# DeskcommCRM — la porte d'entrée.
#
# Contrairement à install.sh, ce script tourne sur VOTRE ordinateur (macOS, Linux ou
# WSL), avant que le serveur n'existe. Il répond à l'unique question qui bloque qui
# débute — « de quoi ai-je besoin avant d'installer ceci ? » — et donne la
# bonne commande pour le cas de chacun.
#
# Usage :
#   bash comecar.sh
#   curl -fsSL https://raw.githubusercontent.com/melgarafael/DeskcommCRM/main/hostgator-setup-kit/comecar.sh | bash
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/melgarafael/DeskcommCRM.git}"
# Lien de partenariat avec HostGator. Même URL et même libellé que le README : une
# seule promesse, à un seul endroit — deux rédactions de la même offre deviennent deux offres.
VPS_URL="https://www.hostgator.com.br/52708-141-3-52.html"
COMUNIDADE_URL="https://lp-comunidade.automatiklabs.com.br"

# ── Apparence ───────────────────────────────────────────────────────────────
# Jumelles de celles d'install.sh (qui est lui-même autonome parce qu'il tourne avant le
# clone). Celui-ci tourne ENCORE avant — il peut arriver seul par le réseau, sans dépôt
# et sans son frère à côté. Si vous modifiez l'une, modifiez l'autre.
if   [ -n "${NO_COLOR:-}" ];    then COLOR=0
elif [ -n "${FORCE_COLOR:-}" ]; then COLOR=1
elif [ -t 1 ];                  then COLOR=1
else                                 COLOR=0
fi
paint() { local code="$1"; shift; if [ "$COLOR" = 1 ]; then printf '\033[%sm%s\033[0m\n' "$code" "$*"; else printf '%s\n' "$*"; fi; }
c_grn() { paint 32 "$*"; }
c_ylw() { paint 33 "$*"; }
c_dim() { paint 2  "$*"; }
die()   { paint 31 "✖ $*"; exit 1; }

LOGO_COLS=71
banner() {
  local cols linha ch
  cols="$(tput cols 2>/dev/null || echo 80)"
  case "$cols" in ''|*[!0-9]*) cols=80;; esac
  printf '\n'
  if [ "$COLOR" != 1 ] || [ "$cols" -lt $((LOGO_COLS + 2)) ]; then
    paint 1 "  DESKCOMM"
  else
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

# ── Saisie au clavier ───────────────────────────────────────────────────────
# Ce script existe pour être appelé par `curl -fsSL … | bash`, et dans ce mode le
# stdin du processus EST LE PIPE (le texte du script lui-même), pas le clavier : un
# `read` ordinaire consommerait le code source comme s'il s'agissait d'une réponse, ou verrait EOF à la
# première question. Se rattacher à /dev/tty est ce qui fait exister le menu sur ce
# chemin ; sans aucun terminal (CI, cron), il n'y a rien à demander.
TTY_IN=""
if [ -t 0 ]; then TTY_IN="/dev/stdin"
elif [ -r /dev/tty ] && { : < /dev/tty; } 2>/dev/null; then TTY_IN="/dev/tty"
fi

# Renvoie != 0 quand l'ENTRÉE EST TERMINÉE, ce qui est différent de « a répondu vide »
# (Entrée, qui vaut la valeur par défaut). Confondre les deux bloquait le script : alimenté
# par un pipe qui se termine avant les questions — `curl … | bash` de qui ne
# répond qu'à la première —, le processus NE se terminait PAS (mesuré : plafond de 20 s dépassé,
# avec le menu figé à l'écran et rien n'indiquant que seul un Ctrl-C en sort). Avec la
# distinction, le même cas se termine en 0 en affichant les deux chemins.
#
# Le mécanisme exact est resté ouvert : la consommation CPU pendant l'attente est ~0 (profil de
# blocage), mais la lecture du code suggérerait une réentrée dans la même branche. Les deux
# signaux divergent et il ne vaut pas la peine de trancher ici — le comportement qui
# compte (ne se termine pas × se termine) est mesuré dans les deux versions.
perguntar() {  # perguntar <variable> <texte> [défaut]
  local var="$1" texto="$2" padrao="${3:-}" resposta=""
  if [ -z "$TTY_IN" ]; then printf -v "$var" '%s' "$padrao"; return 0; fi
  printf '%s' "$texto"
  if ! read -r resposta < "$TTY_IN"; then printf '\n'; return 1; fi
  printf -v "$var" '%s' "${resposta:-$padrao}"
}

# Ouvre une URL dans le navigateur — seulement là où un navigateur existe. Dans une session SSH (le cas
# de qui est déjà dans le serveur) il n'y en a pas : alors le lien reste à l'écran et c'est tout,
# ce qui vaut mieux qu'une erreur de commande introuvable au milieu de la conversation.
tem_navegador() {
  if command -v open >/dev/null 2>&1 && [ "$(uname -s)" = "Darwin" ]; then return 0; fi
  if command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then return 0; fi
  return 1
}
abrir() {
  tem_navegador || return 0
  local sim=""
  # EOF ici n'est pas une raison d'ouvrir quoi que ce soit : dans le doute, on n'agit pas.
  perguntar sim "  J'ouvre ceci dans votre navigateur maintenant ? (O/n) " "O" || return 0
  case "$sim" in [Nn]*) return 0;; esac
  if [ "$(uname -s)" = "Darwin" ]; then open "$1" >/dev/null 2>&1 || true
  else xdg-open "$1" >/dev/null 2>&1 || true; fi
  c_grn "  ✓ ouvert dans le navigateur. Revenez ici quand vous aurez terminé."
}

# ── Quoi louer ──────────────────────────────────────────────────────────────
# Les chiffres ne sont pas devinés : ils sortent de docs/runbooks/waha-hostgator.md, qui est
# l'environnement où le CRM est vraiment exploité. Nommer l'OFFRE est ce qui compte le plus
# ici — « 2 vCPU / 4 Go » laisse encore la personne choisir entre six cases sur le
# site, et mal choisir, c'est découvrir le problème des semaines plus tard, avec WhatsApp
# qui tombe faute de mémoire.
mostrar_requisitos() {
  cat <<REQ

  Le CRM tourne 24 heures sur 24, avec WhatsApp. Pour cela il a besoin de :

    • Offre VPS Turing (ou supérieure) — 2 vCPU et 4 Go de RAM
      L'offre Cartesius (1 vCPU / 2 Go) NE suffit PAS : WhatsApp utilise environ
      150 Mo par numéro connecté, et la stack entière n'y tient pas.
    • 80 Go de disque
    • Ubuntu 22.04 LTS ou 24.04 LTS
    • Un datacenter proche de vos clients — c'est ce qui tient la latence de WhatsApp en Afrique

  Où louer :

       ${VPS_URL}

REQ
  c_dim "  C'est un lien de partenariat : souscrire par lui donne une remise et aide à"
  c_dim "  faire vivre le projet. Le CRM est sous licence MIT et tourne sur n'importe quel serveur — si vous en avez déjà"
  c_dim "  un, ou préférez un autre fournisseur, cela fonctionne pareil."
  printf '\n'
}

comando_de_instalacao() {
  cat <<CMD

  Une fois dans le serveur, collez ceci :

       git clone ${REPO_URL} deskcommcrm
       cd deskcommcrm
       bash hostgator-setup-kit/install.sh

  L'installateur s'occupe du reste : il installe Docker s'il manque, crée la base,
  configure le domaine en HTTPS et démarre le CRM. Il demande ce que vous seul savez
  (le domaine, les clés, le mot de passe du premier accès) et valide chaque réponse sur le
  moment — pas question de découvrir une donnée erronée dix minutes plus tard.

CMD
}

# ── Déroulé ─────────────────────────────────────────────────────────────────
banner

if [ -z "$TTY_IN" ]; then
  # Sans clavier (pipe pur, CI) : impossible de guider qui que ce soit. Donne les deux
  # chemins d'un coup, au lieu d'en choisir un de son propre chef.
  c_ylw "  (pas de terminal interactif — voici le résumé des deux chemins)"
  mostrar_requisitos
  comando_de_instalacao
  exit 0
fi

while :; do
  cat <<MENU

  Où votre CRM va-t-il tourner ?

    1) Je n'ai pas encore de serveur
    2) J'ai déjà un serveur (VPS), mais je suis sur mon ordinateur
    3) Je suis déjà dans le serveur en ce moment

MENU
  # Entrée tombe sur 1 exprès : qui a déjà un serveur arrive généralement au produit
  # par le README avec le SSH ouvert et va directement à install.sh. Qui arrive par ICI
  # — une vidéo, la communauté, un lien isolé — est, en majorité, qui n'en a pas encore.
  if ! perguntar escolha "  Tapez 1, 2 ou 3 (Entrée = 1) : " "1"; then
    c_ylw "  (l'entrée s'est terminée — je laisse les deux chemins ici)"
    mostrar_requisitos
    comando_de_instalacao
    exit 0
  fi

  case "$escolha" in
    1)
      mostrar_requisitos
      abrir "$VPS_URL"
      c_dim "  Quand le serveur sera debout, relancez cette même commande et"
      c_dim "  choisissez l'option 2 — je vous donne l'étape suivante."
      ;;
    2)
      cat <<SSH

  Entrez dans le serveur par le terminal. Le fournisseur vous a envoyé l'IP et le mot de passe root
  par e-mail quand le VPS a été prêt :

       ssh root@VOTRE_IP_ICI

SSH
      comando_de_instalacao
      break
      ;;
    3)
      if [ -f "$(dirname "$0")/install.sh" ]; then
        # Confirmation explicite parce que c'est la seule branche qui MODIFIE la machine, et
        # l'erreur est facile : qui a cloné le dépôt sur son propre portable pour lire le
        # code est à une touche d'y installer toute la stack. Montrer le
        # hostname est ce qui fait réaliser à la personne où elle est vraiment.
        printf '\n'
        c_ylw "  Attention : ceci installe le CRM SUR CETTE machine — $(hostname 2>/dev/null || echo 'celle-ci')."
        c_ylw "  Si vous êtes sur votre ordinateur personnel, et non sur le serveur, répondez n."
        # EOF ici tombe dans la branche NE PAS installer : c'est le seul point du script
        # qui modifie la machine, et « je n'ai pas pu demander » ne devient jamais un oui.
        perguntar ok "  Continuer ? (o/N) " "N" || ok="N"
        case "$ok" in
          [OoSsYy]*)
            c_grn "  ✓ installateur trouvé juste à côté. On commence."
            printf '\n'
            exec bash "$(dirname "$0")/install.sh"
            ;;
        esac
        c_dim "  D'accord, je n'ai rien installé. Choisissez 1 ou 2 si vous avez besoin de l'autre chemin."
        continue
      fi
      c_ylw "  Vous êtes sur le serveur, mais le projet n'a pas encore été téléchargé ici."
      comando_de_instalacao
      break
      ;;
    *)
      c_ylw "  Je n'ai pas compris '${escolha}'. Tapez 1, 2 ou 3."
      ;;
  esac
done

cat <<FIM
  ─── En cas de blocage ────────────────────────────────────

  Des gens font tourner exactement ce CRM dans la communauté, et c'est là que sortent les
  annonces de nouvelle version :

       ${COMUNIDADE_URL}

FIM
