import { describe, expect, it, vi } from "vitest";

import { env } from "@/lib/env";
import { isServiceRoleConfigured } from "./index";

vi.mock("@/lib/env", () => ({
  env: { NEON_DATABASE_URL: "postgresql://neon-owner@localhost/neondb" },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

describe("admin Neon — présence de la connexion PostgreSQL privée", () => {
  it("retourne true quand la connexion privée est configurée", () => {
    env.NEON_DATABASE_URL = "postgresql://neon-owner@localhost/neondb";
    expect(isServiceRoleConfigured()).toBe(true);
  });

  it("retourne false quand la connexion privée est absente", () => {
    env.NEON_DATABASE_URL = "";
    expect(isServiceRoleConfigured()).toBe(false);
  });

  it("ne dépend pas d’une ancienne variable JWT", () => {
    env.NEON_DATABASE_URL = "postgresql://neon-owner@localhost/neondb";
    (env as Record<string, unknown>).NEON_SERVICE_ROLE_JWT = "PLACEHOLDER_NEON_SERVICE_ROLE_JWT";
    expect(isServiceRoleConfigured()).toBe(true);
  });
});
