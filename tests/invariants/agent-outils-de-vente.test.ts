import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import {
  applyCreateOrderDraft,
  applyRegisterPaymentProof,
  applyRequestPaymentProof,
  applySearchCatalog,
} from "@/lib/agent-engine/agent/sales-tools";

/**
 * Outils de vente de l'agent (E-003/E-005) contre le Postgres du baseline.
 *
 * Le chemin complet d'une vente conduite par l'agent : catalogue → commande
 * (total et stock par la RPC) → attente de paiement → capture reçue → preuve
 * `pending`. Et ce qui ne doit jamais arriver : la commande n'est jamais
 * `payée` par l'agent, et une autre organisation ne voit ni ne touche rien.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`, max: 2 });

const ORG = "bbbbbbbb-0000-4000-8000-000000000001";
const OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000011";
const CONTACT = "bbbbbbbb-0000-4000-8000-000000000002";
const SESSION = "bbbbbbbb-0000-4000-8000-000000000003";
const CONV = "bbbbbbbb-0000-4000-8000-000000000004";
const PRODUCT = "bbbbbbbb-0000-4000-8000-000000000005";
const OTHER_PRODUCT = "bbbbbbbb-0000-4000-8000-000000000015";
const CAPTURE = "bbbbbbbb-0000-4000-8000-000000000006";

const scope = { tenantId: ORG, conversationId: CONV, jobId: "job-vente-1" };

beforeAll(async () => {
  for (const [id, slug] of [
    [ORG, "vente-agent"],
    [OTHER_ORG, "vente-autre"],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name) values ($1, $2::text, $2::text, $2::text)
       on conflict (id) do nothing`,
      [id, slug],
    );
  }
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Awa', '+237690000001') on conflict (id) do nothing`,
    [CONTACT, ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'vente-agent-session', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [SESSION, ORG],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'open', false) on conflict (id) do nothing`,
    [CONV, ORG, CONTACT, SESSION],
  );
  await pool.query(
    `insert into products (id, organization_id, title, description, price_cents, currency, stock)
     values ($1, $2, 'Robe wax', 'Taille M, coton', 1500000, 'XAF', 3),
            ($3, $4, 'Robe wax concurrente', null, 100, 'XAF', 50)
     on conflict (id) do nothing`,
    [PRODUCT, ORG, OTHER_PRODUCT, OTHER_ORG],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("vente conduite par l'agent, sur le schéma réel", () => {
  it("search_catalog ne voit que le catalogue de l'organisation du job", async () => {
    const res = await applySearchCatalog(pool, scope, { query: "robe" });
    expect(res).toMatchObject({ ok: true });
    const ids = (res as { products: Array<{ product_id: string }> }).products.map((p) => p.product_id);
    expect(ids).toEqual([PRODUCT]);
  });

  it("create_order_draft refuse un produit d'une autre organisation", async () => {
    const res = await applyCreateOrderDraft(pool, scope, { items: [{ product_id: OTHER_PRODUCT, quantity: 1 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "product_not_found" } });
  });

  it("create_order_draft : total par la base, stock réservé, rejouable sans doublon", async () => {
    const first = await applyCreateOrderDraft(pool, scope, { items: [{ product_id: PRODUCT, quantity: 2 }] });
    expect(first).toMatchObject({ ok: true, status: "en_cours", total_cents: 3000000, currency: "XAF" });
    const replay = await applyCreateOrderDraft(pool, scope, { items: [{ product_id: PRODUCT, quantity: 2 }] });
    expect((replay as { order_id: string }).order_id).toBe((first as { order_id: string }).order_id);
    const { rows } = await pool.query("select stock from products where id = $1", [PRODUCT]);
    expect(rows[0].stock).toBe(1);
  });

  it("create_order_draft : rupture traduite en enseignement", async () => {
    const res = await applyCreateOrderDraft(pool, { ...scope, jobId: "job-vente-2" }, {
      items: [{ product_id: PRODUCT, quantity: 5 }],
    });
    expect(res).toMatchObject({ ok: false, error: { code: "out_of_stock" } });
  });

  it("request_payment_proof passe la commande en attente de paiement", async () => {
    const res = await applyRequestPaymentProof(pool, scope, {});
    expect(res).toMatchObject({ ok: true, status: "en_attente_paiement" });
    const { rows } = await pool.query("select status from sales_orders where conversation_id = $1", [CONV]);
    expect(rows.map((r) => r.status)).toEqual(["en_attente_paiement"]);
  });

  it("register_payment_proof sans capture demande la capture", async () => {
    const res = await applyRegisterPaymentProof(pool, scope, {});
    expect(res).toMatchObject({ ok: false, error: { code: "no_capture" } });
  });

  it("register_payment_proof : preuve pending, commande JAMAIS payée par l'agent, pas de doublon", async () => {
    await pool.query(
      `insert into messages (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction,
                             status, body, sent_via, sent_at, media_storage_path, media_mime)
       values ($1, $2, $3, $4, $5, 'image', 'inbound', 'delivered', null, 'external_device', now(), $6, 'image/jpeg')
       on conflict (id) do nothing`,
      [CAPTURE, ORG, CONV, SESSION, CONTACT, `${ORG}/capture.jpg`],
    );
    const res = await applyRegisterPaymentProof(pool, scope, { amount_cents: 3000000, operator: "MTN MoMo", reference: "TX123" });
    expect(res).toMatchObject({ ok: true, status: "pending_review" });
    expect(res).not.toHaveProperty("warning");

    const again = await applyRegisterPaymentProof(pool, scope, {});
    expect(again).toMatchObject({ ok: true, status: "already_registered" });

    const { rows: proofs } = await pool.query(
      "select review_status, message_id, amount_cents, operator from payment_proofs where organization_id = $1",
      [ORG],
    );
    expect(proofs).toEqual([{ review_status: "pending", message_id: CAPTURE, amount_cents: "3000000", operator: "MTN MoMo" }]);
    const { rows: orders } = await pool.query("select status, paid_at from sales_orders where conversation_id = $1", [CONV]);
    expect(orders).toEqual([{ status: "en_attente_paiement", paid_at: null }]);
  });

  it("après validation humaine, la commande va jusqu'à « livrée » sans perdre la trace du paiement (0182)", async () => {
    const { rows: u } = await pool.query(
      `insert into neon_auth."user" (id, email) values (gen_random_uuid(), 'vendeuse-0182@test.local') returning id`,
    );
    const userId = u[0].id as string;
    await pool.query(`insert into neon_auth."user" (id, email) values ($1, 'vendeuse-0182@test.local') on conflict do nothing`, [userId]);
    const { rows: o } = await pool.query("select id from sales_orders where conversation_id = $1", [CONV]);
    const id = o[0].id as string;
    await pool.query(`update sales_orders set status = 'payée', paid_at = now(), paid_by_user_id = $2 where id = $1`, [id, userId]);
    await pool.query(`update sales_orders set status = 'a_livrer' where id = $1`, [id]);
    await pool.query(`update sales_orders set status = 'livree' where id = $1`, [id]);
    const { rows } = await pool.query("select status, paid_at is not null as trace from sales_orders where id = $1", [id]);
    expect(rows[0]).toEqual({ status: "livree", trace: true });

    // Ce qui reste interdit : payée sans auteur, et une date de paiement sur une commande non payée.
    await expect(
      pool.query(`update sales_orders set status = 'payée', paid_by_user_id = null where id = $1`, [id]),
    ).rejects.toThrow(/sales_orders_payee_a_un_auteur/);
    await expect(
      pool.query(`update sales_orders set status = 'en_attente_paiement' where id = $1`, [id]),
    ).rejects.toThrow(/sales_orders_paiement_seulement_si_payee/);
  });

  it("une autre organisation ne touche pas cette conversation", async () => {
    const intrus = { tenantId: OTHER_ORG, conversationId: CONV, jobId: "job-intrus" };
    expect(await applyCreateOrderDraft(pool, intrus, { items: [{ product_id: OTHER_PRODUCT, quantity: 1 }] })).toMatchObject({
      ok: false,
    });
    expect(await applyRequestPaymentProof(pool, intrus, {})).toMatchObject({ ok: false, error: { code: "order_not_found" } });
    expect(await applyRegisterPaymentProof(pool, intrus, {})).toMatchObject({ ok: false, error: { code: "order_not_found" } });
    const { rows } = await pool.query("select count(*)::int as n from sales_orders where organization_id = $1", [OTHER_ORG]);
    expect(rows[0].n).toBe(0);
  });
});
