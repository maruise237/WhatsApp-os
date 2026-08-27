/**
 * Pool do Postgres do agent-engine, sob demanda no processo Next.js (rotas
 * `/api/v1`). Sem pool global no import — mesma disciplina de
 * `workers/media-derive-worker.ts` (derivePool). NEON_DATABASE_URL ausente
 * lança na hora do request (rota converte pra 503), não na importação do
 * módulo.
 */
import type pg from 'pg';

import { createPool } from './pool';

let _pool: pg.Pool | null = null;

export function getRequestPool(): pg.Pool {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('NEON_DATABASE_URL ausente — rascunho da IA indisponível');
  if (!_pool) _pool = createPool(url);
  return _pool;
}
