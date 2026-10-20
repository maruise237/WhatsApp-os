/**
 * lead_state — estado do funil por lead (F2-10; migration 0008).
 *
 * Doutrina (feature list / Anthropic aplicada ao lead): o modelo MARCA avanços
 * via tool `update_lead_state`; ele nunca redefine nem regride livremente. A
 * máquina de estados vive AQUI, no código (regra dura nº 9 — comportamento
 * crítico é determinístico): transição inválida vira erro de ENSINO pt-br
 * citando o estágio atual e os avanços válidos, nunca gravação silenciosa.
 *
 * Grafo v0 FIXO (não é knob por org — parametrização por tenant é F5):
 *   new → contacted → qualifying → qualified → negotiating → won | lost
 *   `lost` é alcançável de qualquer estágio ativo; won/lost são terminais.
 *
 * Payload da tool é whitelisted por Zod .strict(): campo extra (tenant_id/
 * lead_id/stage_id forjado, __proto__…) é REJEITADO com ensino — nunca stripped
 * em silêncio (stripping esconderia o ataque do modelo-professor). tenant/lead
 * vêm SEMPRE do runtime (row do job), jamais do payload.
 */
import { z } from 'zod';

import type { Queryable } from '../queue/queue';

export const LEAD_STAGES = [
  'new',
  'contacted',
  'qualifying',
  'qualified',
  'negotiating',
  'won',
  'lost',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Grafo de transições v0 — fonte única; o CHECK da 0008 é só backstop. */
export const LEAD_STAGE_TRANSITIONS: Readonly<Record<LeadStage, readonly LeadStage[]>> = {
  new: ['contacted', 'lost'],
  contacted: ['qualifying', 'lost'],
  qualifying: ['qualified', 'lost'],
  qualified: ['negotiating', 'lost'],
  negotiating: ['won', 'lost'],
  won: [],
  lost: [],
};

export function isValidTransition(from: LeadStage, to: LeadStage): boolean {
  return LEAD_STAGE_TRANSITIONS[from].includes(to);
}

/** Whitelist EXATA do que o modelo pode marcar — .strict() rejeita o resto. */
export const updateLeadStateInputSchema = z.strictObject({
  stage: z.enum(LEAD_STAGES).optional(),
  qualification: z
    .strictObject({
      budget: z.string().max(300).optional(),
      authority: z.string().max(300).optional(),
      need: z.string().max(300).optional(),
      timeline: z.string().max(300).optional(),
    })
    .optional(),
  next_action: z.string().max(500).nullable().optional(),
  reason: z.string().max(500).optional(),
});
export type UpdateLeadStateInput = z.infer<typeof updateLeadStateInputSchema>;

export interface LeadStateRow {
  id: string;
  organization_id: string;
  contact_id: string;
  stage: LeadStage;
  qualification: Record<string, string>;
  next_action: string | null;
  /** Identidade da proposta corrente — ver migration 0073 e o upsert abaixo. */
  next_action_seq: number;
  updated_at: Date;
}

export type LeadStateUpdateResult =
  | {
      ok: true;
      state: LeadStateRow;
      /** null = update sem mudança de estágio (inclui o no-op idempotente). */
      transition: { from: LeadStage; to: LeadStage; reason?: string } | null;
      message: string;
    }
  | { ok: false; error: { code: 'invalid_payload' | 'invalid_transition'; message: string } };

function teachInvalidTransition(current: LeadStage, to: LeadStage): LeadStateUpdateResult {
  const valid = LEAD_STAGE_TRANSITIONS[current];
  const options =
    valid.length > 0
      ? `À partir de "${current}" les avancées valides sont : ${valid.map((s) => `"${s}"`).join(', ')}.`
      : `"${current}" est une étape terminale — aucune transition possible.`;
  return {
    ok: false,
    error: {
      code: 'invalid_transition',
      message:
        `transition d’étape invalide : le lead est en "${current}" et "${to}" n’est pas une avancée autorisée ` +
        `(tout retour en arrière ou saut dans le tunnel est interdit). ${options} Marquez uniquement la prochaine avancée réelle.`,
    },
  };
}

const PAYLOAD_TEACHING =
  'Champs acceptés : stage, qualification {budget, authority, need, timeline}, next_action, reason — ' +
  'rien d’autre. Le lead et l’organisation viennent du runtime, jamais du payload de l’outil.';

function teachInvalidPayload(issues: string): LeadStateUpdateResult {
  return {
    ok: false,
    error: {
      code: 'invalid_payload',
      message: `payload invalide dans update_lead_state (${issues}). ${PAYLOAD_TEACHING}`,
    },
  };
}

export function zodIssuesSummary(error: z.ZodError): string {
  // Só NOMES de campos/códigos na mensagem — nunca valores (podem carregar PII).
  return error.issues
    .map((i) =>
      i.code === 'unrecognized_keys'
        ? `champs non reconnus : ${i.keys.join(', ')}`
        : `${i.path.join('.') || '(racine)'}: ${i.code}`,
    )
    .join('; ');
}

// Zod v4 DROPA chaves __proto__ silenciosamente (hardening próprio) em vez de
// acusá-las em unrecognized_keys — aqui o acceptance exige REJEIÇÃO com ensino
// (strip silencioso esconderia o ataque do modelo-professor), então a checagem
// é explícita, antes do parse, recursiva no payload raso da tool.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function findForbiddenKey(value: unknown): string | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return key;
    }
    const nested = findForbiddenKey((value as Record<string, unknown>)[key]);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

export async function getLeadState(
  db: Queryable,
  tenantId: string,
  leadId: string,
): Promise<LeadStateRow | null> {
  const { rows } = await db.query<LeadStateRow>(
    'select * from lead_state where organization_id = $1 and contact_id = $2',
    [tenantId, leadId],
  );
  return rows[0] ?? null;
}

/**
 * Aplica um update marcado pelo modelo: valida whitelist + transição, faz upsert
 * do estado e (se houve avanço) grava a transição no histórico — upsert e append
 * num ÚNICO statement (CTE), atômico sem plumbing de transação.
 *
 * Idempotente: stage igual ao atual → no-op amigável (retry do run não assusta o
 * modelo nem duplica histórico). ponytail: read-then-write sem lock — a fila tem
 * lane por lead (F2-03), turnos do mesmo lead nunca correm em paralelo.
 */
export async function applyLeadStateUpdate(
  db: Queryable,
  ids: { tenantId: string; leadId: string; jobId?: string | null },
  rawInput: unknown,
): Promise<LeadStateUpdateResult> {
  const forbidden = findForbiddenKey(rawInput);
  if (forbidden !== null) {
    return teachInvalidPayload(`champs non reconnus : ${forbidden}`);
  }
  const parsed = updateLeadStateInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return teachInvalidPayload(zodIssuesSummary(parsed.error));
  }
  const input = parsed.data;

  const current = await getLeadState(db, ids.tenantId, ids.leadId);
  const currentStage: LeadStage = current?.stage ?? 'new';

  let transition: { from: LeadStage; to: LeadStage; reason?: string } | null = null;
  let noop = false;
  if (input.stage !== undefined && input.stage !== currentStage) {
    if (!isValidTransition(currentStage, input.stage)) {
      return teachInvalidTransition(currentStage, input.stage);
    }
    transition = { from: currentStage, to: input.stage, ...(input.reason !== undefined ? { reason: input.reason } : {}) };
  } else if (input.stage !== undefined) {
    noop = true;
  }

  const nextStage = transition?.to ?? currentStage;
  const qualification = { ...(current?.qualification ?? {}), ...(input.qualification ?? {}) };
  const nextAction = input.next_action !== undefined ? input.next_action : (current?.next_action ?? null);

  // `next_action_seq` só avança quando a próxima ação é REESCRITA nesta chamada
  // ($6), e avança mesmo que o texto novo seja idêntico ao anterior: é o que
  // distingue "a mesma proposta" de "a mesma frase". A autorização humana
  // carrega este número e a execução o compara — comparar o texto deixaria
  // passar a proposta reescrita com as mesmas palavras, e comparar `updated_at`
  // recusaria autorização válida a cada escrita de estágio ou BANT.
  //
  // Este é o ÚNICO caminho de escrita de `next_action`, então o incremento tem
  // um lugar só. Trigger não serviria: do lado do banco, "escreveu o mesmo
  // valor de novo" é indistinguível de "não escreveu".
  const upsert = `
    insert into lead_state (organization_id, contact_id, stage, qualification, next_action, next_action_seq)
    values ($1, $2, $3, $4::jsonb, $5, case when $6::boolean then 1 else 0 end)
    on conflict (organization_id, contact_id) do update
      set stage = excluded.stage,
          qualification = excluded.qualification,
          next_action = excluded.next_action,
          next_action_seq = lead_state.next_action_seq + case when $6::boolean then 1 else 0 end,
          updated_at = now()
    returning *`;
  const upsertParams = [
    ids.tenantId,
    ids.leadId,
    nextStage,
    JSON.stringify(qualification),
    nextAction,
    input.next_action !== undefined,
  ];

  let state: LeadStateRow;
  if (transition !== null) {
    const { rows } = await db.query<LeadStateRow>(
      `with up as (${upsert}),
       tr as (
         insert into lead_state_transitions (organization_id, contact_id, job_id, from_stage, to_stage, reason)
         values ($1, $2, $7, $8, $3, $9)
       )
       select * from up`,
      [...upsertParams, ids.jobId ?? null, transition.from, transition.reason ?? null],
    );
    state = rows[0]!;
  } else {
    const { rows } = await db.query<LeadStateRow>(upsert, upsertParams);
    state = rows[0]!;
  }

  const message = transition
    ? `état mis à jour : le lead est passé de "${transition.from}" à "${transition.to}".`
    : noop
      ? `le lead est déjà en "${currentStage}" — rien à modifier dans l’étape.`
      : `état mis à jour (l’étape reste "${currentStage}").`;
  return { ok: true, state, transition, message };
}
