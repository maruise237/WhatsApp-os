/**
 * MCP tools sobre /api/v1/leads (Spec 11 §3.1, §3.2).
 *
 *  Read:
 *   - crm_list_leads
 *   - crm_get_lead
 *  Write:
 *   - crm_create_lead
 *   - crm_update_lead
 *   - crm_move_lead_stage  (sem mirror REST direto; reusa moveLeadHandler)
 *
 * Write tools exigem role>=manager + scope mcp:write (gate no server core).
 */
import { z } from "zod";

import {
  listLeadsHandler,
  getLeadHandler,
  createLeadHandler,
  updateLeadHandler,
  moveLeadHandler,
} from "@/app/api/v1/leads/_handler";
import { createLeadSchema, updateLeadSchema } from "@/lib/schemas/leads";
import { resolveUserNames } from "./_users";
import type { McpContext, McpToolDefinition } from "../types";

/**
 * Enriquece rows de lead com os campos de governança aditivos (G6-03):
 * `owner_user_name` (só o nome — LGPD) e `stage` ({ id, name }, o label legível
 * que o get_lead_context compõe). owner_user_id, stage_id, status e tags[] já
 * vêm na row (`select *`); nada existente muda. Dedupe de owners e stages —
 * sem N+1 numa listagem.
 */
async function enrichLeads(
  ctx: McpContext,
  leads: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  if (leads.length === 0) return leads;

  const names = await resolveUserNames(
    ctx.db,
    leads.map((l) => l.owner_user_id as string | null),
  );

  const stageIds = [
    ...new Set(leads.map((l) => l.stage_id).filter((id): id is string => Boolean(id))),
  ];
  const stageById = new Map<string, { id: string; name: string }>();
  if (stageIds.length > 0) {
    const { data } = await ctx.db
      .from("crm_stages")
      .select("id, name")
      .eq("organization_id", ctx.organizationId)
      .in("id", stageIds);
    for (const s of (data ?? []) as Array<{ id: string; name: string }>) {
      stageById.set(s.id, { id: s.id, name: s.name });
    }
  }

  return leads.map((l) => ({
    ...l,
    owner_user_name: l.owner_user_id
      ? (names.get(l.owner_user_id as string) ?? null)
      : null,
    stage: l.stage_id ? (stageById.get(l.stage_id as string) ?? null) : null,
  }));
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

const listInputShape = {
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  status: z.enum(["open", "won", "lost"]).optional(),
  owner_user_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
};

export const crmListLeads: McpToolDefinition<typeof listInputShape> = {
  name: "crm_list_leads",
  description:
    "Liste les leads du CRM filtrés par pipeline, stage, status et owner. Curseur base64 pour la pagination. " +
    "Gouvernance par lead : owner_user_id + owner_user_name (uniquement le nom du responsable, sans e-mail/téléphone), stage ({ id, name } lisible en plus du stage_id) et tags[].",
  inputSchema: listInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const result = await listLeadsHandler(
      ctx.db,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      {
        pipeline_id: input.pipeline_id,
        stage_id: input.stage_id,
        status: input.status,
        owner_user_id: input.owner_user_id,
        limit: input.limit,
        cursor: input.cursor,
      },
    );
    return {
      leads: await enrichLeads(ctx, result.leads),
      cursor: result.cursor,
      has_more: result.has_more,
    };
  },
};

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

const getInputShape = {
  lead_id: z.string().uuid(),
};

export const crmGetLead: McpToolDefinition<typeof getInputShape> = {
  name: "crm_get_lead",
  description:
    "Renvoie un lead par son UUID. Inclut pipeline_id, stage_id, status, owner. " +
    "Gouvernance : owner_user_id + owner_user_name (uniquement le nom, sans e-mail/téléphone), stage ({ id, name } lisible) et tags[].",
  inputSchema: getInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const lead = await getLeadHandler(
      ctx.db,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      input.lead_id,
    );
    if ((lead as { organization_id?: string }).organization_id !== ctx.organizationId) {
      // Defesa em profundidade — service-role bypassa RLS.
      throw new Error("not_found");
    }
    const [enriched] = await enrichLeads(ctx, [lead]);
    return { lead: enriched };
  },
};

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

const createInputShape = {
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  contact_id: z.string().uuid().optional(),
  value_cents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  owner_user_id: z.string().uuid().optional(),
  /** 0070: o agente pode nascer dono do negócio que ele mesmo abriu. */
  owner_agent_id: z.string().uuid().optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
};

export const crmCreateLead: McpToolDefinition<typeof createInputShape> = {
  name: "crm_create_lead",
  description:
    "Crée un lead dans le pipeline indiqué. À utiliser après avoir qualifié un contact. La position est gérée par le serveur.",
  inputSchema: createInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const parsed = createLeadSchema.parse({
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      title: input.title,
      description: input.description ?? null,
      contact_id: input.contact_id ?? null,
      value_cents: input.value_cents ?? null,
      currency: input.currency ?? "XAF",
      owner_user_id: input.owner_user_id ?? null,
      owner_agent_id: input.owner_agent_id ?? null,
      expected_close_date: input.expected_close_date ?? null,
      tags: input.tags ?? [],
      source: input.source ?? "ai_agent",
    });
    const lead = await createLeadHandler(
      ctx.db,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      parsed,
    );
    return { lead };
  },
};

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

const updateInputShape = {
  lead_id: z.string().uuid(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  contact_id: z.string().uuid().optional(),
  value_cents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  owner_user_id: z.string().uuid().optional(),
  /** 0070: transferir o negócio para (ou de) um agente — passa pelo mesmo helper. */
  owner_agent_id: z.string().uuid().optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tags: z.array(z.string()).optional(),
};

export const crmUpdateLead: McpToolDefinition<typeof updateInputShape> = {
  name: "crm_update_lead",
  description:
    "Met à jour les champs modifiables d’un lead. Les changements d’étape passent par crm_move_lead_stage ; le statut est géré par des triggers.",
  inputSchema: updateInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const { lead_id, ...rest } = input;
    const parsed = updateLeadSchema.parse(rest);
    const lead = await updateLeadHandler(
      ctx.db,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      lead_id,
      parsed,
    );
    return { lead };
  },
};

// ---------------------------------------------------------------------------
// move stage
// ---------------------------------------------------------------------------

const moveInputShape = {
  lead_id: z.string().uuid(),
  to_stage_id: z.string().uuid(),
  position_in_stage: z.number().finite().optional(),
  reason: z.string().max(500).optional(),
};

export const crmMoveLeadStage: McpToolDefinition<typeof moveInputShape> = {
  name: "crm_move_lead_stage",
  description:
    "Déplace un lead vers une autre étape du MÊME pipeline. Le changement de pipeline est interdit (utilisez un clone). L’audit enregistre l’étape from/to et la reason.",
  inputSchema: moveInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const lead = await moveLeadHandler(
      ctx.db,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      input.lead_id,
      {
        to_stage_id: input.to_stage_id,
        position_in_stage: input.position_in_stage,
        reason: input.reason,
      },
    );
    return { lead };
  },
};
