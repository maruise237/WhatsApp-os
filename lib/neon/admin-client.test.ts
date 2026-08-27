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
});
