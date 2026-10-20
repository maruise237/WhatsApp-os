import type pg from "pg";

import { emitAgentActivityForContact } from "@/lib/leads/agent-activity";

export interface VetoActivityInput {
  pool: pg.Pool;
  organizationId: string;
  /** No harness, "lead" é o CONTATO (inbound-turn: leadId = job.contact_id). */
  contactId: string;
  /** `before_send_traces.id` — o lastro desta decisão. */
  traceId: string;
  gate: string;
  code: string;
  agentId?: string | null;
}

/**
 * O agente decidiu NÃO falar — e isso vira linha na timeline.
 *
 * É o evento mais contra-intuitivo da entrega: o silêncio da IA com motivo é
 * informação (o humano vê que houve decisão e por quê); o silêncio sem registro
 * é abandono disfarçado de calmaria. Cenário 11 do §7.
 *
 * Roda no motor do agente, fora do request: escreve pelo `pg.Pool`, mas a linha
 * é montada pela MESMA regra da API (`buildLeadActivityRow`).
 *
 * Nunca lança: um veto registrado com sucesso não pode falhar por causa da
 * timeline dele.
 */
export async function emitVetoActivity(
  input: VetoActivityInput,
): Promise<{ routed: boolean; reason?: string }> {
  const r = await emitAgentActivityForContact({
    pool: input.pool,
    organizationId: input.organizationId,
    contactId: input.contactId,
    type: "send_vetoed",
    // Origem e prova coincidem aqui por natureza: a linha de auditoria do gate
    // é o que originou E o que sustenta. `source_id` fica com o ponteiro,
    // `evidence` com a referência — a fronteira DIRC continua valendo.
    sourceModule: "agent_guardrails",
    sourceId: input.traceId,
    evidence: { trace_ids: [input.traceId] },
    agentId: input.agentId ?? null,
    reason: vetoReason(input.gate, input.code),
    payload: { gate: input.gate, code: input.code },
  });
  return r.routed ? { routed: true } : { routed: false, reason: r.reason };
}

/** Motivo legível — o humano lê "não enviei porque", não um código de gate. */
export function vetoReason(gate: string, code: string): string {
  const porGate: Record<string, string> = {
    stop: "Non envoyé : le contact a demandé à ne plus recevoir de messages",
    window: "Non envoyé : en dehors des heures autorisées",
    pacing: "Non envoyé : limite de rythme d’envoi atteinte",
    budget: "Non envoyé : budget IA épuisé",
    warmup: "Non envoyé : numéro encore en période de rodage",
    promise: "Non envoyé : le message promettait quelque chose que je ne peux pas garantir",
    internal_vocabulary:
      "Non envoyé : le message contenait des termes internes que le client ne doit pas lire",
  };
  return porGate[gate] ?? `Non envoyé : bloqué par la règle "${gate}" (${code})`;
}
