/**
 * Flywheel vivo (Fase 2C/4B) — judge + distiller sobre turnos REAIS, como
 * módulo reutilizável: o script one-shot (scripts/flywheel-judge-live.ts) e o
 * loop agendado do worker chamam o MESMO runFlywheelOnce. Gate humano
 * inegociável: propostas só viram comportamento quando o dono publica na tela.
 */
import type pg from 'pg';

import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { Logger } from '../obs/logger';
import { aggregateFollowupOutcomes, type FlowOutcomeStat } from '../../followup/outcome-stats';

const JUDGE_MODEL = 'claude-haiku-4-5';
// O distiller PRECISA de modelo próprio: o flywheel roda org-wide sem turno/agent
// para herdar, então sem isto ele cai no settings.llm.default_model — não setado
// em self-host configurado pela tela — e a rodada falha "modelo LLM não definido".
const DISTILLER_MODEL = 'claude-haiku-4-5';
const DIMENSION = 'memory_hygiene';
const DATASET = 'live';

interface TurnRow {
  job_id: string;
  organization_id: string;
  contact_id: string;
}

interface TraceMaterial {
  transcript: string;
  notesNow: string;
  rollingSummary: string;
}

async function collectRecentTurns(pool: pg.Pool, limit: number): Promise<TurnRow[]> {
  const { rows } = await pool.query<TurnRow>(
    `select j.id as job_id, j.organization_id, j.contact_id
     from job_queue j
     where j.kind = 'inbound_turn' and j.status = 'done' and j.contact_id is not null
       and exists (select 1 from llm_calls c where c.job_id = j.id and c.purpose = 'agent_turn')
     order by j.created_at desc
     limit $1`,
    [limit],
  );
  return rows;
}

async function buildMaterial(pool: pg.Pool, turn: TurnRow): Promise<TraceMaterial> {
  const { rows: msgs } = await pool.query<{ direction: string; body: string | null }>(
    `select direction, body from messages
     where organization_id = $1 and contact_id = $2 and body is not null
     order by sent_at desc limit 12`,
    [turn.organization_id, turn.contact_id],
  );
  const transcript = msgs
    .reverse()
    .map((m) => `${m.direction === 'inbound' ? 'LEAD' : 'AGENTE'}: ${m.body}`)
    .join('\n');

  const { rows: notes } = await pool.query<{ headline: string }>(
    `select headline from lead_notes where organization_id = $1 and contact_id = $2 order by created_at`,
    [turn.organization_id, turn.contact_id],
  );
  const notesNow = notes.length > 0 ? notes.map((n) => `- ${n.headline}`).join('\n') : '(aucune note durable)';

  const { rows: cp } = await pool.query<{ rolling_summary: string }>(
    `select rolling_summary from lead_checkpoints
     where organization_id = $1 and contact_id = $2 order by seq desc limit 1`,
    [turn.organization_id, turn.contact_id],
  );
  return { transcript, notesNow, rollingSummary: cp[0]?.rolling_summary ?? '(aucun checkpoint)' };
}

/** yes = higiene ok; no = fato durável perdido/mal consolidado; unknown = indecidível. */
function judgePrompt(m: TraceMaterial, optionOrder: 'yes_first' | 'no_first'): string {
  const options =
    optionOrder === 'yes_first'
      ? '"yes" (hygiène de mémoire OK) | "no" (fait durable perdu) | "unknown"'
      : '"no" (fait durable perdu) | "yes" (hygiène de mémoire OK) | "unknown"';
  return [
    'Vous êtes un JUGE de la qualité de mémoire d’un agent SDR WhatsApp. Évaluez UNIQUEMENT la dimension',
    `"${DIMENSION}" : l’agent a-t-il conservé dans les NOTES DURABLES les faits durables du lead que la conversation`,
    'a révélés ? Faits durables = identité/activité/besoin/canal (ex. : nom, type de boutique, produit).',
    'Règle : si un fait durable apparaît dans le TRANSCRIPT ou dans le RÉSUMÉ mais N’est PAS dans les notes durables',
    '(parce qu’il n’a jamais été enregistré ou qu’une consolidation l’a effacé), le verdict est "no".',
    '',
    '=== TRANSCRIPT (récent) ===',
    m.transcript,
    '',
    '=== RÉSUMÉ CUMULÉ (checkpoint) ===',
    m.rollingSummary,
    '',
    '=== NOTES DURABLES (état actuel) ===',
    m.notesNow,
    '',
    `Répondez UNIQUEMENT en JSON : {"verdict": ${options}, "missing_facts": string[] (courts, sans données personnelles complètes)}`,
  ].join('\n');
}

function distillerPrompt(missingFacts: string[]): string {
  return [
    'Vous améliorez les PLAYBOOKS d’agents SDR par DELTAS minimaux. Un juge a constaté un défaut d’hygiène de',
    `mémoire dans une conversation réelle : des faits durables absents des notes du lead (${missingFacts.join('; ')}).`,
    'Cause racine typique : l’agent consolide les notes avec "supersedes" en effaçant des faits d’un AUTRE sujet.',
    'Proposez UNE seule puce de playbook, en français, à l’impératif, ≤3 lignes, qui prévienne cette classe',
    'de défaut sans interdire la consolidation légitime. NE citez PAS les données du lead.',
    'Décidez aussi la PORTÉE de l’apprentissage : "org" quand il vaut pour TOUT échange de l’organisation',
    '(politique, ton, fait de l’activité — ex. : "la boutique ne vend pas le dimanche") ; "agent" quand il est',
    'propre au comportement de cet agent.',
    'Répondez UNIQUEMENT en JSON : {"content": string, "scope": "agent" | "org"}',
  ].join('\n');
}

function parseJson<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('sortie du modèle sans JSON');
  return JSON.parse(text.slice(start, end + 1)) as T;
}


export interface FlywheelRunResult {
  runId: string;
  judged: number;
  proposals: number;
  /** Task 8.2 — outcomes de follow-up (converted/replied/exhausted/opted_out/
   *  handoff/in_flight) por pointer+version, por org tocada nesta rodada
   *  (via os turnos coletados). Fecha o loop: o flywheel passa a enxergar
   *  quais fluxos convertem, não só a higiene de memória do turno. */
  followupOutcomes: Array<{ organization_id: string; stats: FlowOutcomeStat[] }>;
}

export async function runFlywheelOnce(
  pool: pg.Pool,
  llmCfg: LlmEdgeConfig,
  opts: { limit: number; log: Logger },
): Promise<FlywheelRunResult> {
  const runId = crypto.randomUUID();
  const { limit, log } = opts;
  const turns = await collectRecentTurns(pool, limit);
  log.info('flywheel: turnos reais coletados', { run_id: runId, turns: turns.length });
  let judged = 0;
  let proposals = 0;

  for (const turn of turns) {
    const material = await buildMaterial(pool, turn);
    const optionOrder = parseInt(turn.job_id.slice(0, 8), 16) % 2 === 0 ? 'yes_first' : 'no_first';

    const judgedCall = await runModelCall(
      pool,
      llmCfg,
      {
        tenantId: turn.organization_id,
        leadId: turn.contact_id,
        jobId: turn.job_id,
        purpose: 'flywheel_judge',
        model: JUDGE_MODEL,
        messages: [{ role: 'user', content: judgePrompt(material, optionOrder) }],
      },
      { log },
    );
    const verdict = parseJson<{ verdict: string; missing_facts?: string[] }>(judgedCall.result.text);
    const verdictValue = ['yes', 'no', 'unknown'].includes(verdict.verdict) ? verdict.verdict : 'unknown';

    const { rowCount } = await pool.query(
      `insert into flywheel_judge_verdicts
         (organization_id, dataset, trace_id, dimension, verdict, option_order, judge_family, model, provenance, run_id)
       values ($1,$2,$3,$4,$5,$6,'anthropic',$7,$8,$9)
       on conflict (dataset, trace_id, dimension) do nothing`,
      [
        turn.organization_id,
        DATASET,
        turn.job_id,
        DIMENSION,
        verdictValue,
        optionOrder,
        JUDGE_MODEL,
        JSON.stringify({ source: 'live_turn', job_id: turn.job_id, contact_id: turn.contact_id }),
        runId,
      ],
    );
    const inserted = (rowCount ?? 0) > 0;
    if (inserted) judged += 1;
    log.info('flywheel: veredito gravado', { job_id: turn.job_id, verdict: verdictValue, inserted });

    if (verdictValue === 'no' && inserted) {
      const distilled = await runModelCall(
        pool,
        llmCfg,
        {
          tenantId: turn.organization_id,
          leadId: turn.contact_id,
          jobId: turn.job_id,
          purpose: 'flywheel_distiller',
          model: DISTILLER_MODEL,
          messages: [{ role: 'user', content: distillerPrompt(verdict.missing_facts ?? []) }],
        },
        { log },
      );
      const proposal = parseJson<{ content: string; scope?: string }>(distilled.result.text);
      const isOrg = proposal.scope?.toLowerCase().trim() === 'org';
      await pool.query(
        `insert into flywheel_distiller_proposals
           (organization_id, run_id, dataset, type, target, content, evidence)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          turn.organization_id,
          runId,
          DATASET,
          isOrg ? 'org_memory_entry' : 'playbook_bullet',
          isOrg ? 'org' : 'tenant',
          proposal.content,
          JSON.stringify({ trace_ids: [turn.job_id], dimension: DIMENSION, verdict_run_id: runId }),
        ],
      );
      proposals += 1;
      log.info('flywheel: proposta do distiller gravada (gate humano pendente)', { job_id: turn.job_id });
    }
  }
  // Task 8.2 — o sinal (followup_enrollments.outcome) já existe (Ondas 4/5);
  // aqui só agregamos por org tocada nesta rodada (via os turnos coletados
  // acima) e logamos, pra a rodada do flywheel surfacear "flow X converte a
  // N%" junto do resto. Sem tabela nova: nenhum destino de persistência
  // óbvio existe pra artefatos de rodada do flywheel (ver flywheel_judge_verdicts/
  // flywheel_distiller_proposals no baseline) — log + retorno no resultado é
  // suficiente por instrução do brief.
  const orgIds = [...new Set(turns.map((t) => t.organization_id))];
  const followupOutcomes: FlywheelRunResult['followupOutcomes'] = [];
  for (const orgId of orgIds) {
    const stats = await aggregateFollowupOutcomes(pool, orgId);
    if (stats.length === 0) continue;
    followupOutcomes.push({ organization_id: orgId, stats });
    log.info('flywheel: outcomes de follow-up por fluxo', { run_id: runId, organization_id: orgId, stats });
  }

  return { runId, judged, proposals, followupOutcomes };
}

/** Loop agendado do flywheel (4B) — intervalo por knob; erro nunca derruba o worker. */
export async function runFlywheelLoop(
  pool: pg.Pool,
  llmCfg: LlmEdgeConfig,
  opts: { intervalMs: number; limit: number; log: Logger },
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    // dorme PRIMEIRO: no boot os turnos recentes já foram julgados pela rodada
    // anterior (dedup pela unique), e subir o worker não deve custar LLM.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, opts.intervalMs);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    if (signal.aborted) return;
    try {
      const result = await runFlywheelOnce(pool, llmCfg, { limit: opts.limit, log: opts.log });
      opts.log.info('flywheel : passe planifiée terminée', result as unknown as Record<string, unknown>);
    } catch (err) {
      opts.log.error('flywheel : passe planifiée échouée', {
        error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }
}
