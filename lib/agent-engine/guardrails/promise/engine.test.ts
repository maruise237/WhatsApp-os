import { describe, expect, it } from "vitest";

import { decidePromise, extractPromises } from "./engine";

/**
 * Le garde-fou de prix ne lisait que le réal (« R$ 1 », « 10 reais ») : un agent
 * qui écrivait « je vous le fais à 500 FCFA » passait sans contrôle sur le marché
 * par défaut du produit.
 */
describe("prix en franc CFA", () => {
  it.each([
    ["Je vous le fais à 500 FCFA.", 50_000],
    ["Le prix est de 15 000 FCFA", 1_500_000],
    ["Seulement 15 000 F CFA aujourd’hui", 1_500_000],
    ["Total : 15.000 XAF", 1_500_000],
    ["Disponible à 2500 francs", 250_000],
    ["Livraison 1 000 XOF", 100_000],
  ])("%s → %d centimes", (texte, cents) => {
    expect(extractPromises(texte)).toEqual([{ kind: "price", value: cents }]);
  });

  it("un nombre sans unité CFA n'est pas un prix", () => {
    expect(extractPromises("Nous avons 500 clients et 3 boutiques")).toEqual([]);
    expect(extractPromises("Appelez le 699 99 88 88")).toEqual([]);
  });

  it("veto quand le prix CFA est sous le plancher du tableau", () => {
    const d = decidePromise({ candidate: "Je vous le laisse à 500 FCFA", table: { minPriceCents: 1_000_000 } });
    expect(d.allow).toBe(false);
    expect(d.code).toBe("promise_out_of_table");
  });

  it("le réal reste détecté (clones brésiliens)", () => {
    expect(extractPromises("por R$ 1.497,00")).toEqual([{ kind: "price", value: 149_700 }]);
  });
});

describe("remises et paiement fractionné en français", () => {
  it.each([
    ["Je vous fais une remise de 20 % aujourd'hui", 20],
    ["Profitez de 15% de réduction", 15],
    ["un rabais de 10 pour cent", 10],
  ])("remise : %s", (texte, pct) => {
    expect(extractPromises(texte)).toEqual([{ kind: "discount", value: pct }]);
  });

  it.each([
    ["C'est payable en 3 fois", 3],
    ["Vous pouvez régler en 4 versements", 4],
    ["3 fois sans frais", 3],
    ["6 mensualités de 10 000 FCFA", 6],
  ])("paiement fractionné : %s", (texte, n) => {
    expect(extractPromises(texte).filter((p) => p.kind === "installments")).toEqual([
      { kind: "installments", value: n },
    ]);
  });

  it("n'invente ni remise ni paiement fractionné", () => {
    expect(extractPromises("Satisfait à 100 %, livré en 2 fois plus vite")).toEqual([]);
    expect(extractPromises("Je vous ai déjà écrit 3 fois")).toEqual([]);
  });
});
