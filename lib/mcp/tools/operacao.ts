/**
 * Capacidades de ORGANIZAR A OPERAÇÃO — funil, marcadores, respostas prontas,
 * entradas automáticas de contatos, regras automáticas e time (épico IA 360, W4).
 *
 * O agente atendia dentro de uma estrutura que não podia ajustar nem explicar:
 * zero capacidades sobre `webhook_sources` e `automation_rules`, e nem sequer
 * criar uma etapa de funil.
 *
 * ⚠️ TODA REGRA VIVE EM `lib/operacao/` E `lib/leads/stage-operations.ts`. Aqui
 * há tradução de argumento e nada mais — as mesmas funções servem as rotas REST
 * (BRIEFING §3, Decisão 4). Se você está prestes a escrever um `.from(...)` neste
 * arquivo, a regra está no lugar errado.
 *
 * ⚠️ A ORGANIZAÇÃO SAI SEMPRE DE `ctx.organizationId`, NUNCA DO INPUT. O client
 * do contexto é service-role e bypassa RLS; o filtro explícito por organização
 * está dentro de cada função de `lib/operacao/` e é a única coisa que separa os
 * tenants aqui.
 *
 * ⚠️ O QUE ESTE ARQUIVO DELIBERADAMENTE **NÃO** DÁ AO AGENTE: criar/editar/apagar
 * regra automática (ele liga e desliga o que um humano escreveu, nunca escolhe
 * para onde a empresa manda dados), mudar papel de ninguém, apagar entrada
 * automática, e criar resposta pronta. Ver o cabeçalho de cada módulo de
 * `lib/operacao/` para o porquê de cada uma.
 */
import { z } from "zod";

import { createAdminClient } from "@/lib/db/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { ApiError } from "@/lib/api/types";
import {
  arquivarEtapa,
  atualizarEtapa,
  criarEtapa,
  lerFunil,
  corpo as corpoDoFunil,
} from "@/lib/leads/stage-operations";
import {
  criarEntradaAutomatica,
  definirEntradaAtiva,
  listarEntradasAutomaticas,
  recebimentosDaEntrada,
  type DepsDaOperacao,
} from "@/lib/operacao/entradas-automaticas";
import { listarMarcadores, listarTime } from "@/lib/operacao/marcadores-e-time";
import {
  listarModelosDeMensagem,
  preencherModeloDeMensagem,
} from "@/lib/operacao/modelos-de-mensagem";
import {
  definirRegraAtiva,
  execucoesDasRegras,
  listarRegrasAutomaticas,
} from "@/lib/operacao/regras-automaticas";
import type { McpContext, McpToolDefinition } from "../types";

/** O contexto MCP traduzido para o que as operações pedem. */
function deps(ctx: McpContext): DepsDaOperacao {
  return {
    db: ctx.db,
    organizationId: ctx.organizationId,
    actor: ctx.actor,
    requestId: ctx.requestId,
  };
}

// ---------------------------------------------------------------------------
// funil e etapas
// ---------------------------------------------------------------------------

const listStagesShape = {
  pipeline_id: z.string().uuid(),
};

export const crmListStages: McpToolDefinition<typeof listStagesShape> = {
  name: "crm_list_stages",
  description:
    "Liste les étapes actives d’un pipeline, dans l’ordre du tableau, avec id, name, slug, position, " +
    "is_won/is_lost et l’auteur du dernier changement de configuration (last_change_actor_kind : user|ai|system). " +
    "À utiliser avant de déplacer un lead ou de créer une nouvelle étape, pour ne pas dupliquer une colonne existante.",
  inputSchema: listStagesShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const etapas = await lerFunil(ctx.db, ctx.organizationId, input.pipeline_id);
    if (!etapas) {
      throw new ApiError(404, "not_found", undefined, ctx.requestId, "Tableau introuvable.");
    }
    return corpoDoFunil(etapas);
  },
};

const createStageShape = {
  pipeline_id: z.string().uuid(),
  name: z.string().min(1).max(80),
};

export const crmCreateStage: McpToolDefinition<typeof createStageShape> = {
  name: "crm_create_stage",
  description:
    "Crée une étape à la FIN du pipeline indiqué. Le slug et la position sont calculés par le serveur. " +
    "Refuse un nom que l’utilisateur lirait comme un doublon (ignore les accents et la casse). Ne crée pas d’étape de gain/perte — " +
    "pour cela, utilisez ensuite crm_update_stage.",
  inputSchema: createStageShape,
  category: "write",
  requiresRole: "manager",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const { stageId, funil } = await criarEtapa(deps(ctx), {
      pipelineId: input.pipeline_id,
      nome: input.name,
    });
    return { stage_id: stageId, ...funil };
  },
};

const updateStageShape = {
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  name: z.string().min(1).max(80).optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
  /** Id da etapa VIZINHA DA ESQUERDA; `null` = primeira coluna. Não é posição numérica. */
  after_stage_id: z.string().uuid().nullable().optional(),
};

export const crmUpdateStage: McpToolDefinition<typeof updateStageShape> = {
  name: "crm_update_stage",
  description:
    "Renomme, réordonne ou change le rôle de clôture (is_won/is_lost) d’une étape. " +
    "after_stage_id est l’id de l’étape VOISINE DE GAUCHE (null = première colonne), pas un numéro de position. " +
    "Déplacer le marqueur de gain/perte vers une autre étape est autorisé ; le RETIRER sans remplaçante ne l’est pas — " +
    "le pipeline n’aurait plus où conclure une affaire.",
  inputSchema: updateStageShape,
  category: "write",
  requiresRole: "manager",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const pedido: Parameters<typeof atualizarEtapa>[1]["pedido"] = {};
    if (input.name !== undefined) pedido.name = input.name;
    if (input.is_won !== undefined) pedido.is_won = input.is_won;
    if (input.is_lost !== undefined) pedido.is_lost = input.is_lost;
    if (input.after_stage_id !== undefined) pedido.depois_de = input.after_stage_id;
    if (Object.keys(pedido).length === 0) {
      throw new ApiError(
        422,
        "unprocessable_entity",
        undefined,
        ctx.requestId,
        "Indiquez ce qu’il faut changer dans l’étape : le nom, l’ordre ou son rôle dans la clôture de l’affaire.",
      );
    }
    const { funil } = await atualizarEtapa(deps(ctx), {
      pipelineId: input.pipeline_id,
      stageId: input.stage_id,
      pedido,
    });
    return funil;
  },
};

const archiveStageShape = {
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  /** Para onde vão os leads que estão nela. Obrigatório se a etapa não estiver vazia. */
  move_leads_to_stage_id: z.string().uuid().nullable().default(null),
};

export const crmArchiveStage: McpToolDefinition<typeof archiveStageShape> = {
  name: "crm_archive_stage",
  description:
    "Archive une étape (ne supprime jamais — crm_leads_stage_id_fkey est ON DELETE RESTRICT et l’historique pointe vers elle). " +
    "Exige move_leads_to_stage_id quand l’étape contient des leads ; la destination ne peut être ni l’étape de gain ni celle de perte " +
    "(cela clôturerait les affaires). Chaque lead déplacé reçoit une activité dans sa propre chronologie expliquant pourquoi.",
  inputSchema: archiveStageShape,
  category: "write",
  requiresRole: "manager",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const { funil, negociosMovidos } = await arquivarEtapa(deps(ctx), {
      pipelineId: input.pipeline_id,
      stageId: input.stage_id,
      destinoId: input.move_leads_to_stage_id,
    });
    return { leads_movidos: negociosMovidos, ...funil };
  },
};

// ---------------------------------------------------------------------------
// marcadores
// ---------------------------------------------------------------------------

const listTagsShape = {
  limit: z.number().int().min(1).max(200).default(60),
};

export const crmListTags: McpToolDefinition<typeof listTagsShape> = {
  name: "crm_list_tags",
  description:
    "Liste les marqueurs (tags) que l’organisation utilise déjà, avec le nombre de conversations de chacun et s’il fait partie du " +
    "vocabulaire canonique de l’org. Appelez-le AVANT crm_manage_tags : appliquer 'client-vip' alors que 'vip' existe déjà " +
    "casse les filtres de ceux qui travaillent. Trié du plus utilisé au moins utilisé.",
  inputSchema: listTagsShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    return { marcadores: await listarMarcadores(deps(ctx), { limite: input.limit }) };
  },
};

// ---------------------------------------------------------------------------
// respostas prontas
// ---------------------------------------------------------------------------

const listTemplatesShape = {};

export const crmListMessageTemplates: McpToolDefinition<typeof listTemplatesShape> = {
  name: "crm_list_message_templates",
  description:
    "Liste les réponses rapides de l’organisation : titre, corps avec les balises {{...}}, " +
    "raccourci et si elle est partagée ou personnelle. À utiliser quand l’entreprise a déjà décidé comment dire quelque chose, au lieu d’écrire de zéro.",
  inputSchema: listTemplatesShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (_input, ctx) => {
    return { modelos: await listarModelosDeMensagem(deps(ctx)) };
  },
};

const renderTemplateShape = {
  template_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
};

export const crmRenderMessageTemplate: McpToolDefinition<typeof renderTemplateShape> = {
  name: "crm_render_message_template",
  description:
    "Remplit une réponse rapide avec les données du contact/lead indiquées et renvoie le TEXTE — n’envoie rien. " +
    "Renvoie aussi `lacunas` : les balises restées sans valeur. S’il y a une lacune, N’envoyez PAS le texte tel quel : " +
    "'Bonjour , comment allez-vous ?' arriverait ainsi chez le client.",
  inputSchema: renderTemplateShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    return preencherModeloDeMensagem(deps(ctx), {
      templateId: input.template_id,
      contactId: input.contact_id,
      leadId: input.lead_id,
    });
  },
};

// ---------------------------------------------------------------------------
// entradas automáticas de contatos (webhook_sources)
// ---------------------------------------------------------------------------

const listSourcesShape = {
  only_active: z.boolean().default(false),
};

export const crmListWebhookSources: McpToolDefinition<typeof listSourcesShape> = {
  name: "crm_list_webhook_sources",
  description:
    "Liste les entrées automatiques de contacts de l’org : nom, si elle est active, vers quel pipeline/stage " +
    "elle envoie, quand elle a reçu pour la dernière fois et l’auteur du dernier changement. Le secret ne sort jamais — seulement `has_secret`.",
  inputSchema: listSourcesShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    return { entradas: await listarEntradasAutomaticas(deps(ctx), { apenasAtivas: input.only_active }) };
  },
};

const sourceEventsShape = {
  source_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(20),
};

export const crmListWebhookSourceEvents: McpToolDefinition<typeof sourceEventsShape> = {
  name: "crm_list_webhook_source_events",
  description:
    "Dernières réceptions d’une entrée automatique : quand elles sont arrivées, si la signature était valide, le statut et les NOMS " +
    "des champs reçus. Les VALEURS ne sont pas renvoyées (ce sont des données personnelles de la personne qui a rempli le formulaire) — " +
    "pour diagnostiquer « le site envoie full_name et l’entrée attend name », les noms suffisent.",
  inputSchema: sourceEventsShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    return {
      recebimentos: await recebimentosDaEntrada(deps(ctx), {
        id: input.source_id,
        limite: input.limit,
      }),
    };
  },
};

const createSourceShape = {
  name: z.string().min(1).max(120),
  default_pipeline_id: z.string().uuid(),
  default_stage_id: z.string().uuid(),
  /** Segredo opcional de assinatura. Cifrado no servidor; nunca volta em leitura. */
  secret: z.string().min(16).max(200).optional(),
};

export const crmCreateWebhookSource: McpToolDefinition<typeof createSourceShape> = {
  name: "crm_create_webhook_source",
  description:
    "Crée une entrée automatique de contacts et renvoie le path_token de l’URL de captation. " +
    "Le pipeline et le stage doivent appartenir à la MÊME organisation et le stage doit appartenir au pipeline ; " +
    "un stage archivé est refusé (les contacts tomberaient dans une colonne hors du tableau). " +
    "L’entrée est créée ACTIVE : dès lors, tout POST sur l’URL devient un contact.",
  inputSchema: createSourceShape,
  category: "write",
  requiresRole: "manager",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    // Segredo nunca fica em claro no banco (migration 0041). Sem chave de cifra
    // configurada, RECUSA em vez de degradar para plaintext — mesma decisão da rota.
    let secretEncrypted: string | null = null;
    if (input.secret) {
      secretEncrypted = await encryptWebhookSecret(createAdminClient(), input.secret);
      if (secretEncrypted === null) {
        throw new ApiError(
          422,
          "encryption_unavailable",
          undefined,
          ctx.requestId,
          "Impossible de stocker le secret de façon sécurisée. Créez l’entrée sans secret ou demandez de configurer la clé de chiffrement de la base.",
        );
      }
    }

    return criarEntradaAutomatica(deps(ctx), {
      name: input.name,
      default_pipeline_id: input.default_pipeline_id,
      default_stage_id: input.default_stage_id,
      secret_encrypted: secretEncrypted,
    });
  },
};

const setSourceActiveShape = {
  source_id: z.string().uuid(),
  is_active: z.boolean(),
};

export const crmSetWebhookSourceActive: McpToolDefinition<typeof setSourceActiveShape> = {
  name: "crm_set_webhook_source_active",
  description:
    "Active ou désactive une entrée automatique de contacts. La désactiver fait que le formulaire déjà publié sur le site du " +
    "client CESSE immédiatement de créer des contacts — personne n’est prévenu de l’autre côté. Confirmez avec un humain avant de désactiver.",
  inputSchema: setSourceActiveShape,
  category: "write",
  requiresRole: "manager",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    return definirEntradaAtiva(deps(ctx), { id: input.source_id, ativa: input.is_active });
  },
};

// ---------------------------------------------------------------------------
// regras automáticas (automation_rules)
// ---------------------------------------------------------------------------

const listRulesShape = {
  only_active: z.boolean().default(false),
};

export const crmListAutomationRules: McpToolDefinition<typeof listRulesShape> = {
  name: "crm_list_automation_rules",
  description:
    "Liste les règles automatiques de l’org : nom, si elle est active, quel événement la déclenche, les TYPES d’action qu’elle exécute, " +
    "combien de conditions elle a, quand elle a tourné pour la dernière fois et combien de fois. La configuration des actions (URL de destination, " +
    "secret, texte) n’est pas renvoyée.",
  inputSchema: listRulesShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    return { regras: await listarRegrasAutomaticas(deps(ctx), { apenasAtivas: input.only_active }) };
  },
};

const listRunsShape = {
  rule_id: z.string().uuid().optional(),
  only_failures: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
};

export const crmListAutomationRuns: McpToolDefinition<typeof listRunsShape> = {
  name: "crm_list_automation_runs",
  description:
    "Historique de ce que les règles automatiques ont déclenché (plus récents d’abord) : quelle règle, statut " +
    "(success|partial|failed), quand, et le détail UNIQUEMENT des actions en échec. Utilisez only_failures=true pour répondre à " +
    "« qu’est-ce qui a cessé de fonctionner ? ». Sans rule_id, renvoie toute l’org.",
  inputSchema: listRunsShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    return {
      execucoes: await execucoesDasRegras(deps(ctx), {
        ruleId: input.rule_id,
        limite: input.limit,
        apenasFalhas: input.only_failures,
      }),
    };
  },
};

const setRuleActiveShape = {
  rule_id: z.string().uuid(),
  is_active: z.boolean(),
};

export const crmSetAutomationRuleActive: McpToolDefinition<typeof setRuleActiveShape> = {
  name: "crm_set_automation_rule_active",
  description:
    "Active ou désactive une règle automatique. L’ACTIVER fait tourner la règle toute seule sur CHAQUE événement correspondant, indéfiniment, " +
    "sans surveillance — et les actions peuvent envoyer un message au client ou envoyer des données hors de l’entreprise. " +
    "Vérifiez les actions avec crm_list_automation_rules avant, et confirmez avec un humain. " +
    "Créer, modifier et supprimer une règle n’est pas possible ici, volontairement.",
  inputSchema: setRuleActiveShape,
  category: "write",
  requiresRole: "manager",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    return definirRegraAtiva(deps(ctx), { id: input.rule_id, ativa: input.is_active });
  },
};

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

const listTeamShape = {};

export const crmListTeamMembers: McpToolDefinition<typeof listTeamShape> = {
  name: "crm_list_team_members",
  description:
    "Liste les personnes qui travaillent dans l’organisation : user_id, rôle (viewer|agent|manager|admin) et si l’invitation est encore en attente. " +
    "C’est le user_id que consomme crm_assign_conversation. Ne renvoie ni e-mail ni nom — l’agent doit savoir à qui " +
    "s’adresser, pas l’identité personnelle de chacun. Lecture seule : changer de rôle n’est pas possible ici.",
  inputSchema: listTeamShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (_input, ctx) => {
    return { time: await listarTime(deps(ctx)) };
  },
};
