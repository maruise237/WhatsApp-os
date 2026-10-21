/**
 * As MÃOS que impedem uma demanda de morrer (IA 360 · wave 2).
 *
 * Seis capacidades sobre o mesmo eixo: marcar o próximo passo (agendar, cancelar
 * e listar retorno), enxergar quem esfriou (radar), propor a retomada e registrar
 * o desfecho. É o pacote `reter` do catálogo — o invariante 4 da doutrina
 * (`docs/doctrine/sistema-vivo.md`) executável pelo agente que o dono configura.
 *
 * ⚠️ FACHADA FINA (Decisão 4 do briefing). Nenhuma regra de negócio nasce aqui:
 *   - o retorno é de `lib/followup/retorno.ts` + `retorno-crm.ts`, a MESMA regra
 *     que o motor do agente executa sobre `pg.Pool`;
 *   - o radar é de `lib/leads/radar-de-risco.ts`, extraído da rota que a tela usa;
 *   - o encerramento é de `lib/leads/encerramento.ts`, extraído das rotas de
 *     ganho/perda;
 *   - a proposta de reativação é de `lib/leads/reactivation.ts`, a mesma que o
 *     observador de risco cria.
 * Reimplementar qualquer uma faria a IA e o humano operarem por regras
 * diferentes, e o sistema mentiria para um dos dois.
 *
 * ⚠️ PAPEL: as leituras e o encerramento pedem `agent`; AGENDAR e CANCELAR
 * retorno pedem `ai_operator`. A distinção não é estética.
 *
 * As rotas equivalentes (`ai/followups/enrollments` POST e `.../[id]/cancel`
 * POST) exigem `manager`: um ATENDENTE humano não mexe na régua de retorno pela
 * tela. Deixar essas duas em `agent` daria à IA um poder que o produto não dá a
 * uma pessoa do mesmo papel — divergência na direção perigosa. Fechá-las em
 * `manager` tiraria do agente o que ele existe para fazer, e o invariante 4 da
 * doutrina (nenhuma demanda sem próximo passo) voltaria a ser incumprível.
 *
 * `ai_operator` resolve os dois: senta entre `agent` e `manager`, existe SÓ no
 * escopo do token efêmero e NUNCA em `user_organizations`. O agente alcança; um
 * atendente humano não; um gerente continua alcançando pela rota. A tenancy
 * segue vindo de `ctx.organizationId`, nunca do input.
 *
 * ⚠️ RECUSA DE NEGÓCIO NÃO É EXCEÇÃO. "Já existe um retorno vivo" e "esta
 * oportunidade não existe" são RESPOSTAS: o modelo precisa aprender e seguir, não
 * receber um erro que o faz tentar de novo igual. Só falha de infraestrutura sobe
 * como exceção (o wrapper do runtime a devolve como `{ error }` e o audit marca
 * a chamada como malsucedida).
 */
import { z } from "zod";

import { audit } from "@/lib/audit";
import {
  agendaRetornoNoCrm,
  cancelaRetornoNoCrm,
  listaRetornosNoCrm,
} from "@/lib/followup/retorno-crm";
import { duracaoLegivel } from "@/lib/followup/retorno";
import { ApiError } from "@/lib/api/types";
import { encerraDemanda } from "@/lib/leads/encerramento";
import { carregaRadarDeRisco } from "@/lib/leads/radar-de-risco";
import { propoeReativacao } from "@/lib/leads/reactivation";
import { resolveStageWindow } from "@/lib/leads/risk-radar";
import type { McpContext, McpToolDefinition } from "../types";

/** Payload de auditoria a partir do ator do ctx (user humano ou agente). */
function actorAudit(ctx: McpContext): {
  actorUserId: string | null;
  metadataActor: Record<string, unknown>;
} {
  if (ctx.actor.type === "user") {
    return { actorUserId: ctx.actor.id, metadataActor: { actor_type: "user" } };
  }
  return {
    actorUserId: null,
    metadataActor: { actor_type: ctx.actor.type, actor_id: ctx.actor.id },
  };
}

/** Texto de ENSINO para os alvos que não existem — o modelo corrige e segue. */
const ENSINO_DE_ALVO: Record<string, string> = {
  negocio_nao_encontrado:
    "il n’existe pas d’opportunité avec cet identifiant dans cette organisation — vérifiez avec la capacité de liste des opportunités avant de réessayer.",
  negocio_sem_contato:
    "cette opportunité n’a pas de client associé, il n’y a donc personne à recontacter. Associez un client avant de planifier un retour.",
  cliente_nao_encontrado:
    "indiquez l’identifiant de l’opportunité (lead_id) ou du client (contact_id) — l’un des deux est obligatoire et doit exister dans cette organisation.",
};

// ---------------------------------------------------------------------------
// crm_schedule_followup
// ---------------------------------------------------------------------------

const agendarShape = {
  /** Preferido: o alvo é exato e a timeline nunca cai no negócio errado. */
  lead_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  /** Instante ABSOLUTO (ISO 8601). Use quando você souber a data exata. */
  promised_at: z.string().min(1).max(64).optional(),
  /**
   * ⚠️ O CAMINHO QUE NÃO DEPENDE DE O AGENTE SABER QUE DIA É HOJE.
   *
   * Medido em turnos com modelo real: pedido "retornar daqui a três dias", um
   * modelo mandou `2023-10-13` (a data do próprio treino) e outro se RECUSOU a
   * inventar — "qual data e horário exatos devo usar?" — e o retorno não foi
   * marcado em nenhum dos dois. O runtime nunca diz ao agente que instante é
   * agora, e a capacidade exigia justamente isso.
   *
   * Com o prazo relativo, a conversão para absoluto acontece AQUI, no instante da
   * chamada, com o relógio do servidor. A doutrina da data absoluta continua
   * valendo onde ela importa: o que fica GRAVADO é o instante, não "amanhã" —
   * a promessa é lida dias depois e "amanhã" não significaria nada.
   */
  in_hours: z.number().positive().max(4_320).optional(),
  reason: z.string().min(1).max(500),
  promise: z.string().min(1).max(1_000),
  context: z.string().max(4_000).optional(),
};

export const crmScheduleFollowup: McpToolDefinition<typeof agendarShape> = {
  name: "crm_schedule_followup",
  description:
    "Planifie le retour vers le client à un moment futur. Indiquez lead_id OU contact_id. " +
    "QUAND : indiquez `in_hours` (délai à partir de maintenant — ex. : 72 pour « dans trois jours ») " +
    "OU `promised_at` (instant ISO 8601 absolu). SI VOUS NE SAVEZ PAS QUEL JOUR NOUS SOMMES, UTILISEZ " +
    "`in_hours` — c’est la bonne voie et cela n’oblige pas à deviner la date. " +
    "Un seul retour actif par client : s’il en existe déjà un, l’appel renvoie agendado=false avec le motif, " +
    "et ce n’est pas une erreur — c’est pour que vous continuiez sans doublon.",
  inputSchema: agendarShape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    // ⚠️ UM RELÓGIO SÓ para decidir E para ensinar. O modelo NÃO SABE QUE DIA É
    // HOJE — medido num turno real: pedido "daqui a três dias", ele mandou
    // `2023-10-13`, a data do treino dele. A recusa antiga dizia só "já passou",
    // que é verdade e é inútil: sem saber o agora, ele repetiu a MESMA data e
    // queimou os passos do turno. Quem recusa tem de devolver o que falta para
    // corrigir.
    const agora = new Date();

    // ⚠️ `in_hours` GANHA quando os dois vêm — e a primeira versão fazia o
    // contrário, "instante explícito é mais específico que prazo".
    //
    // A medição desmentiu: no turno real o modelo mandou os DOIS, com
    // `in_hours: 72` (a expressão fiel do que foi combinado) e um `promised_at`
    // fabricado a partir da data de criação do contato — porque ele não sabe que
    // dia é hoje. Preferir o campo explícito era preferir o palpite ao dado.
    //
    // Quem realmente conhece o instante manda só `promised_at`, e aí ele vale.
    const prometidoPara =
      input.in_hours !== undefined
        ? new Date(agora.getTime() + input.in_hours * 3_600_000).toISOString()
        : (input.promised_at ?? null);
    if (prometidoPara === null) {
      return {
        agendado: false,
        motivo: "quando_ausente",
        mensagem:
          "dites QUAND : `in_hours` (délai à partir de maintenant, ex. : 72 pour dans trois jours) " +
          "ou `promised_at` (instant ISO 8601 absolu). Si vous ne savez pas quel jour nous sommes, utilisez `in_hours`.",
      };
    }

    const resultado = await agendaRetornoNoCrm(
      {
        admin: ctx.db,
        orgId: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
        agora,
      },
      { leadId: input.lead_id ?? null, contactId: input.contact_id ?? null },
      {
        motivo: input.reason,
        prometidoPara,
        promessa: input.promise,
        contexto: input.context ?? null,
      },
    );

    if (!resultado.ok) {
      if ("janela" in resultado) {
        const { minAheadMs, maxAheadMs } = resultado.janela;
        const agoraIso = agora.toISOString();
        const cedoDemais = new Date(agora.getTime() + minAheadMs).toISOString();
        const tardeDemais = new Date(agora.getTime() + maxAheadMs).toISOString();
        const ensino: Record<string, string> = {
          instante_invalido:
            `promised_at n’est pas une date ISO 8601 valide. MAINTENANT, il est ${agoraIso} — ajoutez le délai demandé ` +
            `à cet instant et envoyez le résultat absolu (ex. : '${cedoDemais}').`,
          instante_no_passado:
            `la date indiquée est déjà passée : MAINTENANT, il est ${agoraIso}. Ajoutez le délai convenu à cet ` +
            `instant et envoyez la date absolue obtenue — ne répétez pas la même date.`,
          instante_fora_da_janela:
            `horaire hors de la plage acceptable. MAINTENANT, il est ${agoraIso}; le retour doit tomber entre ` +
            `${cedoDemais} et ${tardeDemais} (${duracaoLegivel(minAheadMs)} à ${duracaoLegivel(maxAheadMs)} à partir de maintenant).`,
          ja_existe_retorno:
            "ce client a DÉJÀ un retour planifié — n’en planifiez pas un autre (évite d’insister auprès de la même personne " +
            "plusieurs fois). Si l’horaire doit changer, annulez d’abord celui qui existe.",
        };
        return {
          agendado: false,
          motivo: resultado.codigo,
          mensagem: ensino[resultado.codigo] ?? "impossible de planifier le retour.",
          ...(resultado.existente
            ? {
                retorno_existente: {
                  id: resultado.existente.id,
                  quando: resultado.existente.quando,
                  motivo: resultado.existente.motivo,
                },
              }
            : {}),
        };
      }
      return {
        agendado: false,
        motivo: resultado.codigo,
        mensagem: ENSINO_DE_ALVO[resultado.codigo] ?? "cible introuvable.",
      };
    }

    const a = actorAudit(ctx);
    await audit({
      action: "followup.scheduled",
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: "cron_job",
      resourceId: resultado.retorno.id,
      requestId: ctx.requestId,
      metadata: {
        ...a.metadataActor,
        via: "mcp",
        contact_id: resultado.retorno.contactId,
        lead_id: resultado.alvo?.leadId ?? null,
        quando: resultado.retorno.quando,
      },
    });

    return {
      agendado: true,
      retorno_id: resultado.retorno.id,
      quando: resultado.retorno.quando,
      lead_id: resultado.alvo?.leadId ?? null,
      contact_id: resultado.retorno.contactId,
      mensagem:
        "retour planifié. Terminez le tour maintenant ; le système recontactera le client à l’horaire convenu.",
    };
  },
};

// ---------------------------------------------------------------------------
// crm_cancel_followup
// ---------------------------------------------------------------------------

const cancelarShape = {
  followup_id: z.string().uuid(),
  reason: z.string().min(1).max(200),
};

export const crmCancelFollowup: McpToolDefinition<typeof cancelarShape> = {
  name: "crm_cancel_followup",
  description:
    "Annule un retour planifié qui n’a pas encore été déclenché. À utiliser quand le client a déjà répondu ou que le " +
    "motif du retour n’existe plus — insister auprès de quelqu’un qui a déjà répondu est nuisible. " +
    "Un retour déjà déclenché ou déjà annulé renvoie cancelado=false, et ce n’est pas une erreur.",
  inputSchema: cancelarShape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const resultado = await cancelaRetornoNoCrm(
      {
        admin: ctx.db,
        orgId: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      input.followup_id,
      { motivo: input.reason },
    );

    if (!resultado.ok) {
      return {
        cancelado: false,
        motivo: resultado.codigo,
        mensagem:
          resultado.codigo === "nao_encontrado"
            ? "il n’existe pas de retour avec cet identifiant dans cette organisation."
            : "ce retour a déjà eu lieu ou avait déjà été annulé — il n’y a rien à annuler.",
        ...(resultado.existente ? { situacao: resultado.existente.situacao } : {}),
      };
    }

    const a = actorAudit(ctx);
    await audit({
      action: "followup.cancelled",
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: "cron_job",
      resourceId: resultado.retorno.id,
      requestId: ctx.requestId,
      metadata: {
        ...a.metadataActor,
        via: "mcp",
        contact_id: resultado.retorno.contactId,
        lead_id: resultado.alvo?.leadId ?? null,
      },
    });

    return {
      cancelado: true,
      retorno_id: resultado.retorno.id,
      contact_id: resultado.retorno.contactId,
      lead_id: resultado.alvo?.leadId ?? null,
    };
  },
};

// ---------------------------------------------------------------------------
// crm_list_followups
// ---------------------------------------------------------------------------

const listarShape = {
  lead_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
};

export const crmListFollowups: McpToolDefinition<typeof listarShape> = {
  name: "crm_list_followups",
  description:
    "Liste les retours d’un client (indiquez lead_id OU contact_id), du plus proche au plus " +
    "ancien. Chaque élément contient situacao : 'agendado' (va encore avoir lieu), 'disparado' (a déjà eu lieu) " +
    "ou 'cancelado' (quelqu’un l’a annulé, avec motivo_do_cancelamento). C’est ici que vous découvrez " +
    "qu’un humain a annulé le retour — si c’est le cas, NE replanifiez PAS ce même retour.",
  inputSchema: listarShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const resultado = await listaRetornosNoCrm(
      { admin: ctx.db, orgId: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      { leadId: input.lead_id ?? null, contactId: input.contact_id ?? null },
      { limite: input.limit },
    );

    if (!resultado.ok) {
      return {
        retornos: [],
        motivo: resultado.codigo,
        mensagem: ENSINO_DE_ALVO[resultado.codigo] ?? "cible introuvable.",
      };
    }

    return {
      lead_id: resultado.alvo.leadId,
      contact_id: resultado.alvo.contactId,
      retornos: resultado.retornos.map((r) => ({
        id: r.id,
        quando: r.quando,
        prometido_para: r.prometidoPara,
        situacao: r.situacao,
        motivo: r.motivo,
        promessa: r.promessa,
        cancelado_em: r.canceladoEm,
        motivo_do_cancelamento: r.motivoDoCancelamento,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// crm_list_at_risk_leads
// ---------------------------------------------------------------------------

const radarShape = {
  limit: z.number().int().min(1).max(200).default(50),
  /** Piso de horas sem movimento. Abaixo disso a demanda ainda está fresca. */
  min_hours: z.number().int().min(0).max(2000).optional(),
};

// A descrição declara `sem_proximo_passo` porque o dado chegar não basta: o
// modelo só usa o que a descrição promete. `carregaRadarDeRisco` já devolvia a
// lista desde o passo 4 do cap. 5, e sem esta linha ela viajava invisível — o
// equivalente, para o agente, de um campo que a tela recebe e não pinta.
export const crmListAtRiskLeads: McpToolDefinition<typeof radarShape> = {
  name: "crm_list_at_risk_leads",
  description:
    "Radar de risque : les opportunités OUVERTES qui ont dépassé la fenêtre de refroidissement de leur " +
    "étape. Chaque élément contient risk='critico'|'em_risco'|'em_voo' (em_voo = un retour est déjà planifié, " +
    "le système la maintient en vie), les heures sans mouvement, le responsable et la conversation. Trié par urgence. " +
    "Contient AUSSI `sem_proximo_passo` : les demandes ouvertes pour lesquelles rien n’est prévu " +
    "— chacune est quelqu’un qui attend sans perspective. Champs : contact_id, contact_name, " +
    "horas_aberta et origem. Celles-ci NE disparaissent PAS toutes seules : traitez chacune en planifiant un retour " +
    "(crm_schedule_followup avec contact_id) ou en enregistrant l’issue (crm_close_demand), " +
    "selon le cas. `total_sem_proximo_passo` doit être ramené à zéro ; c’est le seul chiffre ici dont la cible est 0.",
  inputSchema: radarShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const radar = await carregaRadarDeRisco(ctx.db, {
      organizationId: ctx.organizationId,
      limit: input.limit,
      ...(input.min_hours !== undefined ? { minHours: input.min_hours } : {}),
    });
    return radar;
  },
};

// ---------------------------------------------------------------------------
// crm_close_demand
// ---------------------------------------------------------------------------

const encerrarShape = {
  lead_id: z.string().uuid(),
  outcome: z.enum(["won", "lost"]),
  /** Obrigatório em `lost`: perder sem motivo não ensina nada a ninguém. */
  reason: z.string().min(1).max(500).optional(),
};

export const crmCloseDemand: McpToolDefinition<typeof encerrarShape> = {
  name: "crm_close_demand",
  description:
    "Clôture la demande : déplace l’opportunité vers l’étape terminale du tunnel comme gagnée " +
    "(outcome='won') ou perdue (outcome='lost', avec reason obligatoire). C’est l’autre face du " +
    "suivi : une demande ouverte a besoin d’une prochaine étape OU d’une issue enregistrée. " +
    "Idempotent — clôturer à nouveau renvoie l’état actuel sans rien modifier.",
  inputSchema: encerrarShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    try {
      const { lead, jaEstava } = await encerraDemanda(
        ctx.db,
        {
          organization_id: ctx.organizationId,
          actor: ctx.actor,
          requestId: ctx.requestId,
        },
        { leadId: input.lead_id, desfecho: input.outcome, motivo: input.reason ?? null },
      );
      return {
        encerrado: true,
        ja_estava: jaEstava,
        lead_id: input.lead_id,
        desfecho: input.outcome,
        status: (lead as { status?: string }).status ?? null,
      };
    } catch (err) {
      // ApiError aqui é sempre recusa de NEGÓCIO (não existe, funil sem estágio
      // terminal, perda sem motivo). Vira ensino; o modelo corrige e segue.
      if (err instanceof ApiError) {
        return { encerrado: false, motivo: err.code, mensagem: err.message };
      }
      throw err;
    }
  },
};

// ---------------------------------------------------------------------------
// crm_propose_reactivation
// ---------------------------------------------------------------------------

const reativacaoShape = {
  lead_id: z.string().uuid(),
};

export const crmProposeReactivation: McpToolDefinition<typeof reativacaoShape> = {
  name: "crm_propose_reactivation",
  description:
    "Crée une proposition de reprise de contact pour une opportunité qui s’est refroidie. La proposition apparaît " +
    "sur la carte de l’affaire pour qu’un humain l’approuve ; RIEN n’est envoyé au client à cause d’elle, et elle " +
    "expire toute seule si personne ne décide. Refusé s’il existe déjà une proposition active ou si l’affaire n’a pas " +
    "de client associé.",
  inputSchema: reativacaoShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const { data: lead, error } = await ctx.db
      .from("crm_leads")
      .select("id, contact_id, stage_id, status")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.lead_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) {
      return {
        proposta_criada: false,
        motivo: "negocio_nao_encontrado",
        mensagem: ENSINO_DE_ALVO.negocio_nao_encontrado,
      };
    }
    const alvo = lead as { contact_id: string | null; stage_id: string; status: string };
    if (alvo.status !== "open") {
      return {
        proposta_criada: false,
        motivo: "negocio_encerrado",
        mensagem: "cette affaire est déjà clôturée — il n’y a pas de contact à reprendre.",
      };
    }
    if (!alvo.contact_id) {
      return {
        proposta_criada: false,
        motivo: "negocio_sem_contato",
        mensagem: ENSINO_DE_ALVO.negocio_sem_contato,
      };
    }

    // A janela da proposta é a MESMA que definiu o esfriamento (cabeçalho da
    // 0082): uma proposta que vence antes ou depois do prazo do estágio faria o
    // negócio sumir do quadro num ritmo que ninguém configurou.
    const { data: stage } = await ctx.db
      .from("crm_stages")
      .select("expected_duration_hours")
      .eq("organization_id", ctx.organizationId)
      .eq("id", alvo.stage_id)
      .maybeSingle();
    const { coldHours } = resolveStageWindow(
      stage as { expected_duration_hours: number | null } | null,
    );

    const proposta = await propoeReativacao(ctx.db, {
      organizationId: ctx.organizationId,
      leadId: input.lead_id,
      coldHours,
    });
    if (!proposta) {
      // `propoeReativacao` devolve null quando já existe proposta viva (ou o
      // negócio perdeu o contato entre a checagem e a criação). Não se inventa
      // aqui um motivo mais preciso do que a função pode garantir.
      return {
        proposta_criada: false,
        motivo: "ja_existe_proposta",
        mensagem:
          "cette affaire a déjà une suggestion de reprise en attente de la décision d’une personne — n’en créez pas une autre.",
      };
    }

    const a = actorAudit(ctx);
    await audit({
      action: "lead.reactivation_proposed",
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: "crm_lead",
      resourceId: input.lead_id,
      requestId: ctx.requestId,
      metadata: { ...a.metadataActor, via: "mcp", proposta_id: proposta.id },
    });

    return {
      proposta_criada: true,
      proposta_id: proposta.id,
      lead_id: input.lead_id,
      vence_em: proposta.expiresAt.toISOString(),
      mensagem:
        "suggestion enregistrée. Une personne doit l’approuver avant que le moindre message parte vers le client.",
    };
  },
};
