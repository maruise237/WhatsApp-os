#!/usr/bin/env bash
# Diagnostic rapide : état des conteneurs + santé de l'app (base/Redis/WAHA).
source "$(dirname "$0")/_common.sh"
enter_project

step "Conteneurs"
dc ps

step "Santé interne de l'app (/api/v1/health)"
# Tourne depuis l'intérieur du réseau compose (la route n'est pas exposée publiquement sans TLS).
out="$(dc exec -T app node -e "
fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})
" 2>/dev/null || echo '')"
if [ -n "$out" ]; then
  printf '%s\n' "$out"
  printf '%s' "$out" | grep -q '"status":"ok"' && c_grn "✓ app en bonne santé" || c_ylw "⚠ un sous-système est dégradé (voir le JSON ci-dessus)."
else
  c_ylw "⚠ l'app n'a pas répondu. Journaux : docker compose $(dc_files) logs --tail=50 app"
fi

step "Mise à jour depuis l'écran (agent de l'hôte)"
# Constaté sur un vrai VPS : le cron de l'agent est installé en HAUT d'update.sh,
# exprès (pour survivre à une sortie anticipée) — et cela crée une fenêtre où
# l'agent existe et le schéma de la base pas encore. Il tape alors 500 toutes les 5
# minutes, avec l'erreur qui ne va que dans .update-agent.log et le `>/dev/null` du cron.
# Pour le propriétaire, le symptôme est « le bouton n'est jamais apparu » : aucune piste, aucune alarme.
# Ce bloc est la piste.
if crontab -l 2>/dev/null | grep -q 'hostgator-setup-kit/agent.sh'; then
  c_grn "✓ agent installé dans le cron (toutes les 5 minutes)"
  log="$PROJECT_DIR/.update-agent.log"
  # Récence par la MTIME du fichier, pas en analysant la date à l'intérieur : `date -d` est
  # une syntaxe GNU et échoue en silence sur BSD/macOS, renvoyant « aucun échec » pour un
  # agent qui échoue en ce moment. `find -mmin` est portable.
  if [ -s "$log" ] && [ -n "$(find "$log" -mmin -120 2>/dev/null)" ]; then
    c_ylw "⚠ l'agent a échoué récemment en parlant à l'app :"
    c_ylw "  $(tail -2 "$log" | head -1)"
    c_ylw "  Si le bouton de mise à jour n'apparaît pas à l'écran, c'est pour cela."
    c_ylw "  Cela se résout presque toujours en lançant : bash hostgator-setup-kit/update.sh"
  else
    c_grn "✓ aucun échec récent de l'agent"
  fi
else
  c_ylw "⚠ l'agent N'est PAS dans le cron — le bouton de mise à jour n'apparaîtra pas à l'écran."
  c_ylw "  Activez-le en lançant : bash hostgator-setup-kit/update.sh"
fi
