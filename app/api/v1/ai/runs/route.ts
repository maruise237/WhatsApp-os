/**
 * GET /api/v1/ai/runs — as execuções de IA, com o que deu errado.
 *
 * A tela de uso (`/app/ai/usage`) responde "quanto gastei". Esta responde "o que
 * aconteceu, e por que falhou" — que é outra pergunta e não tinha lugar nenhum.
 *
 * Filtros: ponto (`purpose`), status, provedor. O eixo principal é o ponto,
 * porque é assim que o operador pensa depois de configurar o painel: "troquei o
 * modelo do classificador de estágio, está funcionando?".
 */
import { z } from "zod";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { PONTO_POR_ID } from "@/lib/ai/pontos/registro";
import { EXPLICACAO_DA_ORIGEM, type OrigemDaEscolha } from "@/lib/ai/pontos/resolver";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * O que fazer a respeito, por código de erro.
 *
 * O `error_code` já é normalizado no seam pela AÇÃO que o problema exige. Aqui
 * essa ação vira frase — porque um painel que mostra `credencial_recusada` e
 * para por aí devolve ao operador o mesmo trabalho de adivinhação que ele tinha
 * antes de a tela existir.
 */
const O_QUE_FAZER: Record<string, string> = {
  credencial_recusada:
    "Le fournisseur n’a pas accepté la clé. Vérifiez qu’elle est toujours valide dans Identifiants — les clés peuvent être révoquées ou expirer.",
  modelo_inexistente:
    "Le modèle choisi n’existe plus chez ce fournisseur. Choisissez-en un autre dans le panneau Fournisseurs.",
  limite_ou_saldo:
    "Le fournisseur a refusé pour cause de limite d’utilisation ou de solde. Vérifiez la facturation sur votre compte chez le fournisseur.",
  provedor_indisponivel:
    "Le fournisseur est indisponible ou a mis trop de temps à répondre. Cela se règle généralement tout seul ; si le problème persiste, changez de fournisseur pour ce point.",
  modelo_sem_ferramentas:
    "Le modèle choisi ne sait pas se servir des outils du CRM. Remplacez-le par un modèle compatible dans le panneau Fournisseurs.",
  // A única linha desta tabela em que o produto parou de propósito. Ela existe
  // porque o `throw` do gate de orçamento caía FORA do `try` que grava a falha:
  // a tela que nasceu para explicar o silêncio da IA nunca mostrava o único
  // caso em que o silêncio é intencional.
  orcamento_esgotado:
    "L’IA s’est arrêtée car les dépenses du mois ont atteint la limite que vous avez fixée. Ajustez la limite (ou désactivez l’arrêt) dans Utilisation de l’IA › Budget.",
  erro_desconhecido:
    "Nous n’avons pas pu identifier cette erreur. Le message d’origine du fournisseur se trouve ci-dessous.",
};

interface LinhaDeExecucao {
  id: string;
  purpose: string;
  provider: string;
  model: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  origem_da_escolha: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number | null;
  latency_ms: number | null;
  created_at: string;
}

const filtrosDaQuery = z.object({
  purpose: z.string().min(1).max(64).optional(),
  status: z.enum(["ok", "erro"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(req: NextRequest): Promise<Response> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return fail("no_active_org", "aucune organisation active", 400);
  if (ROLE_RANK[org.role] < ROLE_RANK.manager) {
    return fail("forbidden", "nécessite le rôle de manager ou supérieur", 403);
  }

  // Zod na query string, como a rota irmã de uso já faz. `Math.min(Number(…))`
  // não valida nada: `?limit=abc` virava `NaN` e `?limit=-5` passava direto,
  // o PostgREST recusava, e o erro dele voltava como **500** com a mensagem
  // crua no corpo — resposta de servidor para um erro do cliente.
  const filtros = filtrosDaQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!filtros.success) {
    return fail("invalid_query", "filtres invalides", 422, { details: filtros.error.issues });
  }
  const { purpose, status, limit: limite } = filtros.data;

  const db = await createClient();
  let q = db
    .from("llm_calls")
    .select(
      "id, purpose, provider, model, status, error_code, error_message, http_status, origem_da_escolha, input_tokens, output_tokens, cost_cents, latency_ms, created_at",
    )
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (purpose) q = q.eq("purpose", purpose);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return fail("query_failed", error.message, 500);

  const execucoes = ((data ?? []) as LinhaDeExecucao[]).map((l) => {
    const ponto = PONTO_POR_ID.get(l.purpose);
    return {
      ...l,
      // O nome de gente do ponto. Sem isto a tela mostraria `flywheel_judge`, e
      // o operador não tem por que saber o que é isso.
      pontoRotulo: ponto?.rotulo ?? l.purpose,
      // A consequência daquele ponto falhar, que é o que liga uma linha de log
      // a algo que a pessoa já viu acontecer no negócio dela.
      consequencia: l.status === "erro" ? (ponto?.sintomaDeFalha ?? null) : null,
      oQueFazer: l.status === "erro" ? (O_QUE_FAZER[l.error_code ?? ""] ?? null) : null,
      porQueEsteModelo: l.origem_da_escolha
        ? (EXPLICACAO_DA_ORIGEM[l.origem_da_escolha as OrigemDaEscolha] ?? null)
        : null,
    };
  });

  // O resumo existe para a tela abrir respondendo "está tudo bem?" antes de
  // obrigar a ler cem linhas.
  const erros = execucoes.filter((e) => e.status === "erro");
  const porCodigo = new Map<string, number>();
  for (const e of erros) porCodigo.set(e.error_code ?? "?", (porCodigo.get(e.error_code ?? "?") ?? 0) + 1);

  return ok({
    execucoes,
    resumo: {
      total: execucoes.length,
      erros: erros.length,
      porCodigo: [...porCodigo.entries()].map(([codigo, quantas]) => ({
        codigo,
        quantas,
        oQueFazer: O_QUE_FAZER[codigo] ?? null,
      })),
    },
  });
}
