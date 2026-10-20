import { describe, it, expect } from "vitest";
import { mapInboundPayload, normalizePhone, verifyInboundSignature } from "@/lib/webhooks/inbound";
import { createHmac } from "node:crypto";

describe("normalizePhone", () => {
  it("já em E.164 passa direto", () => expect(normalizePhone("+5511998765432")).toBe("+5511998765432"));
  it("numéro local camerounais reçoit +237 par défaut", () =>
    expect(normalizePhone("6 99 87 65 43")).toBe("+237699876543"));
  it("indicatif sans + gardé", () => expect(normalizePhone("237699876543")).toBe("+237699876543"));
  it("com 55 na frente sem +", () => expect(normalizePhone("5511998765432")).toBe("+5511998765432"));
  it("org brésilienne (55) : DDD+numero ganha +55", () =>
    expect(normalizePhone("11 99876-5432", "55")).toBe("+5511998765432"));
  it("org ivoirienne (225) : le 0 initial fait partie du numéro", () =>
    expect(normalizePhone("07 01 02 03 04", "225")).toBe("+2250701020304"));
  it("org française (33) : le 0 interurbain est retiré", () =>
    expect(normalizePhone("06 12 34 56 78", "33")).toBe("+33612345678"));
  it("lixo → null", () => expect(normalizePhone("abc")).toBeNull());
  it("vazio/não-string → null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(42 as unknown)).toBeNull();
  });
});

describe("mapInboundPayload", () => {
  it("aliases default: nome/telefone/email", () => {
    const m = mapInboundPayload({ nome: "Ana", telefone: "699876543", email: "a@b.com" });
    expect(m).toMatchObject({ name: "Ana", phone: "+237699876543", email: "a@b.com" });
  });
  it("indicatif de l'organisation appliqué au numéro local", () => {
    const m = mapInboundPayload({ telefone: "11998765432" }, {}, "55");
    expect(m.phone).toBe("+5511998765432");
  });
  it("whatsapp como alias de phone; extras viram custom_fields; utm_* vira source_metadata", () => {
    const m = mapInboundPayload({ name: "Bo", whatsapp: "+5511998765432", empresa: "ACME", utm_source: "instagram" });
    expect(m.phone).toBe("+5511998765432");
    expect(m.custom_fields).toEqual({ empresa: "ACME" });
    expect(m.source_metadata).toEqual({ utm_source: "instagram" });
  });
  it("field_map custom tem precedência sobre defaults", () => {
    const m = mapInboundPayload({ contato: "Zé" }, { name: ["contato"] });
    expect(m.name).toBe("Zé");
  });
  it("payload sem nada mapeável → tudo null e extras preservados", () => {
    const m = mapInboundPayload({ foo: "bar" });
    expect(m.name).toBeNull();
    expect(m.phone).toBeNull();
    expect(m.custom_fields).toEqual({ foo: "bar" });
  });
  it("valores não-string são stringificados em custom_fields; objetos aninhados descartados", () => {
    const m = mapInboundPayload({ nome: "Ana", idade: 30, nested: { a: 1 } });
    expect(m.custom_fields).toEqual({ idade: "30" });
  });
});

describe("verifyInboundSignature", () => {
  const body = '{"nome":"Ana"}';
  const secret = "s3cr3t";
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  it("assinatura válida", () => expect(verifyInboundSignature(body, sig, secret)).toBe(true));
  it("assinatura errada", () => expect(verifyInboundSignature(body, "deadbeef", secret)).toBe(false));
  it("header ausente", () => expect(verifyInboundSignature(body, null, secret)).toBe(false));
  it("header com tamanho diferente não lança (timingSafeEqual exige mesmo length)", () =>
    expect(verifyInboundSignature(body, "abc", secret)).toBe(false));
});
