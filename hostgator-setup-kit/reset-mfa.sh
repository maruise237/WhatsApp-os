#!/usr/bin/env bash
# Urgence : retire le MFA (TOTP) d'un utilisateur qui a perdu son authentificateur.
# À la prochaine connexion, il devra en enregistrer un nouveau si la politique MFA l'exige.
#
#   bash hostgator-setup-kit/reset-mfa.sh proprietaire@entreprise.com
source "$(dirname "$0")/_common.sh"
enter_project

EMAIL="${1:-}"
[ -n "$EMAIL" ] || die "Usage : reset-mfa.sh <email>"

c_ylw "Ceci retire TOUS les facteurs MFA de $EMAIL."
read -r -p "Confirmer ? (o/N) " a; resposta_sim "$a" || die "Annulé."

step "Suppression des facteurs MFA"
psql_run <<SQL
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = '${EMAIL}');
SQL
c_grn "✓ MFA retiré. À la prochaine connexion, $EMAIL enregistre un nouvel authentificateur."
