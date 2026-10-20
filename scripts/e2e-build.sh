#!/usr/bin/env bash
#
# `next build` com o ambiente do E2E (Supabase LOCAL).
#
# ═══ POR QUE NÃO `node --env-file=.env.e2e next build` ═══
#
# Medido: o build morre com
#   ERR_WORKER_INVALID_EXEC_ARGV: --env-file= is not allowed in NODE_OPTIONS
# O `next build` cria Workers, e o Node recusa propagar `--env-file` para eles.
# Exportar no shell resolve porque aí são variáveis de ambiente de verdade, que
# os Workers herdam — e que têm precedência sobre os arquivos `.env*` que o Next
# carrega sozinho (é o que impede o `.env.local`, apontado para produção, de
# vencer).
#
# ═══ POR QUE O BUILD PRECISA DISTO E NÃO SÓ O START ═══
#
# As três `NEXT_PUBLIC_*` são embutidas no BUNDLE aqui. Buildar com o
# `.env.local` e depois trocar o env só no `next start` deixaria a URL de
# produção dentro do JavaScript que roda no browser: o servidor falaria com o
# banco local e o cliente com a nuvem, no mesmo teste.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.e2e ]; then
  echo "==> .env.e2e n'existe pas. Lancez 'pnpm e2e:env' (il faut la base locale debout)." >&2
  exit 1
fi

# `set -a` exporta tudo que for atribuído até o `set +a`.
set -a
# shellcheck disable=SC1091
. ./.env.e2e
set +a

echo "==> Build contre ${NEON_DATA_API_URL}"
pnpm exec next build

# A PROVA, e não a suposição: se a URL de produção sobreviveu em qualquer
# artefato do bundle, o `.env.local` venceu e o teste falaria com a nuvem pela
# metade cliente. Falhar aqui é barato; descobrir depois de escrever no banco
# real, não.
#
# O host vem do PRÓPRIO .env.local, então a guarda continua valendo se alguém
# apontar aquele arquivo para outro projeto.
if [ -f .env.local ]; then
  HOST_PROD="$(grep -E '^NEON_DATA_API_URL=' .env.local | cut -d= -f2- | sed -E 's#https?://##; s#/.*##')"
  if [ -n "$HOST_PROD" ] && [ "$HOST_PROD" != "127.0.0.1:54321" ]; then
    if grep -rqF "$HOST_PROD" .next/static 2>/dev/null; then
      echo "==> ÉCHEC : le bundle du navigateur contient l'hôte de production ($HOST_PROD)." >&2
      echo "    Le build a pris le .env.local. NE lancez PAS la suite — elle écrirait en production." >&2
      exit 1
    fi
    echo "==> OK : l'hôte de production ($HOST_PROD) n'apparaît pas dans le bundle du navigateur."
  fi
fi

# Controle POSITIVO do mesmo grep: se a URL local também não aparecesse, o
# "não achei produção" acima não valeria nada — seria um grep que não acha nada.
HOST_LOCAL="$(printf '%s' "$NEON_DATA_API_URL" | sed -E 's#https?://##; s#/.*##')"
if grep -rqF "$HOST_LOCAL" .next/static 2>/dev/null; then
  echo "==> OK (contrôle) : l'hôte local ($HOST_LOCAL) EST dans le bundle — le grep est vivant."
else
  echo "==> ÉCHEC (contrôle) : l'hôte local n'apparaît pas dans le bundle." >&2
  echo "    Sans cela, l'absence de la production ci-dessus ne prouve rien." >&2
  exit 1
fi
