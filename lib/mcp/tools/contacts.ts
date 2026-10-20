/**
 * MCP read tools sobre /api/v1/contacts (Spec 11 §3.1).
 *
 * Wrappa os handlers REST extraidos na wave 2 (S-13.02). O MCP server core
 * injeta `ctx.supabase` (admin client + service-role) e `ctx.organizationId`
 * — handlers ja aplicam `.eq('organization_id', ctx.organization_id)` em
 * defesa-em-profundidade pos wave 3 (RLS continua valida quando ctx vem
 * de cookie).
 */
import { z } from "zod";

import {
  listContactsHandler,
  getContactHandler,
} from "@/app/api/v1/contacts/_handler";
import type { McpToolDefinition } from "../types";
import { CAMPOS_PROPONIVEIS, proporDadoDoContato } from "@/lib/contacts/proposta-de-dado";
import { audit } from "@/lib/audit";

const searchInputShape = {
  query: z.string().min(1).max(200).describe("Terme de recherche (nom, e-mail ou téléphone)."),
  limit: z.number().int().min(1).max(50).default(10),
  cursor: z.string().optional(),
};

export const crmSearchContacts: McpToolDefinition<typeof searchInputShape> = {
  name: "crm_search_contacts",
  description:
    "Recherche des contacts du CRM par nom, e-mail ou téléphone. Renvoie jusqu’à 50 résultats avec id, nom, téléphone, e-mail, tags et horodatages. Toujours limité à l’organisation du jeton.",
  inputSchema: searchInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const result = await listContactsHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      {
        search: input.query,
        limit: input.limit,
        cursor: input.cursor,
      },
    );
    return {
      contacts: result.contacts.map((c) => ({
        id: c.id,
        name: c.display_name ?? c.name,
        phone: c.phone_number,
        email: c.email,
        tags: c.tags ?? [],
        is_blocked: c.is_blocked,
        is_anonymized: c.is_anonymized,
        created_at: c.created_at,
        last_activity_at: c.last_activity_at,
      })),
      cursor: result.cursor,
      has_more: result.has_more,
    };
  },
};

const getInputShape = {
  contact_id: z.string().uuid().describe("UUID du contact."),
};

export const crmGetContact: McpToolDefinition<typeof getInputShape> = {
  name: "crm_get_contact",
  description:
    "Renvoie les détails d’un contact par son UUID. Inclut tags, consent, source. Le CPF n’est jamais renvoyé en clair via MCP (toujours masqué).",
  inputSchema: getInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const contact = await getContactHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      { contactId: input.contact_id, decryptPurpose: null },
    );
    return {
      id: contact.id,
      name: contact.name,
      display_name: contact.display_name,
      email: contact.email,
      phone: contact.phone_number,
      tags: contact.tags ?? [],
      source: contact.source,
      consent: contact.consent ?? {},
      is_blocked: contact.is_blocked,
      is_anonymized: contact.is_anonymized,
      cpf_available: contact.cpf_available,
      created_at: contact.created_at,
      last_activity_at: contact.last_activity_at,
    };
  },
};

// ---------------------------------------------------------------------------
// crm_propose_contact_field — o dado que o cliente disse, PROPOSTO
// ---------------------------------------------------------------------------

const propostaShape = {
  contact_id: z.string().uuid(),
  campo: z.enum(CAMPOS_PROPONIVEIS).describe("Quelle information : email, name ou phone_number."),
  valor: z.string().min(1).max(200).describe("La valeur exactement telle que la personne l’a indiquée."),
  trecho: z
    .string()
    .max(500)
    .optional()
    .describe("Ce que la personne a écrit, pour que celui qui confirme puisse vérifier."),
};

/**
 * ⚠️ Esta ferramenta NÃO grava o dado. Ela cria uma proposta que uma pessoa
 * confirma — e o `description` diz isso ao modelo em primeiro lugar, de
 * propósito: um modelo que acredite ter gravado responderia "pronto, já
 * atualizei seu cadastro" ao cliente, prometendo o que não aconteceu.
 *
 * Ela é de CATÁLOGO, e não nativa do Operador, porque o Operador não monta
 * ToolSet nativo nenhum (zero ocorrências de `tool(` em operator-turn.ts) e só
 * chama o modelo quando há MCP. Uma nativa não apareceria na tela que liga
 * capacidades, não entraria no audit `mcp.tool_called` e sumiria da telemetria
 * de uso — nasceria invisível ao invariante 3 do sistema vivo.
 */
export const crmProposeContactField: McpToolDefinition<typeof propostaShape> = {
  name: "crm_propose_contact_field",
  description:
    "Enregistre une information fournie par le client (e-mail, nom ou téléphone) comme PROPOSITION " +
    "à confirmer par une personne. RIEN n’est écrit dans la fiche par cet appel, et la proposition expire " +
    "toute seule si personne ne décide. Ne dites jamais au client que sa fiche a été mise à jour. Refusé s’il " +
    "existe déjà une proposition pour le même champ en attente de décision, si la valeur est identique à celle déjà " +
    "enregistrée, ou si le contact a été anonymisé.",
  inputSchema: propostaShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const r = await proporDadoDoContato(ctx.supabase, {
      organizationId: ctx.organizationId,
      contactId: input.contact_id,
      campo: input.campo,
      valor: input.valor,
      trecho: input.trecho ?? null,
    });

    if (!r.criada) {
      // As mensagens são para o MODELO decidir o que fazer em seguida — e
      // nenhuma delas é para repetir ao cliente. Falam do fluxo interno, não do
      // atendimento.
      const explicacao: Record<string, string> = {
        contato_nao_encontrado: "je n’ai pas trouvé ce contact sur ce compte.",
        contato_anonimizado:
          "ce contact a exercé son droit à l’effacement des données ; impossible d’enregistrer des informations le concernant.",
        valor_invalido: "la valeur n’a pas la forme d’un e-mail/téléphone/nom valide — confirmez avec la personne.",
        valor_igual_ao_atual: "cette information figure déjà dans la fiche ; il n’y a rien à confirmer.",
        ja_existe_proposta:
          "une proposition pour ce même champ attend déjà la décision d’une personne — n’en créez pas une autre.",
        erro: "je n’ai pas pu enregistrer la proposition pour le moment.",
      };
      return { proposta_criada: false, motivo: r.motivo, mensagem: explicacao[r.motivo] };
    }

    // Mesmo payload de ator das outras tools de escrita. Inline porque
    // `retencao.ts` mantém o dele local — extrair para um módulo comum tocaria
    // um arquivo alheio sem que este trabalho peça isso.
    const a =
      ctx.actor.type === "user"
        ? { actorUserId: ctx.actor.id as string | null, metadataActor: { actor_type: "user" } }
        : { actorUserId: null, metadataActor: { actor_type: ctx.actor.type, actor_id: ctx.actor.id } };
    await audit({
      action: "contact.field_proposed",
      actorUserId: a.actorUserId,
      organizationId: ctx.organizationId,
      resourceType: "contact",
      resourceId: input.contact_id,
      requestId: ctx.requestId,
      // O par antes/depois desde a PROPOSTA, mesma grafia de `team.role_changed`.
      // A proposta é uma intenção auditável mesmo que nunca vire escrita.
      metadata: {
        ...a.metadataActor,
        proposal_id: r.id,
        campo: input.campo,
        old_value: r.valorAnterior,
        new_value: input.valor,
      },
    });

    return {
      proposta_criada: true,
      proposta_id: r.id,
      campo: input.campo,
      aguardando: "confirmation par une personne",
    };
  },
};
