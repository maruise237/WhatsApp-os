#!/usr/bin/env bash
# Neon Auth beta : l’administration directe des mots de passe n’est pas utilisée
# par le kit tant que son contrat admin n’est pas validé sur le projet réel.
# Utilisez le flux "Mot de passe oublié" de l’application, qui ne reçoit jamais
# le nouveau mot de passe dans ce shell.
source "$(dirname "$0")/_common.sh"
die "Le reset direct est désactivé sous Neon. Utilisez la récupération de mot de passe Neon Auth depuis /login."
