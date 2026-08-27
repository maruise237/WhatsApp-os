import { describe, expect, it } from "vitest";

import { assertTenantMediaKey } from "./seaweedfs";

describe("SeaweedFS tenant media keys", () => {
  it("accepts a UUID-prefixed key for the same tenant", () => {
    const tenant = "11111111-1111-4111-8111-111111111111";
    expect(assertTenantMediaKey(tenant, `${tenant}/orders/proof.png`)).toBe(`${tenant}/orders/proof.png`);
  });

  it("rejects traversal and cross-tenant keys", () => {
    const tenant = "11111111-1111-4111-8111-111111111111";
    expect(() => assertTenantMediaKey(tenant, "22222222-2222-4222-8222-222222222222/proof.png")).toThrow("forbidden_media_key");
    expect(() => assertTenantMediaKey(tenant, `${tenant}/../other/proof.png`)).toThrow("forbidden_media_key");
  });
});
