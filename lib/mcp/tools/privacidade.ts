/**
 * Capacidades de PRIVACIDADE — LEITURA dos pedidos de titular, e só.
 *
 * DECISÃO DELIBERADA: a IA não anonimiza. A rota que anonimiza
 * (`app/api/v1/lgpd/anonymize`) exige `admin`, e pela régua da paridade a tool
 * teria de exigir o mesmo — o que a deixaria fora do alcance de qualquer agente.
 * Mas o ponto não é o papel: anonimizar é IRREVERSÍVEL por contrato do próprio
 * produto (reverter devolve 403 `lgpd_anonymization_irreversible`). Expor uma
 * tool de anonimizar, mesmo travada, só acrescenta superfície — o humano já faz
 * pela tela, que é onde a decisão deve ser tomada.
 *
 * O que a IA GANHA lendo: parar de tratar como lead ativo alguém que pediu
 * exclusão, e saber que o silêncio daquele contato tem causa. Sem isso, o
 * follow-up insiste com quem pediu para sair — que é o oposto do que a LGPD
 * pede e o pior uso possível do mecanismo anti-morte.
 */
import { z } from "zod";

import type { McpToolDefinition } from "../types";

const inputShape = {
  contact_id: z
    .string()
    .uuid()
    .optional()
    .describe("Filtre par contact. Sans contact, renvoie les demandes ouvertes de l’organisation."),
  limite: z.number().int().min(1).max(50).optional().default(20),
};

export const crmListPrivacyRequests: McpToolDefinition<typeof inputShape> = {
  name: "crm_list_privacy_requests",
  description:
    "Liste les demandes de confidentialité (RGPD) de l’organisation — export ou suppression de données — avec " +
    "type, situation, date d’arrivée et échéance. N’EXÉCUTE rien : c’est de la lecture. À utiliser pour ne pas insister " +
    "auprès de qui a demandé la suppression et pour expliquer l’échéance à qui interroge sur sa propre demande.",
  inputSchema: inputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    let q = ctx.db
      .from("lgpd_requests")
      .select("id, request_type, source, contact_id, status, received_at, due_at, completed_at, emergency, scope")
      .eq("organization_id", ctx.organizationId)
      .order("received_at", { ascending: false })
      .limit(input.limite);

    if (input.contact_id) q = q.eq("contact_id", input.contact_id);

    const { data, error } = await q;
    if (error) throw new Error(`listar_pedidos_de_privacidade_falhou: ${error.message}`);

    const linhas = data ?? [];
    // O modelo precisa da CONSEQUÊNCIA, não só do estado: "existe pedido de
    // exclusão aberto" tem que virar "não insista com esta pessoa".
    const exclusaoAberta = linhas.some(
      (l) => l.request_type === "redact" && l.status !== "completed" && l.status !== "rejected",
    );

    return {
      pedidos: linhas,
      ...(exclusaoAberta
        ? {
            atencao:
              "une demande de suppression est en cours : n’envoyez ni campagne ni relance à ce contact, et ne demandez pas de nouvelles données.",
          }
        : {}),
    };
  },
};
