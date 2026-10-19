/**
 * Outils de vente de l'agent (E-003). Le test négatif est le cœur : aucun outil
 * de l'agent ne peut confirmer un paiement (constitution P3). Il est vérifié deux
 * fois — par le NOM des outils exposés, et par le SQL réellement émis.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { AGENT_TOOL_DEFS } from './inbound-turn';
import {
  SALES_TOOL_DEFS,
  applyCreateOrderDraft,
  applyRegisterPaymentProof,
  applyRequestPaymentProof,
  applySearchCatalog,
} from './sales-tools';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONV = '22222222-2222-4222-8222-222222222222';
const PROD = '33333333-3333-4333-8333-333333333333';
const ORDER = '44444444-4444-4444-8444-444444444444';
const scope = { tenantId: ORG, conversationId: CONV, jobId: 'job-1' };

type Responder = (sql: string, params: unknown[]) => unknown[] | Error;

function fakePool(responder: Responder) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    const rows = responder(sql, params);
    if (rows instanceof Error) throw rows;
    return { rows, rowCount: rows.length };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) } as unknown as pg.Pool;
  return { pool, queries };
}

describe('surface des outils', () => {
  it('les quatre outils de vente sont exposés à l’agent', () => {
    for (const name of Object.keys(SALES_TOOL_DEFS)) expect(AGENT_TOOL_DEFS).toHaveProperty(name);
  });

  it('aucun outil de l’agent ne confirme, n’approuve ni ne livre', () => {
    const interdits = Object.keys(AGENT_TOOL_DEFS).filter((n) =>
      /mark_paid|approve|confirm_pay|set_paid|deliver|refund/i.test(n),
    );
    expect(interdits).toEqual([]);
  });

  it('le module de vente n’écrit jamais un statut post-paiement ni n’appelle l’approbation', () => {
    const source = readFileSync(path.join(__dirname, 'sales-tools.ts'), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .join('\n');
    expect(source).not.toMatch(/fn_approve_sales_payment/);
    expect(source).not.toMatch(/'payée'|'a_livrer'|'livree'|'approved'/);
  });
});

describe('search_catalog', () => {
  it('filtre par organisation, produits actifs, et échappe les jokers', async () => {
    const { pool, queries } = fakePool(() => [
      { id: PROD, title: 'Robe wax', description: null, price_cents: '1500000', currency: 'XAF', stock: 3 },
    ]);
    const res = await applySearchCatalog(pool, scope, { query: '100%_robe' });
    expect(res).toMatchObject({ ok: true, products: [{ product_id: PROD, price_cents: 1500000, in_stock: true }] });
    expect(queries[0]!.sql).toMatch(/organization_id = \$1 and is_active = true/);
    expect(queries[0]!.params).toEqual([ORG, '%100\\%\\_robe%']);
  });

  it('refuse un champ inconnu (enseignement, pas exception)', async () => {
    const { pool } = fakePool(() => []);
    expect(await applySearchCatalog(pool, scope, { organization_id: 'x' })).toMatchObject({ ok: false });
  });
});

describe('create_order_draft', () => {
  it('passe par la RPC avec l’organisation du job, fusionne les doublons, et une clé idempotente', async () => {
    const { pool, queries } = fakePool((sql) => {
      if (sql.includes('from conversations')) return [{ contact_id: 'c1' }];
      if (sql.includes('distinct currency')) return [{ currency: 'XAF' }];
      if (sql.includes('fn_create_sales_order')) return [{ id: ORDER, status: 'en_cours', total_cents: '3000000', currency: 'XAF' }];
      if (sql.includes('sales_order_items')) return [{ product_title: 'Robe wax', quantity: 2, unit_price_cents: '1500000' }];
      return [];
    });
    const res = await applyCreateOrderDraft(pool, scope, {
      items: [
        { product_id: PROD, quantity: 1 },
        { product_id: PROD, quantity: 1 },
      ],
    });
    expect(res).toMatchObject({ ok: true, order_id: ORDER, total_cents: 3000000 });
    const rpc = queries.find((q) => q.sql.includes('fn_create_sales_order'))!;
    expect(rpc.params[0]).toBe(ORG);
    expect(rpc.params[1]).toBe(CONV);
    expect(JSON.parse(rpc.params[3] as string)).toEqual([{ product_id: PROD, quantity: 2 }]);
    expect(rpc.params[5]).toBe(`agent:job-1:${PROD}x2`);
  });

  it('traduit la rupture de stock en enseignement', async () => {
    const { pool } = fakePool((sql) => {
      if (sql.includes('from conversations')) return [{ contact_id: 'c1' }];
      if (sql.includes('distinct currency')) return [{ currency: 'XAF' }];
      if (sql.includes('fn_create_sales_order')) return new Error('out_of_stock');
      return [];
    });
    expect(await applyCreateOrderDraft(pool, scope, { items: [{ product_id: PROD, quantity: 9 }] })).toMatchObject({
      ok: false,
      error: { code: 'out_of_stock' },
    });
  });

  it('refuse un prix fourni par le modèle', async () => {
    const { pool } = fakePool(() => []);
    expect(
      await applyCreateOrderDraft(pool, scope, { items: [{ product_id: PROD, quantity: 1, unit_price_cents: 1 }] }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
  });
});

describe('request_payment_proof', () => {
  it('passe en_cours → en_attente_paiement, scopé à la conversation', async () => {
    const { pool, queries } = fakePool((sql) => {
      if (sql.includes('from sales_orders')) return [{ id: ORDER, status: 'en_cours', total_cents: 100, currency: 'XAF' }];
      return [];
    });
    expect(await applyRequestPaymentProof(pool, scope, {})).toMatchObject({ ok: true, status: 'en_attente_paiement' });
    const update = queries.find((q) => q.sql.includes('update sales_orders'))!;
    expect(update.sql).toMatch(/status = 'en_cours'/);
    expect(queries.find((q) => q.sql.includes('from sales_orders'))!.params.slice(0, 2)).toEqual([ORG, CONV]);
  });
});

describe('register_payment_proof', () => {
  it('enregistre la dernière capture en pending, jamais approuvée', async () => {
    const { pool, queries } = fakePool((sql) => {
      if (sql.includes('from sales_orders')) return [{ id: ORDER, status: 'en_attente_paiement', total_cents: 500, currency: 'XAF' }];
      if (sql.includes('from messages')) return [{ id: 'm1', media_storage_path: `${ORG}/m1.jpg`, media_mime: 'image/jpeg' }];
      if (sql.includes('insert into payment_proofs')) return [{ id: 'p1' }];
      return [];
    });
    const res = await applyRegisterPaymentProof(pool, scope, { amount_cents: 400, operator: 'MTN MoMo' });
    expect(res).toMatchObject({ ok: true, status: 'pending_review', proof_id: 'p1' });
    expect(res).toHaveProperty('warning');
    const insert = queries.find((q) => q.sql.includes('insert into payment_proofs'))!;
    expect(insert.sql).toMatch(/'pending'/);
    expect(insert.params.slice(0, 3)).toEqual([ORG, ORDER, 'm1']);
  });

  it('sans capture récente, demande au client de l’envoyer', async () => {
    const { pool } = fakePool((sql) =>
      sql.includes('from sales_orders') ? [{ id: ORDER, status: 'en_attente_paiement', total_cents: 1, currency: 'XAF' }] : [],
    );
    expect(await applyRegisterPaymentProof(pool, scope, {})).toMatchObject({ ok: false, error: { code: 'no_capture' } });
  });

  it('la même capture n’est pas enregistrée deux fois', async () => {
    const { pool, queries } = fakePool((sql) => {
      if (sql.includes('from sales_orders')) return [{ id: ORDER, status: 'en_attente_paiement', total_cents: 1, currency: 'XAF' }];
      if (sql.includes('from messages')) return [{ id: 'm1', media_storage_path: 'k', media_mime: 'image/png' }];
      if (sql.includes('from payment_proofs')) return [{ id: 'p0' }];
      return [];
    });
    expect(await applyRegisterPaymentProof(pool, scope, {})).toMatchObject({ status: 'already_registered', proof_id: 'p0' });
    expect(queries.some((q) => q.sql.includes('insert into payment_proofs'))).toBe(false);
  });
});
