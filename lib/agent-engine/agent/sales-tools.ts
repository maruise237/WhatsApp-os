/**
 * Outils de vente de l'agent (AI WhatsApp Sales OS, tâche E-003).
 *
 * L'agent conduit la vente jusqu'à la preuve de paiement, et S'ARRÊTE là : la
 * constitution (P3) réserve la confirmation du paiement à un humain. Ce module
 * expose donc exactement quatre gestes :
 *
 *   search_catalog         lecture du catalogue actif de l'organisation
 *   create_order_draft     commande `en_cours` via `fn_create_sales_order`
 *                          (total et stock calculés par la base, jamais par le modèle)
 *   request_payment_proof  `en_cours` → `en_attente_paiement`
 *   register_payment_proof capture reçue → `payment_proofs` en `pending`
 *
 * Aucun d'eux n'écrit `payée`, `a_livrer` ni `livree`, et aucun n'appelle
 * `fn_approve_sales_payment` — `sales-tools.test.ts` le vérifie sur le SQL émis.
 *
 * Organisation, conversation et job viennent de la LIGNE du job (closure de
 * l'appelant), jamais des arguments du modèle. Un argument invalide devient une
 * erreur d'ENSEIGNEMENT (`ok:false`), jamais une exception.
 */
import type pg from 'pg';
import { z } from 'zod';

export const SALES_TOOL_DEFS = {
  search_catalog: {
    description:
      "Cherche dans le CATALOGUE de l'organisation les produits actifs (nom, prix, devise, stock). " +
      'Utilise-le AVANT de citer un produit, un prix ou une disponibilité. Sans résultat, ne devine pas.',
    inputSchema: z
      .object({
        query: z.string().optional().describe('mots du client (vide = les produits les plus récents)'),
      })
      .passthrough(),
  },
  create_order_draft: {
    description:
      'Crée la commande du client de cette conversation avec les produits choisis (ids issus de ' +
      'search_catalog). Le système réserve le stock et calcule le total : annonce ce total, pas le tien.',
    inputSchema: z
      .object({
        items: z
          .array(z.object({ product_id: z.string(), quantity: z.number() }).passthrough())
          .describe('produits et quantités confirmés par le client'),
      })
      .passthrough(),
  },
  request_payment_proof: {
    description:
      'Quand le client confirme la commande, la passe « en attente de paiement ». Ensuite, donne-lui ' +
      "les instructions de paiement de l'organisation et demande une capture du paiement.",
    inputSchema: z
      .object({ order_id: z.string().optional().describe('commande concernée (défaut : la plus récente en cours)') })
      .passthrough(),
  },
  register_payment_proof: {
    description:
      'Enregistre la dernière capture ou le dernier reçu envoyé par le client comme PREUVE de paiement, ' +
      "à vérifier par le vendeur. Cela NE confirme PAS le paiement : dis au client que le vendeur va vérifier.",
    inputSchema: z
      .object({
        order_id: z.string().optional().describe('commande concernée (défaut : la plus récente en attente)'),
        amount_cents: z.number().optional().describe('montant lu sur la capture, en centimes, si lisible'),
        reference: z.string().optional().describe('référence de transaction lue sur la capture'),
        operator: z.string().optional().describe('opérateur lu sur la capture (ex. Orange Money, MTN MoMo)'),
      })
      .passthrough(),
  },
} as const;

export type SalesToolName = keyof typeof SALES_TOOL_DEFS;

export interface SalesToolScope {
  tenantId: string;
  conversationId: string;
  /** id du job : rend `create_order_draft` idempotent quand le tour est rejoué */
  jobId: string;
}

type Teach = { ok: false; error: { code: string; message: string } };
const teach = (code: string, message: string): Teach => ({ ok: false, error: { code, message } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Échappe les jokers ILIKE : le texte du client est cherché tel quel. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const searchInput = z.object({ query: z.string().max(200).optional() }).strict();

export async function applySearchCatalog(db: pg.Pool, scope: SalesToolScope, raw: unknown) {
  const parsed = searchInput.safeParse(raw ?? {});
  if (!parsed.success) return teach('invalid_input', 'seul le champ "query" (texte) est accepté.');
  const query = parsed.data.query?.trim() ?? '';
  const params: unknown[] = [scope.tenantId];
  let filter = '';
  // Le titre d'abord : « robe » doit sortir la robe avant le foulard « assorti
  // aux robes » — sinon le modèle, qui prend volontiers le premier résultat,
  // commande le mauvais produit (mesuré sur la pile locale).
  let rank = '';
  if (query !== '') {
    params.push(likePattern(query));
    filter = 'and (title ilike $2 or coalesce(description, \'\') ilike $2)';
    rank = '(title ilike $2) desc,';
  }
  const { rows } = await db.query<{
    id: string;
    title: string;
    description: string | null;
    price_cents: string | number;
    currency: string;
    stock: number;
  }>(
    `select id, title, description, price_cents, currency, stock
       from products
      where organization_id = $1 and is_active = true ${filter}
      order by ${rank} (stock > 0) desc, updated_at desc
      limit 10`,
    params,
  );
  return {
    ok: true as const,
    products: rows.map((r) => ({
      product_id: r.id,
      title: r.title,
      description: r.description ? r.description.slice(0, 280) : null,
      price_cents: Number(r.price_cents),
      currency: r.currency,
      in_stock: r.stock > 0,
      stock: r.stock,
    })),
    ...(rows.length === 0
      ? { hint: 'aucun produit trouvé : ne propose rien d’inventé, propose de vérifier avec l’équipe.' }
      : {}),
  };
}

const orderInput = z
  .object({
    items: z
      .array(
        z
          .object({
            product_id: z.string().regex(UUID),
            quantity: z.number().int().min(1).max(999),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

const ORDER_ERRORS: Record<string, string> = {
  out_of_stock: 'stock insuffisant pour au moins un produit : relis le catalogue et propose une alternative.',
  product_not_found: 'produit introuvable ou inactif : utilise un product_id renvoyé par search_catalog.',
  currency_mismatch: 'les produits n’ont pas tous la même devise : crée une commande par devise.',
  invalid_order_quantity: 'quantité invalide.',
  invalid_order_items: 'la commande doit contenir au moins un produit.',
  forbidden_cross_tenant: 'cette conversation ne permet pas de créer une commande.',
};

export async function applyCreateOrderDraft(db: pg.Pool, scope: SalesToolScope, raw: unknown) {
  const parsed = orderInput.safeParse(raw);
  if (!parsed.success) {
    return teach('invalid_input', 'items = [{ product_id (uuid de search_catalog), quantity (entier ≥ 1) }].');
  }
  // Fusionne les doublons : « 2 + 1 du même produit » = 3, pas deux lignes.
  const merged = new Map<string, number>();
  for (const item of parsed.data.items) {
    merged.set(item.product_id, (merged.get(item.product_id) ?? 0) + item.quantity);
  }
  const items = [...merged].map(([product_id, quantity]) => ({ product_id, quantity }));

  const { rows: conv } = await db.query<{ contact_id: string | null }>(
    'select contact_id from conversations where id = $1 and organization_id = $2',
    [scope.conversationId, scope.tenantId],
  );
  const contactId = conv[0]?.contact_id;
  if (!contactId) return teach('no_contact', 'cette conversation n’a pas de contact associé : transfère à un humain.');

  const { rows: currencies } = await db.query<{ currency: string }>(
    `select distinct currency from products
      where organization_id = $1 and id = any($2::uuid[]) and is_active = true`,
    [scope.tenantId, items.map((i) => i.product_id)],
  );
  if (currencies.length === 0) return teach('product_not_found', ORDER_ERRORS.product_not_found!);
  if (currencies.length > 1) return teach('currency_mismatch', ORDER_ERRORS.currency_mismatch!);

  const key = `agent:${scope.jobId}:${items.map((i) => `${i.product_id}x${i.quantity}`).sort().join(',')}`;
  try {
    const { rows } = await db.query<{ id: string; status: string; total_cents: string | number; currency: string }>(
      `select id, status, total_cents, currency
         from fn_create_sales_order($1, $2, $3, $4::jsonb, $5, null, $6)`,
      [scope.tenantId, scope.conversationId, contactId, JSON.stringify(items), currencies[0]!.currency, key],
    );
    const order = rows[0];
    if (!order) return teach('order_not_created', 'la commande n’a pas été créée : transfère à un humain.');
    const { rows: lines } = await db.query<{ product_title: string; quantity: number; unit_price_cents: string | number }>(
      `select product_title, quantity, unit_price_cents from sales_order_items
        where organization_id = $1 and order_id = $2 order by created_at`,
      [scope.tenantId, order.id],
    );
    return {
      ok: true as const,
      order_id: order.id,
      status: order.status,
      total_cents: Number(order.total_cents),
      currency: order.currency,
      items: lines.map((l) => ({ title: l.product_title, quantity: l.quantity, unit_price_cents: Number(l.unit_price_cents) })),
      next: 'récapitule au client et demande sa confirmation, puis appelle request_payment_proof.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = Object.keys(ORDER_ERRORS).find((c) => message.includes(c));
    if (code) return teach(code, ORDER_ERRORS[code]!);
    throw err;
  }
}

const orderRefInput = z.object({ order_id: z.string().regex(UUID).optional() }).strict();

async function resolveOrder(
  client: pg.PoolClient,
  scope: SalesToolScope,
  orderId: string | undefined,
  statuses: readonly string[],
): Promise<{ id: string; status: string; total_cents: string | number; currency: string } | null> {
  const params: unknown[] = [scope.tenantId, scope.conversationId, statuses];
  let byId = '';
  if (orderId) {
    params.push(orderId);
    byId = 'and id = $4';
  }
  const { rows } = await client.query<{ id: string; status: string; total_cents: string | number; currency: string }>(
    `select id, status, total_cents, currency from sales_orders
      where organization_id = $1 and conversation_id = $2 and status = any($3::text[]) ${byId}
      order by created_at desc limit 1
      for update`,
    params,
  );
  return rows[0] ?? null;
}

async function inTransaction<T>(db: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function applyRequestPaymentProof(db: pg.Pool, scope: SalesToolScope, raw: unknown) {
  const parsed = orderRefInput.safeParse(raw ?? {});
  if (!parsed.success) return teach('invalid_input', 'seul "order_id" (uuid) est accepté.');
  return inTransaction(db, async (client) => {
    const order = await resolveOrder(client, scope, parsed.data.order_id, ['en_cours', 'en_attente_paiement']);
    if (!order) return teach('order_not_found', 'aucune commande en cours dans cette conversation : crée-la d’abord.');
    if (order.status === 'en_cours') {
      await client.query(
        `update sales_orders set status = 'en_attente_paiement'
          where id = $1 and organization_id = $2 and status = 'en_cours'`,
        [order.id, scope.tenantId],
      );
    }
    return {
      ok: true as const,
      order_id: order.id,
      status: 'en_attente_paiement',
      total_cents: Number(order.total_cents),
      currency: order.currency,
      next: 'donne les instructions de paiement de l’organisation et demande une capture du paiement.',
    };
  });
}

const proofInput = z
  .object({
    order_id: z.string().regex(UUID).optional(),
    amount_cents: z.number().int().min(0).max(1e12).optional(),
    reference: z.string().max(120).optional(),
    operator: z.string().max(60).optional(),
  })
  .strict();

export async function applyRegisterPaymentProof(db: pg.Pool, scope: SalesToolScope, raw: unknown) {
  const parsed = proofInput.safeParse(raw ?? {});
  if (!parsed.success) return teach('invalid_input', 'champs acceptés : order_id, amount_cents (entier), reference, operator.');
  return inTransaction(db, async (client) => {
    const order = await resolveOrder(client, scope, parsed.data.order_id, ['en_cours', 'en_attente_paiement']);
    if (!order) {
      return teach('order_not_found', 'aucune commande en attente de paiement ici : vérifie la commande ou transfère à un humain.');
    }
    // La capture : la dernière image ou le dernier document reçu du client,
    // récent. Le modèle ne désigne pas le message — il n'en voit pas les ids.
    const { rows: media } = await client.query<{ id: string; media_storage_path: string; media_mime: string | null }>(
      `select id, media_storage_path, media_mime from messages
        where organization_id = $1 and conversation_id = $2 and direction = 'inbound'
          and media_storage_path is not null
          and coalesce(media_mime, '') ~ '^(image/|application/pdf)'
          and created_at > now() - interval '24 hours'
        order by created_at desc limit 1`,
      [scope.tenantId, scope.conversationId],
    );
    const capture = media[0];
    if (!capture) {
      return teach('no_capture', 'aucune capture reçue récemment : demande au client d’envoyer la capture du paiement.');
    }
    const { rows: existing } = await client.query<{ id: string }>(
      'select id from payment_proofs where organization_id = $1 and message_id = $2 limit 1',
      [scope.tenantId, capture.id],
    );
    if (existing[0]) {
      return { ok: true as const, status: 'already_registered', proof_id: existing[0].id, next: 'dis au client que le vendeur vérifie.' };
    }
    if (order.status === 'en_cours') {
      await client.query(
        `update sales_orders set status = 'en_attente_paiement'
          where id = $1 and organization_id = $2 and status = 'en_cours'`,
        [order.id, scope.tenantId],
      );
    }
    const { rows } = await client.query<{ id: string }>(
      `insert into payment_proofs
         (organization_id, order_id, message_id, storage_key, mime_type, review_status,
          amount_cents, reference, operator, extraction)
       values ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9::jsonb)
       returning id`,
      [
        scope.tenantId,
        order.id,
        capture.id,
        capture.media_storage_path,
        capture.media_mime ?? 'application/octet-stream',
        parsed.data.amount_cents ?? null,
        parsed.data.reference?.trim() || null,
        parsed.data.operator?.trim() || null,
        JSON.stringify({ source: 'agent', storage: 'whatsapp-media' }),
      ],
    );
    const amountMismatch =
      parsed.data.amount_cents !== undefined && parsed.data.amount_cents !== Number(order.total_cents);
    return {
      ok: true as const,
      status: 'pending_review',
      proof_id: rows[0]?.id,
      order_id: order.id,
      ...(amountMismatch
        ? { warning: 'le montant lu diffère du total de la commande : ne conclus rien, le vendeur tranchera.' }
        : {}),
      next: 'dis au client que la preuve est reçue et que le vendeur va la vérifier. Ne confirme PAS le paiement.',
    };
  });
}
