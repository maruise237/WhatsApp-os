/**
 * Classificador + planejador de tempo do sistema de fluxos de follow-up (onda 5,
 * Task 5.1) — os dois `purpose` de `followup_turn` dirigido por fluxo que NÃO
 * rodam o agente inteiro (`classify`/`plan_timing`): uma ÚNICA chamada de
 * modelo pelo seam agnóstico (runModelCall), mesmo padrão de
 * stage-classifier.ts/guardrails/promise/semantic.ts.
 *
 * Quem decide o que fazer com o resultado é a PONTE
 * (lib/followup/turn-bridge.ts, via callback injetado em followup-turn.ts) —
 * este módulo só classifica/propõe, nunca escreve no enrollment.
 */
import type pg from 'pg';

import type { Logger } from '../obs/logger';
import type { ProviderRegistry } from '../edge/llm/providers';
import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { LeadContext } from '../edge/crm/get-lead-context';

const CLASSIFY_INSTRUCTION =
  'Vous êtes un classificateur auxiliaire de relance (vous NE répondez PAS au lead). Classez le ' +
  'DERNIER message du lead ci-dessous dans UNE des classes listées. Répondez UNIQUEMENT en JSON, ' +
  'sans explication : {"class": "<une des classes, exactement telle que listée>"}.';

function buildClassifyMessage(candidate: string, classes: string[], hint?: string): string {
  return [
    CLASSIFY_INSTRUCTION,
    '',
    '## Classes possibles',
    classes.map((c) => `- ${c}`).join('\n'),
    ...(hint ? ['', '## Indication supplémentaire du flux', hint] : []),
    '',
    '## Message du lead à classer',
    candidate,
  ].join('\n');
}

/**
 * Extrai `class` do JSON do modelo (tolerante a prosa/cerca em volta). Só aceita
 * uma classe que esteja literalmente em `classes` — saída fora da lista (ou sem
 * JSON parseável) vira `null`, nunca um palpite.
 */
export function parseFollowupClassification(text: string, classes: string[]): string | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const value = typeof obj.class === 'string' ? obj.class : null;
  return value !== null && classes.includes(value) ? value : null;
}

/**
 * Classifica a última resposta do lead em uma de `classes`. `candidateText` já
 * vem resolvido pelo chamador como "a última inbound DEPOIS do último
 * outbound, ou null" — sem candidato, NÃO chama o modelo: devolve 'no_reply'
 * direto (custo $0; espelha o caminho sem LLM de node-handlers.ts na expiração
 * de grace). Saída não-parseável/fora de `classes` → erro (o job re-tenta pela
 * fila; nunca adivinha uma classe errada — doutrina "sem preguiça").
 */
export async function classifyFollowupReply(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId: string; jobId: string },
  args: { candidateText: string | null; classes: string[]; hint?: string; model?: string },
  deps: { registry?: ProviderRegistry; log: Logger },
): Promise<string> {
  if (args.candidateText === null) return 'no_reply';

  const call = await runModelCall(
    db,
    cfg,
    {
      tenantId: ids.tenantId,
      leadId: ids.leadId,
      jobId: ids.jobId,
      purpose: 'followup_classify',
      ...(args.model !== undefined ? { model: args.model } : {}),
      messages: [{ role: 'user', content: buildClassifyMessage(args.candidateText, args.classes, args.hint) }],
    },
    { registry: deps.registry, log: deps.log },
  );
  const cls = parseFollowupClassification(call.result.text, args.classes);
  if (cls === null) {
    throw new Error(
      'classificateur de relance : sortie du modèle sans classe reconnaissable parmi celles configurées — tour relancé par la file',
    );
  }
  return cls;
}

const PLAN_INSTRUCTION =
  'Vous êtes un planificateur auxiliaire de relance (vous NE répondez PAS au lead). Ci-dessous figurent les ATTENTES ' +
  'adaptatives d’un flux de relance, dans l’ordre où elles vont se produire. Choisissez combien de temps ' +
  'attendre pour CHACUNE, en pensant à la séquence entière — le rythme entre les attentes compte autant ' +
  'que chacune prise isolément. Respectez l’intervalle (minimum/maximum) de chaque attente. ' +
  'Répondez UNIQUEMENT en JSON, sans explication : ' +
  '{"esperas": [{"node_id": "<id de l’attente>", "aguardar_ms": <entier en millisecondes>, ' +
  '"motivo": "<phrase courte en français expliquant le choix pour un lecteur humain>"}]}.';

/** Espera adaptativa como o planejador a enxerga (espelha `EsperaAdaptativa` de
 *  lib/followup/timing-plan.ts — agent-engine não importa followup/*). */
export interface EsperaParaPlanejar {
  node_id: string;
  label: string;
  min_ms: number;
  max_ms: number;
  guidance?: string;
}

/** Proposta crua para UMA espera, antes do clamp — quem grampeia é a ponte. */
export interface PropostaDeEsperaBruta {
  node_id: string;
  aguardar_ms: number;
  motivo: string;
}

function buildPlanMessage(context: LeadContext, now: Date, esperas: EsperaParaPlanejar[]): string {
  return [
    PLAN_INSTRUCTION,
    '',
    '## Maintenant',
    now.toISOString(),
    '',
    '## Attentes du flux, dans l’ordre',
    ...esperas.map((e, i) =>
      [
        `${i + 1}. node_id: ${e.node_id} — "${e.label}"`,
        `   intervalle autorisé : de ${e.min_ms}ms à ${e.max_ms}ms`,
        ...(e.guidance ? [`   orientation du flux : ${e.guidance}`] : []),
      ].join('\n'),
    ),
    '',
    '## Contexte du lead (contact + derniers messages)',
    JSON.stringify(context),
  ].join('\n');
}

/**
 * Extrai as propostas do JSON do modelo (tolerante a prosa/cerca em volta). Só
 * aceita `node_id` que esteja de fato no fluxo e `aguardar_ms` numérico finito —
 * espera com número ilegível fica FORA do plano (o nó cai no máximo, que é o
 * comportamento anterior) em vez de receber um valor inventado.
 *
 * `motivo` ausente NÃO descarta a espera: ele é texto de exibição, e perder o
 * instante escolhido por falta de uma frase seria trocar o essencial pelo
 * acessório. Fica registrado que o modelo não explicou.
 */
export function parsePlanoDeEsperas(text: string, nodeIdsDoFluxo: string[]): PropostaDeEsperaBruta[] {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) return [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!Array.isArray(obj.esperas)) return [];

  const conhecidos = new Set(nodeIdsDoFluxo);
  const vistos = new Set<string>();
  const propostas: PropostaDeEsperaBruta[] = [];
  for (const item of obj.esperas) {
    if (typeof item !== 'object' || item === null) continue;
    const linha = item as Record<string, unknown>;
    const nodeId = typeof linha.node_id === 'string' ? linha.node_id : null;
    if (nodeId === null || !conhecidos.has(nodeId) || vistos.has(nodeId)) continue;
    const ms = typeof linha.aguardar_ms === 'number' ? linha.aguardar_ms : Number(linha.aguardar_ms);
    if (!Number.isFinite(ms)) continue;
    vistos.add(nodeId);
    propostas.push({
      node_id: nodeId,
      aguardar_ms: ms,
      motivo: typeof linha.motivo === 'string' && linha.motivo.trim() !== ''
        ? linha.motivo.trim()
        : 'le modèle n’a pas expliqué son choix',
    });
  }
  return propostas;
}

/**
 * Propõe o plano de tempo do fluxo INTEIRO — todas as esperas adaptativas de uma
 * vez, no acionamento do follow-up. Uma chamada de modelo por follow-up, não uma
 * por espera; e o planejador vê a sequência, então pode ritmar as esperas entre
 * si (o motivo de existir o plano, ver lib/followup/timing-plan.ts).
 *
 * A PONTE (lib/followup/turn-bridge.ts) é quem grampeia cada proposta no
 * intervalo do nó e escreve no enrollment — este módulo só propõe.
 *
 * O `purpose` do ponto de IA continua `followup_decide_timing`: é o MESMO ponto
 * do catálogo ("Escolher a hora do follow-up", lib/ai/pontos/registro.ts), e
 * cada organização já pode ter provedor/modelo escolhidos para ele em
 * `ai_purpose_bindings` — renomeá-lo apagaria essa configuração nos clones. O
 * que mudou foi o mecanismo (o fluxo todo de uma vez), não o ponto.
 */
export async function planFollowupTiming(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId: string; jobId: string },
  args: { context: LeadContext; esperas: EsperaParaPlanejar[]; model?: string },
  deps: { registry?: ProviderRegistry; log: Logger; clock?: () => Date },
): Promise<{ propostas: PropostaDeEsperaBruta[]; modelo: string }> {
  const now = (deps.clock ?? ((): Date => new Date()))();
  const call = await runModelCall(
    db,
    cfg,
    {
      tenantId: ids.tenantId,
      leadId: ids.leadId,
      jobId: ids.jobId,
      purpose: 'followup_decide_timing',
      ...(args.model !== undefined ? { model: args.model } : {}),
      messages: [{ role: 'user', content: buildPlanMessage(args.context, now, args.esperas) }],
    },
    { registry: deps.registry, log: deps.log },
  );
  const propostas = parsePlanoDeEsperas(call.result.text, args.esperas.map((e) => e.node_id));
  if (propostas.length === 0) {
    throw new Error(
      'planificateur de délai de relance : sortie du modèle sans aucune attente reconnaissable — tour relancé par la file',
    );
  }
  return { propostas, modelo: call.model };
}
