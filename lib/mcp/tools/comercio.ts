/**
 * Capacidades de COMÉRCIO — o que o cliente já comprou e o que existe à venda.
 *
 * Ficou de fora do épico até ser cobrado, e era a lacuna mais direta do pilar 1:
 * um agente de vendas que não enxerga o catálogo nem o histórico de pedidos
 * negocia no escuro — promete o que não existe, ou repete uma oferta que o
 * cliente já comprou.
 *
 * Service role bypassa RLS: TODA query filtra `organization_id` manualmente, e a
 * fonte é sempre `ctx.organizationId` (token/cookie), NUNCA o input.
 */
import { z } from "zod";

import type { McpToolDefinition } from "../types";

// ---------------------------------------------------------------------------
// pedidos de um cliente
// ---------------------------------------------------------------------------

const pedidosInputShape = {
  contact_id: z.string().uuid().describe("Le client dont on veut voir les commandes."),
  limite: z.number().int().min(1).max(20).optional().default(10),
};

export const crmListContactOrders: McpToolDefinition<typeof pedidosInputShape> = {
  name: "crm_list_contact_orders",
  description:
    "Liste les commandes d’un contact, de la plus récente à la plus ancienne, avec statut, montant, " +
    "moyen de paiement, état de livraison et code de suivi. À utiliser avant de promettre un délai " +
    "ou de répéter une offre : le client a peut-être déjà acheté.",
  inputSchema: pedidosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("orders")
      .select(
        "id, external_id, external_provider, status, total_cents, currency, payment_method, fulfillment_status, tracking_code, ordered_at, is_anonymized",
      )
      .eq("organization_id", ctx.organizationId)
      .eq("contact_id", input.contact_id)
      .order("ordered_at", { ascending: false, nullsFirst: false })
      .limit(input.limite);

    if (error) throw new Error(`listar_pedidos_falhou: ${error.message}`);

    return {
      pedidos: (data ?? []).map((p) => ({
        ...p,
        // Pedido anonimizado por LGPD continua contando para histórico, mas o
        // conteúdo não volta: dizer isso é melhor que devolver campos vazios e
        // deixar o modelo concluir que o cliente nunca comprou.
        ...(p.is_anonymized ? { aviso: "commande anonymisée à la demande de la personne concernée" } : {}),
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// buscar no catálogo
// ---------------------------------------------------------------------------

const produtosInputShape = {
  termo: z.string().trim().min(2).describe("Partie du nom du produit."),
  limite: z.number().int().min(1).max(20).optional().default(10),
  somente_disponiveis: z.boolean().optional().default(true),
};

export const crmSearchProducts: McpToolDefinition<typeof produtosInputShape> = {
  name: "crm_search_products",
  description:
    "Recherche des produits du catalogue de la boutique par une partie du nom. Renvoie le prix, la quantité disponible " +
    "et le lien. À utiliser pour répondre sur le prix et la disponibilité avec la donnée de la boutique au lieu d’estimer.",
  inputSchema: produtosInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    let q = ctx.supabase
      .from("nuvemshop_products")
      .select("id, external_id, title, description, price_cents, available_qty, url, image_url")
      .eq("organization_id", ctx.organizationId)
      .ilike("title", `%${input.termo}%`)
      .limit(input.limite);

    // Oferecer o que está sem estoque é pior que não achar: o cliente ouve um
    // sim e recebe um não depois.
    if (input.somente_disponiveis) q = q.gt("available_qty", 0);

    const { data, error } = await q;
    if (error) throw new Error(`buscar_produtos_falhou: ${error.message}`);

    return {
      produtos: data ?? [],
      ...(data && data.length === 0
        ? { aviso: input.somente_disponiveis ? "rien avec ce nom en stock" : "rien avec ce nom dans le catalogue" }
        : {}),
    };
  },
};
