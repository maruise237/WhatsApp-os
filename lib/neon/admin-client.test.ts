import { describe, expect, it, vi } from "vitest";

const createPool = vi.fn();

vi.mock("@/lib/env", () => ({
  env: {
    NEON_DATABASE_URL: "postgresql://neon-owner@localhost/neondb",
    NEON_AUTH_BASE_URL: "https://auth.example.test",
    NEON_DATA_API_URL: "https://data.example.test",
    NEON_AUTH_COOKIE_SECRET: "a".repeat(32),
  },
}));
vi.mock("@/lib/agent-engine/db/pool", () => ({ createPool }));
vi.mock("@/lib/neon/server-client", () => ({
  createNeonAuthForNextRequest: () => ({}),
}));
vi.mock("@/lib/neon/storage-adapter", () => ({
  createSeaweedStorage: () => ({}),
}));

describe("createAdminClient — Neon PostgreSQL direct", () => {
  it("se construit sans NEON_SERVICE_ROLE_JWT et n’ouvre le pool qu’à la première requête", async () => {
    const { createAdminClient } = await import("./admin-client");
    const client = createAdminClient();

    expect(client).toBeDefined();
    expect(createPool).not.toHaveBeenCalled();
  });

  it("parse les listes OR PostgREST et ne bind pas les prédicats IS NULL", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    createPool.mockReturnValue({ query });
    const { createAdminClient } = await import("./admin-client");
    const client = createAdminClient();

    await client
      .from("event_log")
      .select("id")
      .or("next_attempt_at.is.null,next_attempt_at.lte.2026-08-27T14:00:00.000Z")
      .limit(50);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE ("next_attempt_at" IS NULL OR "next_attempt_at" <= $1) LIMIT 50',
      ),
      ["2026-08-27T14:00:00.000Z"],
    );
  });

  it("place les paramètres des valeurs UPDATE avant ceux des filtres WHERE", async () => {
    const query = createPool.mock.results[0]?.value?.query as ReturnType<typeof vi.fn>;
    query.mockClear().mockResolvedValue({ rows: [], rowCount: 0 });
    const { createAdminClient } = await import("./admin-client");
    const client = createAdminClient();

    await client
      .from("conversations")
      .update({ status: "open" })
      .not("snooze_until", "is", null)
      .lte("snooze_until", "2026-08-27T14:00:00.000Z")
      .select("id");

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE "public"."conversations" SET "status" = $1 WHERE "snooze_until" IS NOT NULL AND "snooze_until" <= $2 RETURNING "id"',
      ),
      ["open", "2026-08-27T14:00:00.000Z"],
    );
  });
});

describe("contrat PostgREST du client admin direct", () => {
  it("une liste d'objets destinée à un jsonb part en JSON, pas en tableau Postgres", async () => {
    const { valeurPourJson } = await import("./admin-client");
    expect(valeurPourJson([{ nome: "Ventes" }])).toBe('[{"nome":"Ventes"}]');
    expect(valeurPourJson({ a: [1, 2] })).toBe('{"a":[1,2]}');
    expect(valeurPourJson("déjà texte")).toBe("déjà texte");
    expect(valeurPourJson(null)).toBeNull();
    const date = new Date(0);
    expect(valeurPourJson(date)).toBe(date);
  });

  it("rpc rend la valeur d'un scalaire, l'objet d'une ligne, le tableau d'un ensemble", async () => {
    const { formerRetourRpc } = await import("./admin-client");
    const scalaire = { ensemble: false, scalaire: true, vide: false };
    expect(formerRetourRpc([{ fn_x: { ok: true } }], scalaire)).toEqual({ ok: true });
    expect(formerRetourRpc([{ fn_decrypt_oauth: "secret" }], scalaire)).toBe("secret");
    expect(formerRetourRpc([], scalaire)).toBeNull();
    expect(formerRetourRpc([{ id: "o1", status: "en_cours" }], { ensemble: false, scalaire: false, vide: false })).toEqual({
      id: "o1",
      status: "en_cours",
    });
    expect(formerRetourRpc([{ a: 1 }, { a: 2 }], { ensemble: true, scalaire: false, vide: false })).toEqual([{ a: 1 }, { a: 2 }]);
    expect(formerRetourRpc([{ f: 1 }, { f: 2 }], { ensemble: true, scalaire: true, vide: false })).toEqual([1, 2]);
    expect(formerRetourRpc([{ f: "" }], { ensemble: false, scalaire: true, vide: true })).toBeNull();
  });
});
