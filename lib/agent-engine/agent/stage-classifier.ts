/**
 * Stage-classifier por turno (F3-11; padrão SalesGPT — blueprint 7.1/7.6). Um
 * classificador BARATO roda por turno (via o seam agnóstico F2-23 — modelo auxiliar,
 * budget checado ANTES da chamada dentro de runModelCall; NÃO é roteamento do modelo do
 * agente) e SUGERE em que estágio do funil a conversa está agora. A sugestão entra como
 * HINT no sufixo por-lead do prompt (volátil — regra de cache 15/F2-17, nunca no prefixo
 * estável); o MODELO do agente decide e, se concordar, confirma o avanço via
 * update_lead_state (a máquina de estados F2-10 continua a ÚNICA porta do lead_state).
 *
 * Este módulo NÃO tem caminho de escrita no estado do funil: não importa nem chama o
 * aplicador da máquina de estados (F2-10), não roda SQL de escrita na tabela do estado —
 * só LÊ o enum LEAD_STAGES para validar a sugestão. Prova em
 * daemon/test/stage-classifier.test.ts (whitelist do fonte). O classificador SUGERE; quem
 * grava é a F2-10.
 *
 * Divergência classificador×modelo (o classifier sugeriu X, o modelo confirmou Y≠Y via
 * update_lead_state) vira candidato ao golden set — gravado por fs em RUNTIME (mkdir +
 * writeFile, NÃO a tool Write que o hook de freeze bloqueia), mesmo padrão da F3-09. O
 * trace carrega o sinal do turno (texto do lead — PII) para curadoria; log só leva os
 * NOMES dos estágios (regra dura 8).
 *
 * tenant_id/lead_id vêm da ROW do job (closure do run), nunca do payload (regra dura 1).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type pg from 'pg';

import type { Logger } from '../obs/logger';
import type { ProviderRegistry } from '../edge/llm/providers';
import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { LlmResolveOverride } from '../edge/llm/credentials';
import type { LeadContext } from '../edge/crm/get-lead-context';
import { LEAD_STAGES, type LeadStage } from './lead-state';

/** Knobs do classificador (env STAGE_CLASSIFIER_*; defaults conservadores no .env.example). */
export interface StageClassifierKnobs {
  /**
   * modelo auxiliar BARATO do classificador (STAGE_CLASSIFIER_MODEL). Resolvido pela camada
   * agnóstica (override de `model` no seam F2-23) — NUNCA um id hardcoded; sujeito a
   * enabled_models da org quando a lista não é vazia. Ausente = usa o defaultModel da org.
   */
  model?: string;
}

/** Instrução FIXA do classificador — marcador estável (como CHECKPOINT_INSTRUCTION) p/ os testes. */
export const STAGE_CLASSIFIER_INSTRUCTION =
  'Vous êtes un classificateur auxiliaire d’étape de tunnel de vente (vous NE répondez PAS au lead). ' +
  'À partir de la conversation ci-dessus et de l’étape actuelle, indiquez à quelle étape se trouve la conversation MAINTENANT. ' +
  'Définitions des étapes :\n' +
  '- new : lead tout juste arrivé, encore sans vrai dialogue (seulement un premier « bonjour »/question générique, sans contexte).\n' +
  '- contacted : il y a déjà eu un premier échange et un début de relation, mais le lead n’a pas encore révélé de besoin ou de problème concret.\n' +
  '- qualifying : le lead révèle son besoin, son contexte, ses difficultés ou la taille de son activité (découverte en cours).\n' +
  '- qualified : budget, pouvoir de décision, besoin et délai (BANT) déjà confirmés — prêt pour une proposition.\n' +
  '- negotiating : une proposition/un prix/des conditions sont sur la table et le lead discute du montant, d’une remise, d’un paiement échelonné.\n' +
  '- won : le lead a conclu/accepté explicitement (il va signer, payer, demander une facture).\n' +
  '- lost : le lead a refusé, renoncé ou demandé à ne plus être contacté.\n' +
  'Répondez UNIQUEMENT par un mot — le nom exact de l’étape, en anglais. Sans explication, sans ponctuation.';

function buildClassifierMessage(context: LeadContext, currentStage: LeadStage): string {
  return [
    '## Étape actuelle du tunnel (enregistrement)',
    currentStage,
    '',
    '## Conversation à classer (transcript)',
    JSON.stringify(context),
    '',
    STAGE_CLASSIFIER_INSTRUCTION,
  ].join('\n');
}

/**
 * Extrai o estágio sugerido do texto do modelo (tolerante a prosa/pontuação em volta):
 * o PRIMEIRO estágio de LEAD_STAGES que aparece como palavra. Sem estágio reconhecível →
 * null (sem sugestão neste turno) — SEM ecoar o texto do modelo (pode carregar PII).
 */
export function parseStageSuggestion(text: string): LeadStage | null {
  const norm = text.toLowerCase();
  for (const stage of LEAD_STAGES) {
    if (new RegExp(`\\b${stage}\\b`).test(norm)) {
      return stage;
    }
  }
  return null;
}

/**
 * Roda o classificador auxiliar pelo seam agnóstico (purpose 'stage_classifier'; budget
 * da org checado ANTES da chamada dentro de runModelCall). Devolve o estágio SUGERIDO ou
 * null (saída sem estágio reconhecível → degrada sem sugestão; o turno segue normal).
 */
export async function classifyStage(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId: string; jobId?: string },
  args: { context: LeadContext; currentStage: LeadStage; model?: string; llmOverride?: LlmResolveOverride },
  deps: { registry?: ProviderRegistry; log: Logger },
): Promise<LeadStage | null> {
  const call = await runModelCall(
    db,
    cfg,
    {
      tenantId: ids.tenantId,
      leadId: ids.leadId,
      ...(ids.jobId !== undefined ? { jobId: ids.jobId } : {}),
      purpose: 'stage_classifier',
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.llmOverride !== undefined ? { llmOverride: args.llmOverride } : {}),
      messages: [{ role: 'user', content: buildClassifierMessage(args.context, args.currentStage) }],
    },
    { registry: deps.registry, log: deps.log },
  );
  const suggestion = parseStageSuggestion(call.result.text);
  if (suggestion === null) {
    // aux batch sem estágio reconhecível NÃO é incidente do turno: sem PII, só o aviso.
    deps.log.warn('stage-classifier: saída do modelo auxiliar sem estágio reconhecível — turno segue sem hint');
  }
  return suggestion;
}

/**
 * Bloco de HINT do classificador para o SUFIXO por-lead do prompt (situacional, volátil —
 * depois do prefixo cacheável F2-17). É explicitamente uma DICA: o modelo decide e confirma
 * via update_lead_state (a máquina F2-10). Nunca instrui a gravar direto.
 */
export function renderStageHint(suggestion: LeadStage, currentStage: LeadStage): string {
  return [
    '## Suggestion automatique d’étape (classificateur auxiliaire — simple INDICATION)',
    `Un classificateur économique estime que la conversation est à l’étape "${suggestion}" ` +
      `(l’enregistrement actuel du tunnel est "${currentStage}"). Ce n’est qu’une suggestion : c’est VOUS qui décidez. ` +
      'Si vous êtes d’accord qu’il y a eu une avancée RÉELLE, confirmez-la avec l’outil update_lead_state (uniquement l’étape ' +
      'suivante valide, avec une preuve). S’il n’y a pas eu d’avancée, ignorez la suggestion.',
  ].join('\n');
}

export interface StageDivergence {
  /** estágio que o classificador auxiliar sugeriu neste turno. */
  suggested: LeadStage;
  /** estágio que o MODELO confirmou via update_lead_state neste turno. */
  confirmed: LeadStage;
}

/**
 * Grava a divergência classificador×modelo como candidato ao golden set (SalesGPT/blueprint
 * 7.6) — fs em RUNTIME (mkdir recursivo + writeFile), NÃO a tool Write, então o freeze do
 * golden não se aplica a este caminho executado. O arquivo é para CURADORIA HUMANA: carrega
 * o sinal (texto do lead — PII), então NUNCA é logado (regra dura 8) — só os NOMES dos
 * estágios vão a log. Um arquivo por job: retry re-grava o mesmo candidato, não duplica.
 */
export async function recordStageDivergenceCandidate(
  dir: string,
  trace: { tenantId: string; leadId: string; jobId: string; signal: string; divergence: StageDivergence },
  log: Logger,
): Promise<void> {
  const { suggested, confirmed } = trace.divergence;
  await mkdir(dir, { recursive: true });
  const record = {
    recorded_at: new Date().toISOString(),
    source: 'stage_classifier_divergence',
    note:
      `divergence classificateur×modèle : le classificateur a suggéré "${suggested}" et le modèle a confirmé ` +
      `"${confirmed}" via update_lead_state — candidat au golden set pour curation humaine (SalesGPT).`,
    tenant_id: trace.tenantId,
    lead_id: trace.leadId,
    job_id: trace.jobId,
    suggested_stage: suggested,
    confirmed_stage: confirmed,
    // sinal do turno (texto do lead — PII): fica no ARQUIVO de curadoria, jamais em log.
    signal: trace.signal,
  };
  const file = path.join(dir, `stage-divergence_${trace.jobId}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  // PII fora do log: só os nomes dos estágios (não o sinal).
  log.info('candidato ao golden set registrado (divergência de estágio classificador×modelo)', {
    suggested,
    confirmed,
  });
}
