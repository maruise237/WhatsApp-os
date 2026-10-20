import { describe, it, expect } from "vitest";

import {
  centsVersSaisie,
  decimalesDeDevise,
  formatMontant,
  formatSaisieComprise,
  parseMontantEnCents,
} from "./money";

/** Devise à 2 décimales pour les cas historiques (EUR). */
const parseReaisToCents = (v: string) => parseMontantEnCents(v, "EUR");

describe("parseReaisToCents", () => {
  it("lê ponto como decimal quando o grupo final não é de milhar", () => {
    // O defeito que originou este arquivo: "249.90" virava 2499000 centavos
    // (R$ 24.990,00) porque todo ponto era descartado como separador de milhar.
    expect(parseReaisToCents("249.90")).toBe(24990);
    expect(parseReaisToCents("1234.5")).toBe(123450);
    expect(parseReaisToCents("0.99")).toBe(99);
  });

  it("lê vírgula como decimal (fr-FR)", () => {
    expect(parseReaisToCents("249,90")).toBe(24990);
    expect(parseReaisToCents("1.234,56")).toBe(123456);
    expect(parseReaisToCents("1.234.567,89")).toBe(123456789);
  });

  it("trata ponto seguido de 3 dígitos como milhar", () => {
    expect(parseReaisToCents("1.234")).toBe(123400);
    expect(parseReaisToCents("1.234.567")).toBe(123456700);
  });

  it("aceita o formato en quando o último separador é o ponto", () => {
    expect(parseReaisToCents("1,234.56")).toBe(123456);
  });

  it("lê número simples", () => {
    expect(parseReaisToCents("250")).toBe(25000);
    expect(parseReaisToCents(" 250 ")).toBe(25000);
  });

  it("devolve null para o que não é valor", () => {
    expect(parseReaisToCents("")).toBeNull();
    expect(parseReaisToCents("abc")).toBeNull();
    expect(parseReaisToCents("R$ 10")).toBeNull();
    expect(parseReaisToCents("-5")).toBeNull();
  });
});

describe("XAF (défaut) — sans décimales", () => {
  const nb = (v: string) => v.replace(/[\u00a0\u202f]/g, " ");

  it("XAF a 0 décimale, EUR 2", () => {
    expect(decimalesDeDevise("XAF")).toBe(0);
    expect(decimalesDeDevise("XOF")).toBe(0);
    expect(decimalesDeDevise("EUR")).toBe(2);
    expect(decimalesDeDevise("???")).toBe(2);
  });

  it("formatMontant : « 15 000 FCFA », sans « ,00 »", () => {
    expect(nb(formatMontant(1_500_000))).toBe("15 000 FCFA");
    expect(nb(formatMontant(1_500_000, "XAF"))).toBe("15 000 FCFA");
    expect(nb(formatMontant(24990, "EUR"))).toBe("249,90 €");
    expect(formatMontant(100, "ZZZZ")).toContain("ZZZZ");
  });

  it("saisie en XAF : milliers par espace, point ou virgule ; stockage en centimes", () => {
    expect(parseMontantEnCents("15000")).toBe(1_500_000);
    expect(parseMontantEnCents("15 000")).toBe(1_500_000);
    expect(parseMontantEnCents("15.000")).toBe(1_500_000);
    expect(parseMontantEnCents("15,000")).toBe(1_500_000);
    expect(parseMontantEnCents("1 500 000")).toBe(150_000_000);
    expect(parseMontantEnCents("2500,5")).toBe(250_100);
  });

  it("champ pré-rempli et écho sans décimales inventées", () => {
    expect(centsVersSaisie(1_500_000)).toBe("15000");
    expect(centsVersSaisie(24990, "EUR")).toBe("249,90");
    expect(nb(formatSaisieComprise(1_500_000))).toBe("15 000");
    expect(nb(formatSaisieComprise(24990, "EUR"))).toBe("249,90");
  });
});
