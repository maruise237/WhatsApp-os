#!/usr/bin/env node
/**
 * Applique les migrations de `db/migrations/` dans l'ordre, une seule fois.
 *
 *   node scripts/db-migrate.mjs            # URL dans NEON_DATABASE_ADMIN_URL
 *   node scripts/db-migrate.mjs <url>
 *
 * - Chaque fichier `NNNN_nom.sql` s'exécute dans sa propre transaction et
 *   n'est noté dans `public.schema_migrations` qu'en cas de succès.
 * - Un verrou consultatif empêche deux conteneurs de migrer en même temps.
 * - Les migrations sont idempotentes : une base installée avant ce script
 *   (sans table de suivi) reçoit 0001 à nouveau, ce qui la remet d'aplomb.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const DOSSIER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const VERROU = 727_001;

const url = process.argv[2] ?? process.env.NEON_DATABASE_ADMIN_URL ?? process.env.NEON_DATABASE_URL;
if (!url) {
  process.stderr.write("db-migrate : NEON_DATABASE_ADMIN_URL manquant.\n");
  process.exit(1);
}

const fichiers = readdirSync(DOSSIER)
  .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
  .sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("select pg_advisory_lock($1)", [VERROU]);
  await client.query(`create table if not exists public.schema_migrations (
    version text primary key,
    nom text not null,
    applied_at timestamptz not null default now()
  )`);
  await client.query("revoke all on public.schema_migrations from public");

  const { rows } = await client.query("select version from public.schema_migrations");
  const faites = new Set(rows.map((r) => r.version));

  let appliquees = 0;
  for (const f of fichiers) {
    const version = f.slice(0, 4);
    if (faites.has(version)) continue;
    const sql = readFileSync(path.join(DOSSIER, f), "utf8");
    process.stdout.write(`db-migrate : ${f}… `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("set search_path to public");
      await client.query("insert into public.schema_migrations (version, nom) values ($1, $2)", [
        version,
        f.slice(5, -4),
      ]);
      await client.query("commit");
      appliquees += 1;
      process.stdout.write("ok\n");
    } catch (e) {
      await client.query("rollback");
      process.stdout.write("ÉCHEC\n");
      throw e;
    }
  }
  process.stdout.write(`db-migrate : ${appliquees} migration(s) appliquée(s), base à jour.\n`);
} finally {
  await client.query("select pg_advisory_unlock($1)", [VERROU]).catch(() => {});
  await client.end();
}
