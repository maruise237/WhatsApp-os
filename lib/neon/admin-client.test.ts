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
