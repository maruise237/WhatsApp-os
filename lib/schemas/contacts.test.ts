/**
 * Tests for EPIC-05 contact schemas (Wave 1).
 *
 * Covers:
 *  - E.164 phone validator (accept/reject)
 *  - Email parsing
 *  - Numéro d'identification: free text, no national format check
 *  - lgpdAnonymizeSchema requires justification ≥ 10 chars
 *  - contactListQuerySchema coerces `limit` and clamps boundaries
 */
import { describe, expect, it } from "vitest";
import {
  contactCreateSchema,
  contactListQuerySchema,
  contactPatchSchema,
  lgpdAnonymizeSchema,
} from "./contacts";

describe("contactCreateSchema", () => {
  it("accepts minimal valid payload (defaults source=manual)", () => {
    const parsed = contactCreateSchema.parse({ name: "Ana" });
    expect(parsed.source).toBe("manual");
  });

  it("rejects non-E.164 phones", () => {
    const r = contactCreateSchema.safeParse({ phone_number: "11999998888" });
    expect(r.success).toBe(false);
  });

  it("accepts E.164 phones", () => {
    const r = contactCreateSchema.safeParse({ phone_number: "+237699998888" });
    expect(r.success).toBe(true);
  });

  it("rejects malformed emails", () => {
    const r = contactCreateSchema.safeParse({ email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("accepts African ID numbers as free text (CNI, NIU, passport)", () => {
    for (const cpf of ["123456789", "M012345678901X", "CM-AB 1234567", "P0123456"]) {
      const r = contactCreateSchema.safeParse({ cpf });
      expect(r.success, cpf).toBe(true);
    }
  });

  it("does not apply the Brazilian CPF check digits anymore", () => {
    // Was rejected by the old check-digit validator; an ID is not a CPF.
    const r = contactCreateSchema.safeParse({ cpf: "12345678900" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty or oversized ID number", () => {
    expect(contactCreateSchema.safeParse({ cpf: "   " }).success).toBe(false);
    expect(contactCreateSchema.safeParse({ cpf: "9".repeat(65) }).success).toBe(false);
  });

  it("rejects malformed birthdate", () => {
    const r = contactCreateSchema.safeParse({ birthdate: "01/01/1990" });
    expect(r.success).toBe(false);
  });
});

describe("contactPatchSchema", () => {
  it("não materializa source=manual quando PATCH omite source", () => {
    const parsed = contactPatchSchema.parse({ tags: ["vip"] });

    expect(parsed).toEqual({ tags: ["vip"] });
    expect("source" in parsed).toBe(false);
  });
});

describe("contactListQuerySchema", () => {
  it("defaults limit to 50", () => {
    const r = contactListQuerySchema.parse({});
    expect(r.limit).toBe(50);
  });

  it("coerces limit string", () => {
    const r = contactListQuerySchema.parse({ limit: "25" });
    expect(r.limit).toBe(25);
  });

  it("rejects limit > 100", () => {
    const r = contactListQuerySchema.safeParse({ limit: "500" });
    expect(r.success).toBe(false);
  });

  it("defaults order_by and order_dir", () => {
    const r = contactListQuerySchema.parse({});
    expect(r.order_by).toBe("last_activity_at");
    expect(r.order_dir).toBe("desc");
  });

  it("accepts valid order_by", () => {
    const r = contactListQuerySchema.parse({ order_by: "display_name", order_dir: "asc" });
    expect(r.order_by).toBe("display_name");
    expect(r.order_dir).toBe("asc");
  });
});

describe("lgpdAnonymizeSchema", () => {
  it("requires justification with at least 10 chars", () => {
    const r = lgpdAnonymizeSchema.safeParse({
      contact_id: "00000000-0000-0000-0000-000000000000",
      justification: "curto",
    });
    expect(r.success).toBe(false);
  });

  it("requires uuid contact_id", () => {
    const r = lgpdAnonymizeSchema.safeParse({
      contact_id: "not-a-uuid",
      justification: "Solicitação formal LGPD do titular.",
    });
    expect(r.success).toBe(false);
  });

  it("accepts well-formed payload", () => {
    const r = lgpdAnonymizeSchema.safeParse({
      contact_id: "11111111-1111-4111-8111-111111111111",
      justification: "Solicitação formal LGPD do titular do dado.",
    });
    expect(r.success).toBe(true);
  });
});
