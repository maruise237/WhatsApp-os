import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

function novaOrg(slug: string): string {
  sql(`
    insert into public.organizations (slug, legal_name, display_name)
    values ('${slug}', 'AI Sales OS', 'AI Sales OS');
  `);
  return sql(`select id from public.organizations where slug = '${slug}'`).trim();
}

function insertSession(org: string, columns: Record<string, string>): string {
  const names = ["organization_id", "webhook_secret_encrypted", ...Object.keys(columns)];
  const values = [`'${org}'`, `'\\x00'::bytea`, ...Object.values(columns)];
  return sql(`
    insert into public.channel_sessions (${names.join(", ")})
    values (${values.join(", ")});
    select 'ok';
  `);
}

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    const err = error as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("l’opération aurait dû être refusée par la contrainte Evolution Go");
}

describe("0176 · Evolution Go dans channel_sessions", () => {
  it("expose la colonne Evolution Go dans le baseline", () => {
    expect(
      sql(`select is_nullable from information_schema.columns
            where table_schema = 'public'
              and table_name = 'channel_sessions'
              and column_name = 'evolution_instance_name'`),
    ).toBe("YES");
  });

  it("refuse une session evolution_go sans nom d’instance", () => {
    const org = novaOrg(`inv-0176-missing-${Date.now()}`);
    const message = erroDe(() =>
      insertSession(org, { provider: "'evolution_go'", evolution_instance_name: "null" }),
    );
    expect(message).toMatch(/channel_sessions_provider_ref_check/);
  });

  it("accepte une session Evolution Go complète", () => {
    const org = novaOrg(`inv-0176-valid-${Date.now()}`);
    expect(
      insertSession(org, {
        provider: "'evolution_go'",
        evolution_instance_name: "'sales-os-valid'",
        status: "'STOPPED'",
      }),
    ).toBe("ok");
  });

  it("refuse le même nom d’instance actif dans une autre organisation", () => {
    const first = novaOrg(`inv-0176-first-${Date.now()}`);
    const second = novaOrg(`inv-0176-second-${Date.now()}`);
    insertSession(first, {
      provider: "'evolution_go'",
      evolution_instance_name: "'sales-os-unique'",
      status: "'STOPPED'",
    });

    const message = erroDe(() =>
      insertSession(second, {
        provider: "'evolution_go'",
        evolution_instance_name: "'sales-os-unique'",
        status: "'STOPPED'",
      }),
    );
    expect(message).toMatch(/channel_sessions_evolution_instance_name_active_unique/);
  });

  it("libère le nom lorsqu’une ancienne session est archivée", () => {
    const org = novaOrg(`inv-0176-archived-${Date.now()}`);
    insertSession(org, {
      provider: "'evolution_go'",
      evolution_instance_name: "'sales-os-reusable'",
      status: "'STOPPED'",
      archived_at: "now()",
    });

    expect(
      insertSession(org, {
        provider: "'evolution_go'",
        evolution_instance_name: "'sales-os-reusable'",
        status: "'STOPPED'",
      }),
    ).toBe("ok");
  });
});
