/**
 * PII anonymizer for the conversations RAG ingestion pipeline (S-06.07).
 *
 * Replaces, in order:
 *   1. Téléphone international (+237 6XX…, +225 07…, +55 11…) -> [TÉLÉPHONE]
 *   2. N° d'identification annoncé (CNI, NIU, passeport…)      -> [ID]
 *   3. CPF (format brésilien hérité)                           -> [CPF]
 *   4. Email                                                   -> [EMAIL]
 *   5. Téléphone local — formats brésiliens hérités ET formats
 *      d'Afrique francophone (Cameroun 6XX XX XX XX, Sénégal
 *      77 123 45 67, Côte d'Ivoire 07 07 12 34 56)            -> [TÉLÉPHONE]
 *   6. CEP / code postal à 8 chiffres                          -> [CODE_POSTAL]
 *   7. Prénoms (lookup PT-BR + Afrique francophone)            -> [NOM]
 *
 * The international phone runs FIRST: it is anchored on `+`, and running the
 * CPF pass before it would eat an 11-digit `+225…` number and leave a dangling
 * `+`. CPF runs before CEP because both share the digit-dash shape.
 *
 * Returns the anonymized string AND the list of hits (used by the ingestor's
 * ">=10 messages, 0 hits -> flag for manual review" guard).
 */

import { FIRST_NAMES_AFRIQUE_FR } from "./afrique-fr-first-names";
import { FIRST_NAMES_PT_BR } from "./pt-br-first-names";

export type PiiType = "phone_intl" | "national_id" | "cpf" | "email" | "phone" | "phone_africa" | "cep";

/**
 * Build fresh regex instances per call. The `g` flag carries `lastIndex`
 * across `.test()` calls and would silently corrupt the leak guard.
 *
 * Key order is the pass order of `anonymize()`.
 */
export function buildPiiPatterns(): Record<PiiType, RegExp> {
  return {
    // `+` puis 8 à 13 chiffres, séparateurs espace/point/tiret tolérés.
    phone_intl: /(?<![\w+])\+\d{1,3}(?:[\s.-]?\d){7,12}(?!\d)/g,
    // Numéro précédé de son libellé : « CNI : 123456789 », « NIU M0123… »,
    // « passeport n° AA1234567 ». Sans libellé, un numéro de pièce est
    // indiscernable d'un numéro de commande — on ne masque que l'annoncé, et
    // seulement s'il contient au moins un chiffre (« passeport expiré » reste).
    national_id:
      /\b(?:CNI|NIU|NINA|NNI|passeport|carte\s+d['’]identit[ée]|pi[èe]ce\s+d['’]identit[ée]|n[°o]\s*d['’]identification|num[ée]ro\s+d['’]identification)\s*(?:n[°o]\.?\s*)?[:#]?\s*(?=[A-Z0-9 ./-]{0,24}\d)[A-Z0-9](?:[A-Z0-9 ./-]{4,23})[A-Z0-9]/gi,
    cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /\b\(?\d{2}\)?\s*9?\d{4,5}-?\d{4}\b/g,
    // Cameroun : mobile 6XX XX XX XX, fixe 22X/23X ; Sénégal : 7X XXX XX XX ;
    // Côte d'Ivoire (10 chiffres) : 0X XX XX XX XX.
    phone_africa:
      /\b(?:(?:6\d{2}|2[23]\d)(?:[\s.-]?\d{2}){3}|7[05-8][\s.-]?\d{3}(?:[\s.-]?\d{2}){2}|0\d(?:[\s.-]?\d{2}){4})\b/g,
    cep: /\b\d{5}-?\d{3}\b/g,
  };
}

export const PII_PATTERNS = buildPiiPatterns();

export interface AnonymizeHit {
  type: "cpf" | "email" | "phone" | "cep" | "name" | "national_id";
  original: string;
  replacement: string;
}

export interface AnonymizeResult {
  anonymized: string;
  hits: AnonymizeHit[];
}

const REPLACEMENT_BY_TYPE: Record<AnonymizeHit["type"], string> = {
  cpf: "[CPF]",
  email: "[EMAIL]",
  phone: "[TÉLÉPHONE]",
  cep: "[CODE_POSTAL]",
  name: "[NOM]",
  national_id: "[ID]",
};

/** Les variantes de téléphone sont rapportées sous un seul type public. */
function hitTypeOf(type: PiiType): AnonymizeHit["type"] {
  if (type === "phone_intl" || type === "phone_africa") return "phone";
  return type;
}

export function anonymize(text: string): AnonymizeResult {
  const hits: AnonymizeHit[] = [];
  let out = text;

  for (const [type, pattern] of Object.entries(buildPiiPatterns()) as [PiiType, RegExp][]) {
    const hitType = hitTypeOf(type);
    const replacement = REPLACEMENT_BY_TYPE[hitType];
    out = out.replace(pattern, (match) => {
      hits.push({ type: hitType, original: match, replacement });
      return replacement;
    });
  }

  // Name pass: tokenize on Unicode letters; replace tokens whose lowercase
  // form is in one of the curated first-name sets.
  const nameRe = /\b[\p{L}]+\b/gu;
  out = out.replace(nameRe, (match) => {
    const lower = match.toLowerCase();
    if (FIRST_NAMES_PT_BR.has(lower) || FIRST_NAMES_AFRIQUE_FR.has(lower)) {
      hits.push({ type: "name", original: match, replacement: "[NOM]" });
      return "[NOM]";
    }
    return match;
  });

  return { anonymized: out, hits };
}

/**
 * Final guard: scans `text` with a fresh pattern instance for each PII type
 * and returns the first matching type, or null when clean.
 */
export function detectResidualPii(text: string): AnonymizeHit["type"] | null {
  const patterns = buildPiiPatterns();
  for (const [type, pattern] of Object.entries(patterns) as [PiiType, RegExp][]) {
    if (pattern.test(text)) {
      return hitTypeOf(type);
    }
  }
  return null;
}
