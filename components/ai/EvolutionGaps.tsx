"use client";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { CheckCircle, Warning } from "@/lib/ui/icons";
import type { LeadStage } from "@/lib/agent-engine/agent/lead-state";
import type { EvolutionPayload } from "@/lib/ai/evolution/aggregate";
import { ROTULO_DO_PASSO } from "@/lib/leads/agent-mapping";

/**
 * Cada lacuna vira UMA frase que diz o problema e o conserto — número sem ação é
 * o "dado que não muda decisão" que a doutrina do sistema vivo proíbe.
 *
 * Duas honestidades que o texto tem que carregar, porque o dado tem:
 *  1. "não encontrou nada" CONTÉM "quase encontrou" — o agregador conta o quase-
 *     acerto dentro do mesmo laço das buscas sem resultado. Somar os dois como se
 *     fossem problemas separados infla a lacuna; por isso o segundo item começa
 *     com "Destas".
 *  2. lista vazia NÃO é boa notícia por si. Cada frase de elogio é uma afirmação
 *     sobre uma fonte diferente e só sai com a evidência daquela fonte — ver o
 *     docblock de `boaNoticia`, que é onde a regra vive.
 */

/**
 * Os passos do atendimento em português de dono de negócio.
 *
 * ⚠️ VÊM DE `ROTULO_DO_PASSO`, e este arquivo NÃO tem a sua própria tradução.
 * A tela que conserta a lacuna (Funis) lista os passos por esses mesmos nomes; se
 * cada lado traduzisse o enum à sua maneira, o dono da clínica leria "entendendo
 * o que ele precisa" aqui, clicaria no botão e procuraria essa linha numa tela
 * que a chama "Em qualificação". Um nome por coisa é o que faz o botão levar a
 * algum lugar reconhecível.
 */
function nomeiaPassos(steps: string[]): string {
  return steps.map((s) => ROTULO_DO_PASSO[s as LeadStage] ?? s).join(", ");
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos;
}

interface Lacuna {
  chave: string;
  texto: string;
  href?: string;
  cta?: string;
}

/**
 * ⚠️ A PROMESSA "VOCÊ MESMO ESCOLHE" NÃO VALE PARA GANHO E PERDA.
 *
 * A tela de destino só oferece etapa de fechamento para «Ganho» e de perda para
 * «Perdido» (é o CHECK da 0084), e `is_won`/`is_lost` não são escritos por tela
 * nenhuma do produto. Num funil sem essas etapas, o usuário clica num botão que
 * promete que ele resolve e recebe "quem montou o funil precisa marcar". A
 * ressalva sai apenas quando um desses dois passos está na lacuna — anexá-la
 * sempre seria ruído no caso comum.
 */
function ressalvaDeFechamento(steps: string[]): string {
  const fechamento = steps.filter((s) => s === "won" || s === "lost");
  if (fechamento.length === 0) return "";
  const nomes = fechamento.map((s) => `«${ROTULO_DO_PASSO[s as LeadStage]}»`).join(" et ");
  return (
    ` ${nomes} ${plural(fechamento.length, "fait exception", "font exception")} : ${plural(fechamento.length, "il ne peut pointer", "ils ne peuvent pointer")} ` +
    `que vers l’étape de conclusion ou de perte du tableau. Si votre tableau n’a pas ces étapes, voyez avec la personne qui a installé le système.`
  );
}

export function montaLacunas(gaps: EvolutionPayload["gaps"]): Lacuna[] {
  const out: Lacuna[] = [];

  for (const p of gaps.unmapped_agent_steps) {
    out.push({
      chave: `unmapped-${p.pipeline_name}`,
      // ⚠️ Este item NÃO afirma defeito, e isso é deliberado. A migration 0084 diz
      // com todas as letras que um passo sem etapa é estado LEGÍTIMO ("Em separação"
      // e "Pós-venda" não correspondem a passo nenhum do agente, e forçar mapeamento
      // seria inventar semântica que o tenant não declarou). Escrever "conserte isto"
      // mandaria o dono da clínica arrumar um funil que já está certo. O texto conta
      // a CONSEQUÊNCIA e devolve a decisão para quem conhece o próprio negócio.
      texto:
        `Dans le tableau "${p.pipeline_name}", ${p.steps.length} ${plural(p.steps.length, "étape du suivi n’a pas", "étapes du suivi n’ont pas")} ` +
        // "card" e não "cartão": é o nome que a tela do conserto usa na opção
        // «Não mover o card». Um objeto, um nome — senão o usuário lê sobre
        // "cartão" aqui e procura essa palavra lá.
        `de colonne correspondante : ${nomeiaPassos(p.steps)}. Quand l’agent atteint l’une de ces étapes, la carte du client ` +
        `ne bouge pas — elle reste où elle est. C’est parfois voulu : tous les tableaux n’ont pas besoin d’une colonne pour chaque étape. ` +
        `Mais si vous vous attendiez à voir ces clients avancer seuls dans le tableau, c’est ici que manque le lien — et c’est vous qui ` +
        `choisissez, étape par étape, vers quelle colonne va la carte.` +
        ressalvaDeFechamento(p.steps),
      // ⚠️ ESTE LINK É O QUE FECHA O CICLO. Antes ele apontava para o quadro com o
      // verbo "Ver", porque não existia lugar nenhum no produto para escrever
      // `agent_stage_hint` — o painel relatava uma lacuna e parava aí. Agora leva
      // à tela que a conserta, e o verbo diz o que se faz lá.
      href: "/app/settings/tenant/pipelines",
      cta: "Choisir l’étape de chaque passage",
    });
  }

  if (gaps.knowledge_empty > 0) {
    out.push({
      chave: "knowledge-empty",
      texto:
        `${gaps.knowledge_empty} ${plural(gaps.knowledge_empty, "question de client n’a pas trouvé", "questions de clients n’ont pas trouvé")} ` +
        `de réponse dans vos documents. Ce sont les sujets qu’il reste à écrire — chacun d’eux est une conversation où l’` +
        `agent a dû improviser ou passer la main.`,
      href: "/app/ai/knowledge/sources",
      cta: "Ouvrir la base de connaissances",
    });
  }

  if (gaps.knowledge_near_misses > 0) {
    out.push({
      chave: "knowledge-near",
      texto:
        `Parmi elles, ${gaps.knowledge_near_misses} ${plural(gaps.knowledge_near_misses, "s’en est approchée", "s’en sont approchées")} : ` +
        `il existait un document proche, mais pas assez pour que l’agent prenne le risque de l’utiliser. Ici, le contenu existe ` +
        `probablement déjà — il est seulement écrit avec d’autres mots que ceux du client. Il vaut la peine de réécrire ces documents avec les ` +
        `questions telles qu’elles arrivent.`,
      href: "/app/ai/knowledge/sources",
      cta: "Ouvrir la base de connaissances",
    });
  }

  if (gaps.router_no_match > 0) {
    out.push({
      chave: "router-no-match",
      texto:
        `Dans ${gaps.router_no_match} ${plural(gaps.router_no_match, "conversation", "conversations")}, l’agent n’a pas su vers quel ` +
        `service orienter et a utilisé le service par défaut. Si cela se répète, il manque ce sujet dans le routeur ` +
        `de votre numéro.`,
      href: "/app/ai/routers",
      cta: "Ouvrir les routeurs",
    });
  }

  if (gaps.router_failed > 0) {
    out.push({
      chave: "router-failed",
      texto:
        `Dans ${gaps.router_failed} ${plural(gaps.router_failed, "conversation, la lecture a échoué", "conversations, la lecture a échoué")} ` +
        `pour un problème technique, et elle est passée au service par défaut. Ce n’est pas un problème de configuration : c’est l’IA qui n’a pas répondu à temps. ` +
        `Si le nombre reste élevé, consultez l’historique des exécutions de l’IA.`,
      href: "/app/ai/runs",
      cta: "Voir les exécutions",
    });
  }

  return out;
}

/**
 * A boa notícia é feita de TRÊS afirmações independentes, e cada uma precisa da
 * sua própria evidência:
 *   • "toda pergunta encontrou resposta"  ← só vale se houve busca na base;
 *   • "toda conversa achou para onde ir"  ← só vale se houve decisão de rota;
 *   • "todo passo tem etapa que o recebe" ← só vale se EXISTE funil. A lacuna
 *     deriva das linhas de `crm_stages`: zero funis ⇒ zero lacunas, e o elogio
 *     seria sobre funis que não existem. E como o instalador não provisiona
 *     funil nenhum, esse é justamente o estado de instalação fresca.
 *
 * Um guarda único autorizaria as três com a evidência de uma: um tenant com
 * roteador configurado e base VAZIA tem decisões > 0 e a tela afirmaria "toda
 * pergunta encontrou resposta nos seus materiais" tendo havido ZERO perguntas.
 * O guarda tem que ter o tamanho da afirmação.
 */
export function boaNoticia(buscas: number, decisoes: number, funis: number): string {
  const partes: string[] = [];
  if (buscas > 0) partes.push("chaque question a trouvé une réponse dans vos documents");
  if (decisoes > 0) partes.push("chaque conversation a trouvé où aller");
  if (funis > 0) partes.push("chaque étape du suivi a une colonne du tableau pour la recevoir");

  const faltando: string[] = [];
  if (buscas === 0) faltando.push("personne n’a consulté votre base de connaissances");
  if (decisoes === 0) faltando.push("aucune conversation n’a été orientée");
  if (funis === 0) faltando.push("vous n’avez encore aucun tableau configuré");

  // Nenhuma evidência: a tela não tem o que elogiar, e dizer "nada travando"
  // seco seria elogio. Abre pelo motivo, não pela boa notícia.
  if (partes.length === 0) {
    return `Impossible de dire pour l’instant si quelque chose bloque : ${faltando.join(", ")}. Revenez ici quand votre agent aura répondu à des clients.`;
  }
  const frase = `Rien ne bloque sur cette période : ${partes.join(", ")}.`;
  if (faltando.length === 0) return frase;
  return `${frase} Une réserve : ${faltando.join(", ")} — sur ce point, impossible de dire si c’est bien ou mal.`;
}

export function EvolutionGaps({
  gaps,
  buscas,
  decisoes,
}: {
  gaps: EvolutionPayload["gaps"];
  /** Consultas à base no período — evidência da 1ª afirmação de `boaNoticia`. */
  buscas: number;
  /** Decisões de encaminhamento no período — evidência da 2ª afirmação. */
  decisoes: number;
}) {
  const lacunas = montaLacunas(gaps);

  if (lacunas.length === 0) {
    return (
      <Card className="flex items-start gap-3 p-5" data-testid="gaps-vazio">
        <CheckCircle size={20} className="mt-0.5 shrink-0 text-success-fg" aria-hidden />
        <p className="text-sm leading-relaxed">
          {boaNoticia(buscas, decisoes, gaps.pipelines_evaluated)}
        </p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="gaps-lista">
      {lacunas.map((l) => (
        <li key={l.chave}>
          <Card className="flex items-start gap-3 p-5">
            <Warning size={20} className="mt-0.5 shrink-0 text-warning-fg" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">{l.texto}</p>
              {l.href && (
                <Link
                  href={l.href}
                  className="mt-2 inline-block text-sm font-medium text-accent underline underline-offset-4"
                >
                  {l.cta}
                </Link>
              )}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
