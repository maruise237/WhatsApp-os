/**
 * Camada SEMÂNTICA de promessa em texto livre (F4-02; blueprint 6.5) — classificador
 * binário BARATO que roda DEPOIS da camada determinística (F4-01) no gate before_send.
 * A regex+schema da F4-01 só pega valor ESTRUTURADO (R$/%/parcelas); promessa em texto
 * livre ("faço de graça", "te dou uma cortesia", "garanto entrega amanhã") escapa dela —
 * esta camada fecha o buraco.
 *
 * O classificador passa pela camada de modelo agnóstica (F2-23 — modelo auxiliar pequeno,
 * budget da org checado ANTES da chamada dentro de runModelCall; NÃO é roteamento do modelo
 * do agente). Binário: a mensagem candidata contém uma promessa/compromisso livre? Devolve
 * {isPromise, suspectPhrase}. suspectPhrase é o trecho da PRÓPRIA candidata (mensagem que o
 * agente quer enviar) — volta ao modelo no veto (erro de ensino), mas NUNCA vai a log.
 *
 * Como Gate.evaluate é SÍNCRONO (before-send.ts), a chamada async roda na FASE DE CARGA do
 * GateContext (sob o advisory lock, junto de loadPromiseTable); o resultado entra no ctx e o
 * `semanticPromiseGate` (sync) lê e veta. Este módulo não persiste nada.
 *
 * organization_id/contact_id vêm da ROW do job (closure do run), nunca do payload (regra dura 1).
 */
import type pg from 'pg';

import type { Logger } from '../../obs/logger';
import type { ProviderRegistry } from '../../edge/llm/providers';
import { runModelCall, type LlmEdgeConfig } from '../../edge/llm/run-model-call';
import type { LlmResolveOverride } from '../../edge/llm/credentials';

/** Veredito binário do classificador. suspectPhrase = null quando isPromise = false. */
export interface PromiseClassification {
  isPromise: boolean;
  /** trecho literal da candidata que caracteriza a promessa (só quando isPromise=true). */
  suspectPhrase: string | null;
}

/**
 * Instrução FIXA do classificador — marcador estável (como STAGE_CLASSIFIER_INSTRUCTION)
 * para os testes reconhecerem a chamada do auxiliar. Descreve a tarefa binária, dá exemplos
 * de promessa vs. inocente (incl. as armadilhas de slogan) e força saída JSON.
 */
export const PROMISE_SEMANTIC_INSTRUCTION =
  'Vous êtes un classificateur auxiliaire de conformité commerciale (vous NE répondez PAS au lead). ' +
  'Analysez le MESSAGE que le vendeur veut envoyer et décidez s’il contient une PROMESSE ou un ' +
  'ENGAGEMENT concret en texte libre — quelque chose qui oblige l’entreprise à une chose précise et qu’ ' +
  'un validateur de valeurs structurées (prix/remise/échéances en chiffres) NE détecterait PAS.\n' +
  'C’est une PROMESSE (isPromise=true) : offrir quelque chose gratuitement/en geste commercial/aux frais de la maison, exonérer ' +
  'des frais, offrir un cadeau, garantir un remboursement, garantir un délai de livraison concret ' +
  '(« je livre demain », « ce sera prêt d’ici vendredi ») ou s’engager à régler personnellement avant une échéance.\n' +
  'Ce N’est PAS une promesse (isPromise=false) : questions, salutations, remerciements, descriptions ' +
  'd’horaires/de l’entreprise, prochaines étapes vagues SANS engagement concret et slogans génériques de ' +
  'marketing (« nous garantissons la qualité », « notre livraison est rapide », « 10x plus rapide que la concurrence »).\n' +
  'Répondez UNIQUEMENT en JSON, sans explication : ' +
  '{"isPromise": true|false, "suspectPhrase": "<passage littéral de la promesse dans le message>"|null}. ' +
  'suspectPhrase vaut null quand isPromise=false.';

function buildPromiseMessage(candidate: string): string {
  return ['## Message candidat (que le vendeur veut envoyer au lead)', candidate, '', PROMISE_SEMANTIC_INSTRUCTION].join(
    '\n',
  );
}

/**
 * Extrai {isPromise, suspectPhrase} do texto do modelo (tolerante a code-fence/prosa em
 * volta do JSON). Saída não-parseável → degrada para "sem promessa" (a camada determinística
 * F4-01 já rodou); a camada semântica NUNCA bloqueia envio por falha de parse do auxiliar.
 */
export function parsePromiseClassification(text: string, log?: Logger): PromiseClassification {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) {
    // degrade OBSERVÁVEL (F4-08 ressalva 2): sem o warn, um classificador sistematicamente
    // quebrado ficaria invisível (todo envio "sem promessa"). Loga só o FATO do parse-fail —
    // nunca o texto do modelo (poderia carregar trecho da candidata, PII fora de log).
    log?.warn('classificateur sémantique de promesse : sortie sans JSON — fail-open vers « pas de promesse »', {
      event: 'promise_semantic_parse_fail',
      reason: 'no_json',
    });
    return { isPromise: false, suspectPhrase: null };
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    // saída do auxiliar não é JSON válido → degrada para "sem promessa" (não bloqueia envio
    // por falha de parse; a camada determinística já cobriu o valor estruturado).
    log?.warn('classificateur sémantique de promesse : JSON invalide — fail-open vers « pas de promesse »', {
      event: 'promise_semantic_parse_fail',
      reason: 'invalid_json',
    });
    return { isPromise: false, suspectPhrase: null };
  }
  const isPromise = obj.isPromise === true || obj.isPromise === 'true';
  const rawPhrase = typeof obj.suspectPhrase === 'string' ? obj.suspectPhrase.trim() : '';
  return { isPromise, suspectPhrase: isPromise && rawPhrase !== '' ? rawPhrase : null };
}

/**
 * Roda o classificador semântico pelo seam agnóstico (purpose 'promise_semantic'; budget da
 * org checado ANTES da chamada dentro de runModelCall). Injetável (registry) para testes
 * determinísticos com MockLanguageModelV4. Devolve o veredito binário + a frase suspeita.
 */
export async function classifyPromise(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId?: string | null; jobId?: string },
  args: { candidate: string; model?: string; llmOverride?: LlmResolveOverride },
  deps: { registry?: ProviderRegistry; log: Logger },
): Promise<PromiseClassification> {
  const call = await runModelCall(
    db,
    cfg,
    {
      tenantId: ids.tenantId,
      ...(ids.leadId != null ? { leadId: ids.leadId } : {}),
      ...(ids.jobId !== undefined ? { jobId: ids.jobId } : {}),
      purpose: 'promise_semantic',
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.llmOverride !== undefined ? { llmOverride: args.llmOverride } : {}),
      messages: [{ role: 'user', content: buildPromiseMessage(args.candidate) }],
    },
    { registry: deps.registry, log: deps.log },
  );
  return parsePromiseClassification(call.result.text, deps.log);
}

/**
 * Erro de ENSINO que volta AO MODELO no veto semântico (acceptance 3): destaca a frase
 * suspeita e orienta a reformular. É o único lugar onde a frase (trecho da própria candidata)
 * aparece — vai ao modelo, jamais a log.
 */
export function renderSemanticPromiseVeto(suspectPhrase: string | null): string {
  const highlight = suspectPhrase !== null ? `phrase suspecte : "${suspectPhrase}" — ` : '';
  return (
    `${highlight}il s’agit d’une promesse/d’un engagement hors playbook que la validation des valeurs ` +
    'structurées ne détecte pas ; reformulez sans promettre de délai, de geste commercial, de gratuité, de cadeau ou de garantie ' +
    'non autorisée avant de renvoyer.'
  );
}
