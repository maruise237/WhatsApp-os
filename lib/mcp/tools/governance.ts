/**
 * MCP tools de governança de atendimento (G6-01, spec 13 §6).
 *
 * Superfície para agentes externos (Vendaval):
 *   - crm_assign_conversation — atribui/transfere/libera (reuso de fn_conversation_assign)
 *   - crm_manage_tags         — add/remove tags em conversation|contact|lead (validação G3-05)
 *   - crm_get_queue_status    — snapshot da fila da org (read-only)
 *
 * org SEMPRE do ctx (fonte confiável), NUNCA do input. Escrita → audit dedicado
 * (além do mcp.tool_called que o server core já emite). Cross-org negado: fn
 * guard INB-06a (assign) e filtro organization_id explícito (tags).
 */
import { z } from "zod";

import { audit } from "@/lib/audit";
import { conversationTagSchema, conversationTagsSchema } from "@/lib/schemas/messaging";
import { getQueueStatus } from "@/lib/routing/queue";
import type { McpContext } from "../types";
import type { McpToolDefinition } from "../types";

/** Payload de auditoria a partir do ator do ctx (user humano ou ai_agent). */
function actorAudit(ctx: McpContext): {
  actorUserId: string | null;
  metadataActor: Record<string, unknown>;
} {
  const actor = ctx.actor;
  if (actor.type === "user") {
    return { actorUserId: actor.id, metadataActor: { actor_type: "user" } };
  }
  return {
    actorUserId: null,
    metadataActor: { actor_type: actor.type, actor_id: actor.id },
  };
}

// ---------------------------------------------------------------------------
// crm_assign_conversation
// ---------------------------------------------------------------------------

const assignInputShape = {
  conversation_id: z.string().uuid(),
  /** null = release (volta à fila). */
  to_user_id: z.string().uuid().nullable().default(null),
  reason: z.enum(["transfer", "release"]).default("transfer"),
};

/** Cross-field: release ⇔ to_user_id null; transfer ⇔ to_user_id preenchido. */
const assignObject = z
  .object(assignInputShape)
  .refine((d) => (d.to_user_id === null) === (d.reason === "release"), {
    message: "release exige to_user_id null; transfer exige to_user_id.",
  });

export const crmAssignConversation: McpToolDefinition<typeof assignInputShape> = {
  name: "crm_assign_conversation",
  description:
    "Attribue/transfère une conversation à un conseiller (reason='transfer', to_user_id renseigné) " +
    "ou la remet dans la file (reason='release', to_user_id null). Enregistre un assignment event " +
    "audité. Refuse une destination d’une autre org (contrôle d’appartenance). Idempotent : si la conversation " +
    "est déjà dans l’état cible, renvoie un succès sans dupliquer l’événement.",
  inputSchema: assignInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const parsed = assignObject.parse(input);

    // Defesa em profundidade — service role bypassa RLS: a conversa TEM que ser da org.
    const { data: conv, error: convErr } = await ctx.supabase
      .from("conversations")
      .select("id, organization_id, assigned_to_user_id")
      .eq("id", parsed.conversation_id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("conversation_not_found");

    const currentOwner = conv.assigned_to_user_id ?? null;

    // Idempotência por (conversation_id, to, reason) — REPLAY (comando repetido
    // após o 1º já ter aplicado): a conversa JÁ está no dono alvo ⇒ nada a mudar,
    // retorna sucesso sem novo assignment event.
    if (currentOwner === parsed.to_user_id) {
      return {
        assigned: true,
        conversation_id: parsed.conversation_id,
        assigned_to_user_id: parsed.to_user_id,
        reason: parsed.reason,
        idempotent: true,
      };
    }

    // fn_conversation_assign: UPDATE + assignment event na MESMA transação; RAISE
    // (guard INB-06a) se destino não é membro ativo da org. p_enforce_expected=
    // true com o dono que ACABAMOS de ler ⇒ optimistic lock: sob CORRIDA (dois
    // assigns idênticos leem o mesmo dono antigo), o 1º vence (1 evento) e o 2º
    // vê o dono já mudado (v_from ≠ expected) ⇒ 0 rows, SEM evento duplicado.
    const { data: rows, error: assignErr } = await ctx.supabase.rpc("fn_conversation_assign", {
      p_organization_id: ctx.organizationId,
      p_conversation_id: parsed.conversation_id,
      p_to_user_id: parsed.to_user_id,
      p_reason: parsed.reason,
      p_expected_assignee: currentOwner,
      p_enforce_expected: true,
    });
    if (assignErr) throw new Error(assignErr.message);
    if (!Array.isArray(rows) || rows.length === 0) {
      // 0 rows = perdeu o optimistic lock. Re-lê: se o dono já é o alvo, foi a
      // corrida idêntica (sibling aplicou) ⇒ idempotente. Senão, outro assign
      // concorrente venceu com destino diferente ⇒ conflito.
      const { data: recheck } = await ctx.supabase
        .from("conversations")
        .select("assigned_to_user_id")
        .eq("id", parsed.conversation_id)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (recheck && (recheck.assigned_to_user_id ?? null) === parsed.to_user_id) {
        return {
          assigned: true,
          conversation_id: parsed.conversation_id,
          assigned_to_user_id: parsed.to_user_id,
          reason: parsed.reason,
          idempotent: true,
        };
      }
      throw new Error("assignment_conflict");
    }

    const a = actorAudit(ctx);
    await audit({
      action: parsed.reason === "release" ? "conversation.released" : "conversation.transferred",
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: "conversation",
      resourceId: parsed.conversation_id,
      requestId: ctx.requestId,
      metadata: { ...a.metadataActor, to_user_id: parsed.to_user_id, reason: parsed.reason, via: "mcp" },
    });

    return {
      assigned: true,
      conversation_id: parsed.conversation_id,
      assigned_to_user_id: parsed.to_user_id,
      reason: parsed.reason,
      idempotent: false,
    };
  },
};

// ---------------------------------------------------------------------------
// crm_manage_tags
// ---------------------------------------------------------------------------

const TAG_TARGET_TABLE = {
  conversation: "conversations",
  contact: "contacts",
  lead: "crm_leads",
} as const;

const TAG_AUDIT_ACTION = {
  conversation: "conversation.tags_changed",
  contact: "contact.tags_changed",
  lead: "lead.tags_changed",
} as const;

const tagsInputShape = {
  target_kind: z.enum(["conversation", "contact", "lead"]),
  target_id: z.string().uuid(),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
};

export const crmManageTags: McpToolDefinition<typeof tagsInputShape> = {
  name: "crm_manage_tags",
  description:
    "Ajoute/retire des tags sur une conversation, un contact ou un lead. Les tags sont normalisés " +
    "(lowercase, trim, ≤40 caractères chacun, ≤20 au total). Indiquez au moins un add/remove. " +
    "Refuse une cible d’une autre org.",
  inputSchema: tagsInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const addTags = (input.add ?? []).map((t) => conversationTagSchema.parse(t));
    const removeTags = new Set((input.remove ?? []).map((t) => conversationTagSchema.parse(t)));
    if (addTags.length === 0 && removeTags.size === 0) {
      throw new Error("indiquez au moins un tag dans add ou remove");
    }

    const table = TAG_TARGET_TABLE[input.target_kind];

    const { data: row, error: fetchErr } = await ctx.supabase
      .from(table)
      .select("id, tags")
      .eq("id", input.target_id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("target_not_found");

    const current = ((row as { tags: string[] | null }).tags ?? []).map((t) => t);
    const merged = [...current, ...addTags].filter((t) => !removeTags.has(t));
    // Dedup + teto de 20 (rejeita se estourar) — mesma validação da G3-05.
    const nextTags = conversationTagsSchema.parse(merged);

    const { error: updateErr } = await ctx.supabase
      .from(table)
      .update({ tags: nextTags })
      .eq("id", input.target_id)
      .eq("organization_id", ctx.organizationId);
    if (updateErr) throw new Error(updateErr.message);

    const a = actorAudit(ctx);
    await audit({
      action: TAG_AUDIT_ACTION[input.target_kind],
      actorUserId: a.actorUserId,
      actorApiTokenId: ctx.apiTokenId,
      organizationId: ctx.organizationId,
      resourceType: input.target_kind,
      resourceId: input.target_id,
      requestId: ctx.requestId,
      metadata: { ...a.metadataActor, tags: nextTags, via: "mcp" },
    });

    return { target_kind: input.target_kind, target_id: input.target_id, tags: nextTags };
  },
};

// ---------------------------------------------------------------------------
// crm_get_queue_status
// ---------------------------------------------------------------------------

const queueInputShape = {};

export const crmGetQueueStatus: McpToolDefinition<typeof queueInputShape> = {
  name: "crm_get_queue_status",
  description:
    "Instantané de la file d’attente de l’org : queue_size (conversations sans responsable et ouvertes), " +
    "avg_wait_seconds (attente moyenne depuis le dernier message du client) et " +
    "online_eligible_count (conseillers pouvant prendre dans la file maintenant). Lecture seule.",
  inputSchema: queueInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (_input, ctx) => {
    return getQueueStatus(ctx.supabase, ctx.organizationId, new Date());
  },
};
