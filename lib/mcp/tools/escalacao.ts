/**
 * Handlers das capacidades de ESCALAÇÃO — o ciclo agente ↔ pessoa.
 *
 * Fachada fina (Decisão 4 do briefing IA 360): toda regra de negócio já existe e é
 * chamada daqui —
 *   - roster + elegibilidade → `lib/escalacao/atendentes.ts` (mesma função da rota
 *     `/api/v1/attendants/availability`, mesmo predicado do worker de roteamento);
 *   - leitura de chamados   → `lib/escalacao/chamados.ts` (mesma função das rotas
 *     `/api/v1/ai/cases`);
 *   - transições de chamado → `lib/agent-engine/agent/human-cases.ts` (a máquina de
 *     estados, atômica, sobre `pg`);
 *   - devolver o atendimento → `lib/escalacao/retomada.ts` (mesma função da rota
 *     `/api/v1/conversations/[id]/reactivate-bot`).
 * Nenhum SQL novo mora aqui. Se a IA e a pessoa operassem por regras diferentes, o
 * sistema mentiria para uma das duas.
 *
 * `organization_id` SEMPRE do `ctx` (fonte confiável), NUNCA do input — service
 * role bypassa RLS.
 *
 * As transições de chamado rodam sobre `pg.Pool` porque é onde a máquina de
 * estados vive (UPDATE condicional + INSERT dos eventos no MESMO statement).
 * Reimplementá-las em PostgREST daria dois donos para a mesma regra e perderia a
 * atomicidade — o mesmo motivo pelo qual `POST /ai/cases/[id]/reply` usa o pool.
 */
import { z } from "zod";

import {
  encerrarChamadoPeloAgente,
  registrarNotaDoAgente,
  type DesfechoDoChamado,
} from "@/lib/agent-engine/agent/human-cases";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { audit } from "@/lib/audit";
import { carregarRosterDeAtendimento, podeAssumirAgora } from "@/lib/escalacao/atendentes";
import { lerChamado, listarChamados } from "@/lib/escalacao/chamados";
import { lerContinuidadeHumana } from "@/lib/escalacao/continuidade";
import { devolverAtendimentoAoAgente } from "@/lib/escalacao/retomada";
import type { McpContext, McpToolDefinition } from "../types";

/** Payload de auditoria a partir do ator do ctx (mesma forma de governance.ts). */
function actorAudit(ctx: McpContext): {
  actorUserId: string | null;
  metadataActor: Record<string, unknown>;
} {
  const actor = ctx.actor;
  if (actor.type === "user") {
    return { actorUserId: actor.id, metadataActor: { actor_type: "user" } };
  }
  return { actorUserId: null, metadataActor: { actor_type: actor.type, actor_id: actor.id } };
}

// ---------------------------------------------------------------------------
// crm_list_available_attendants
// ---------------------------------------------------------------------------

const atendentesInputShape = {
  /** true = só quem pode receber AGORA; false = o roster inteiro, com o motivo. */
  only_available: z.boolean().default(true),
};

export const crmListAvailableAttendants: McpToolDefinition<typeof atendentesInputShape> = {
  name: "crm_list_available_attendants",
  description:
    "Conseillers de l’org avec is_available, capacity, current_load et can_take_now (disponible ∧ " +
    "avec de la marge ∧ dans ses horaires — même prédicat que le worker de distribution). À utiliser AVANT " +
    "d’escalader : sans aucun conseiller éligible, la conversation part en file et risque de ne pas être prise. Sans e-mail " +
    "ni téléphone.",
  inputSchema: atendentesInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const agora = new Date();
    const roster = await carregarRosterDeAtendimento(ctx.db, ctx.organizationId);
    const linhas = roster.map((a) => ({
      user_id: a.userId,
      role: a.papel,
      is_available: a.disponivel,
      capacity: a.capacidade,
      current_load: a.cargaAtual,
      can_take_now: podeAssumirAgora(a, agora),
    }));
    const elegiveis = linhas.filter((l) => l.can_take_now);
    return {
      attendants: input.only_available ? elegiveis : linhas,
      // O total elegível vai SEMPRE, mesmo com only_available=false: é o número
      // que decide se escalar agora faz sentido, e deixá-lo implícito na
      // contagem do array faria o modelo errar quando a lista vem filtrada.
      available_count: elegiveis.length,
      total_count: linhas.length,
      next_action:
        elegiveis.length === 0
          ? "Personne ne peut prendre en charge maintenant. Informez le client du délai réel au lieu de promettre une prise en charge immédiate."
          : "Quelqu’un est disponible : vous pouvez transférer l’échange.",
    };
  },
};

// ---------------------------------------------------------------------------
// crm_list_human_cases
// ---------------------------------------------------------------------------

const listaChamadosInputShape = {
  state: z.enum(["abertos", "fechados"]).default("abertos"),
  limit: z.number().int().min(1).max(50).default(20),
};

export const crmListHumanCases: McpToolDefinition<typeof listaChamadosInputShape> = {
  name: "crm_list_human_cases",
  description:
    "Dossiers humains de l’org par état. 'abertos' = awaiting_human|awaiting_lead ; 'fechados' = " +
    "resolved|escalated|cancelled. Renvoie title, blocker, status, conversation_id et le nom du " +
    "contact. open_count est toujours le total des dossiers ouverts, quel que soit le filtre.",
  inputSchema: listaChamadosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const { chamados, abertos } = await listarChamados(ctx.db, ctx.organizationId, {
      estado: input.state,
      limite: input.limit,
    });
    return { cases: chamados, open_count: abertos };
  },
};

// ---------------------------------------------------------------------------
// crm_get_human_case
// ---------------------------------------------------------------------------

const chamadoInputShape = {
  case_id: z.string().uuid(),
};

export const crmGetHumanCase: McpToolDefinition<typeof chamadoInputShape> = {
  name: "crm_get_human_case",
  description:
    "Détail d’un dossier humain + chronologie complète (événements avec actor_kind, human_action et le " +
    "texte écrit). Inclut `human_continuity` : le résumé prêt de ce que la personne a décidé dans cette " +
    "conversation — utilisez-le pour reprendre sans redemander ce qui a déjà été convenu.",
  inputSchema: chamadoInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const chamado = await lerChamado(ctx.db, ctx.organizationId, input.case_id);
    if (!chamado) throw new Error("case_not_found");

    const continuidade = await lerContinuidadeHumana(
      ctx.db,
      ctx.organizationId,
      chamado.conversation_id,
    );
    return {
      ...chamado,
      human_continuity: {
        had_human_attendance: continuidade.houveAtendimentoHumano,
        summary: continuidade.resumo,
        pending_with_customer: continuidade.pendenciaComOCliente,
        decisions: continuidade.decisoes,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// crm_add_case_note
// ---------------------------------------------------------------------------

const notaInputShape = {
  case_id: z.string().uuid(),
  note: z.string().trim().min(1).max(4000),
};

export const crmAddCaseNote: McpToolDefinition<typeof notaInputShape> = {
  name: "crm_add_case_note",
  description:
    "Enregistre dans le dossier OUVERT ce qui s’est passé après l’ouverture (kind='agent_noted', " +
    "actor_kind='agent'). Refusé pour un dossier déjà clôturé ou d’une autre org. Écrivez le FAIT nouveau, pas la " +
    "répétition du blocage — c’est le prochain conseiller qui lit.",
  inputSchema: notaInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const registrado = await registrarNotaDoAgente(
      getRequestPool(),
      ctx.organizationId,
      input.case_id,
      input.note,
    );
    if (!registrado) throw new Error("case_not_open");

    const a = actorAudit(ctx);
    await audit({
      action: "ai.case_noted_by_agent",
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: "agent_case",
      resourceId: input.case_id,
      requestId: ctx.requestId,
      metadata: { ...a.metadataActor, via: "mcp" },
    });

    return {
      case_id: input.case_id,
      recorded: true,
      next_action: "Note enregistrée dans le dossier ; le prochain conseiller la lira.",
    };
  },
};

// ---------------------------------------------------------------------------
// crm_close_human_case
// ---------------------------------------------------------------------------

const encerrarInputShape = {
  case_id: z.string().uuid(),
  /** 'resolvido' = o bloqueio foi superado; 'sem_necessidade' = deixou de fazer sentido. */
  outcome: z.enum(["resolvido", "sem_necessidade"]),
  note: z.string().trim().min(1).max(4000),
};

export const crmCloseHumanCase: McpToolDefinition<typeof encerrarInputShape> = {
  name: "crm_close_human_case",
  description:
    "Clôture un dossier OUVERT avec l’issue enregistrée : 'resolvido' (status resolved) ou " +
    "'sem_necessidade' (status cancelled). Enregistre actor_kind='agent' — ne se fait jamais passer pour une " +
    "décision humaine. Refusé pour un dossier déjà clôturé. Aucune réouverture via cette capacité.",
  inputSchema: encerrarInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const encerrado = await encerrarChamadoPeloAgente(
      getRequestPool(),
      ctx.organizationId,
      input.case_id,
      { desfecho: input.outcome as DesfechoDoChamado, nota: input.note },
    );
    if (!encerrado) throw new Error("case_not_open");

    const a = actorAudit(ctx);
    await audit({
      action: "ai.case_closed_by_agent",
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: "agent_case",
      resourceId: input.case_id,
      requestId: ctx.requestId,
      metadata: { ...a.metadataActor, outcome: input.outcome, via: "mcp" },
    });

    return {
      case_id: input.case_id,
      closed: true,
      outcome: input.outcome,
      status: input.outcome === "resolvido" ? "resolved" : "cancelled",
    };
  },
};

// ---------------------------------------------------------------------------
// crm_resume_ai_attendance
// ---------------------------------------------------------------------------

const retomarInputShape = {
  conversation_id: z.string().uuid(),
};

export const crmResumeAiAttendance: McpToolDefinition<typeof retomarInputShape> = {
  name: "crm_resume_ai_attendance",
  description:
    "Rend l’échange de la conversation à l’agent : libère le responsable humain, efface " +
    "contacts.force_human et bot_silenced_until, et enregistre dans le checkpoint du lead ce que la personne " +
    "a décidé — le prochain tour démarre en le sachant. Renvoie `human_continuity` avec le résumé. " +
    "Idempotent. SEULE une personne peut l’appeler : un agent IA reçoit " +
    "`resume_requires_person`. Erreurs : conversation_not_found, assignment_conflict.",
  inputSchema: retomarInputShape,
  category: "write",
  /**
   * `agent`, e a regra dura mora no handler, NÃO no papel.
   *
   * A tentação era exigir `manager` para impedir o agente de desfazer a própria
   * passagem. Medido: `lib/ai/runtime/agent.ts` grava `role: "agent"` fixo (3
   * pontos), `mcp_token.ts` mint a `"role:agent"` sem parâmetro para variar, e
   * `ensureRole` compara por `ROLE_RANK` — então `manager` aqui não seria uma
   * regra, seria uma capacidade INALCANÇÁVEL por qualquer agente publicado,
   * devolvendo `Role 'agent' insufficient` ao modelo. Regra que só funciona por
   * acidente de ranking é regra que ninguém consegue ler nem testar.
   */
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    // REGRA DURA 2, dita em voz alta: quem devolve o atendimento é uma PESSOA.
    // O cliente pediu para falar com gente; o agente desfazer a própria passagem
    // seria devolvê-lo à automação contra o que ele pediu.
    if (ctx.actor.type === "ai_agent") {
      throw new Error(
        "resume_requires_person : rendre l’échange est une décision humaine. " +
          "Vous n’annulez pas votre propre transfert — utilisez crm_get_human_case pour lire ce qui a été décidé.",
      );
    }

    const resultado = await devolverAtendimentoAoAgente(
      {
        db: ctx.db,
        organizationId: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
        apiTokenId: ctx.apiTokenId,
      },
      { conversationId: input.conversation_id },
    );
    if (!resultado.ok) throw new Error(resultado.erro);

    return {
      conversation_id: resultado.conversationId,
      resumed: true,
      already_with_agent: resultado.jaEstavaComOAgente,
      human_continuity: {
        had_human_attendance: resultado.continuidade.houveAtendimentoHumano,
        summary: resultado.continuidade.resumo,
        pending_with_customer: resultado.continuidade.pendenciaComOCliente,
        decisions: resultado.continuidade.decisoes,
        notes: resultado.continuidade.notas,
      },
      next_action: resultado.continuidade.houveAtendimentoHumano
        ? "Reprenez en citant ce que la personne a convenu avec le client — le résumé est déjà dans le contexte du prochain tour."
        : "Échange rendu ; aucune note humaine n’a été enregistrée dans cette conversation.",
    };
  },
};
