import { describe, expect, it } from "vitest";

import { anonymize, detectResidualPii } from "@/lib/ai/anonymize";

/**
 * L'anonymiseur du RAG de conversations masquait les formats brésiliens
 * (CPF, téléphone (11) 9XXXX-XXXX, CEP) et laissait passer en clair les
 * numéros d'Afrique francophone — le marché réel de ce fork. Ce fichier fige
 * les deux côtés : le motif brésilien n'est PAS affaibli, et les formats
 * africains sont masqués.
 */
describe("anonymize — formats d'Afrique francophone", () => {
  it.each([
    ["Cameroun international", "Appelez-moi au +237 6 99 99 88 88 svp"],
    ["Cameroun international collé", "mon numéro +237699998888"],
    ["Côte d'Ivoire international", "WhatsApp : +225 07 07 12 34 56"],
    ["Sénégal international", "joignable au +221 77 123 45 67"],
    ["Cameroun local", "mon numéro c'est 699 99 88 88"],
    ["Cameroun local collé", "écrivez au 677123456"],
    ["Sénégal local", "appelle le 77 123 45 67 demain"],
    ["Côte d'Ivoire local", "contact : 07 07 12 34 56"],
  ])("masque le téléphone (%s)", (_cas, texte) => {
    const { anonymized, hits } = anonymize(texte);
    expect(hits.some((h) => h.type === "phone")).toBe(true);
    expect(anonymized).toContain("[TÉLÉPHONE]");
    expect(anonymized).not.toMatch(/\d{2}/);
    expect(detectResidualPii(anonymized)).toBeNull();
  });

  it.each([
    "Voici ma CNI : 112345678",
    "NIU M012345678901X pour la facture",
    "passeport n° AA1234567",
    "numéro d'identification 1 234 567 89",
  ])("masque un numéro d'identification annoncé : %s", (texte) => {
    const { anonymized, hits } = anonymize(texte);
    expect(hits.some((h) => h.type === "national_id")).toBe(true);
    expect(anonymized).toContain("[ID]");
    expect(anonymized).not.toMatch(/\d{3}/);
  });

  it("ne masque pas une mention sans numéro (« passeport expiré »)", () => {
    const { anonymized } = anonymize("mon passeport est expiré, je passe demain");
    expect(anonymized).toBe("mon passeport est expiré, je passe demain");
  });

  it("masque les prénoms courants d'Afrique francophone", () => {
    const { anonymized } = anonymize("Bonjour, c'est Aïcha, la sœur de Mamadou");
    expect(anonymized).toBe("Bonjour, c'est [NOM], la sœur de [NOM]");
  });

  it("garde le contexte produit (prix, quantités)", () => {
    const texte = "La robe wax coûte 15000 FCFA, il en reste 3 en taille 42";
    expect(anonymize(texte).anonymized).toBe(texte);
  });
});

describe("anonymize — formats brésiliens hérités (non affaiblis)", () => {
  it("masque toujours le CPF", () => {
    const { anonymized } = anonymize("meu CPF é 529.982.247-25");
    expect(anonymized).toContain("[CPF]");
    expect(anonymized).not.toContain("529");
  });

  it("masque toujours le téléphone brésilien", () => {
    const { anonymized } = anonymize("liga no (11) 99999-8888");
    expect(anonymized).toContain("[TÉLÉPHONE]");
    expect(anonymized).not.toContain("8888");
  });

  it("masque l'e-mail", () => {
    expect(anonymize("ecris à awa.diop@exemple.sn").anonymized).toBe("ecris à [EMAIL]");
  });
});
