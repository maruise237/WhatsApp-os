/**
 * Extração determinística de promessas estruturadas PT-BR + validação contra a
 * tabela versionada da org (F4-01; blueprint 6.5). SEM LLM: a camada semântica
 * de texto livre ("faço de graça", "a gente resolve") é da F4-02 — aqui só o que
 * casa regex de valor estruturado.
 *
 * ponytail: a heurística cobre os formatos comuns de moeda/percentual/parcelamento
 * PT-BR (R$ 1 / R$1 / R$ 1.497,00 / N real(is) / N% / N por cento / Nx / N vezes).
 * Texto livre ambíguo e formatos exóticos (moeda por extenso, "metade do preço") são
 * o teto conhecido → cobertos pela camada semântica F4-02, não aqui. Conservador de
 * propósito: só dispara em valor claramente estruturado (evita falso-positivo tipo
 * "temos 500 clientes" — sem R$/reais não vira preço).
 */

export type PromiseKind = 'price' | 'discount' | 'installments';

export interface DetectedPromise {
  kind: PromiseKind;
  /** preço em centavos; desconto em %; parcelamento em nº de parcelas. */
  value: number;
}

export interface PromiseDecision {
  allow: boolean;
  code?: string;
  /** erro instrutivo pt-br que volta AO MODELO (o quê foi vetado + o que fazer). */
  reason?: string;
  /** detectado vs permitido para o trace de auditoria (números, nunca o corpo — sem PII). */
  detail?: Record<string, string | number>;
}

// Número monetário BR: "1", "500", "1,00", "1.497,00" (milhar '.', decimal ','). O
// grupo aceita com ou sem centavos e com ou sem separador de milhar.
const MONEY = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{2})?|\\d+(?:,\\d{2})?)';
const RE_PRICE_RS = new RegExp(`R\\$\\s*${MONEY}`, 'gi');
const RE_PRICE_REAIS = new RegExp(`${MONEY}\\s*(?:reais|real)\\b`, 'gi');
// Franc CFA (XAF/XOF), le marché par défaut : « 500 FCFA », « 15 000 F CFA »,
// « 15.000 XAF », « 2500 francs ». Pas de décimales (le CFA n'en a pas) ; milliers
// groupés par espace (y compris insécable), point, ou rien. Exige l'unité CFA
// juste après le nombre — « 500 clients » ne devient jamais un prix.
const MONEY_CFA = '(\\d{1,3}(?:[ \\u00a0\\u202f.]\\d{3})+|\\d+)';
const RE_PRICE_CFA = new RegExp(
  `${MONEY_CFA}\\s*(?:F\\s?CFA|FCFA|XAF|XOF|francs?(?:\\s+CFA)?)(?![\\p{L}\\d])`,
  'giu',
);
// Desconto: exige a palavra "desconto"/"off" adjacente ao percentual (conservador —
// "100% satisfação" não é desconto).
const RE_DISCOUNT_PREFIX = /desconto\s+(?:de\s+)?(\d{1,3})\s*(?:%|por\s*cento)/gi;
const RE_DISCOUNT_SUFFIX = /(\d{1,3})\s*(?:%|por\s*cento)\s*(?:de\s+)?(?:desconto|off)/gi;
// Même prudence en français : le pourcentage doit toucher « remise », « réduction »
// ou « rabais » (« 100 % satisfait » n'est pas une remise).
const RE_REMISE_PREFIX =
  /(?:remise|r[ée]duction|rabais)\s+(?:de\s+)?(\d{1,3})\s*(?:%|pour\s*cent)/gi;
const RE_REMISE_SUFFIX =
  /(\d{1,3})\s*(?:%|pour\s*cent)\s*(?:de\s+)?(?:remise|r[ée]duction|rabais)/gi;
// Parcelamento REAL: exige contexto de PAGAMENTO adjacente ao "Nx"/"N vezes" — mesmo
// rigor do desconto (que exige "desconto"/"off"). Sem o contexto, "10x mais rápido" /
// "3x crescimento" são copy de marketing, NÃO parcela (evita falso-positivo). Dois lados:
//   PREFIX  — "parcelado em 12x", "dividido em 12x", "em 12x", "em até 12x";
//   SUFFIX  — "12x sem juros", "12x de R$ 50", "12x no cartão/boleto", "12x iguais".
const RE_INSTALLMENTS_PREFIX =
  /\b(?:parcel\w*|dividid\w*\s+em|em(?:\s+at[ée])?)\s+(\d{1,3})\s*(?:x\b|vezes\b)/gi;
// Paiement fractionné en français : « payable en 3 fois », « en 4 versements »,
// « 3 fois sans frais », « 6 mensualités de 10 000 FCFA ». « 2 fois plus rapide »
// n'a pas de contexte de paiement et ne compte pas.
const RE_FRACTIONNE_PREFIX =
  /\b(?:payable|payer|r[ée]gler|r[ée]glable)?\s*en\s+(\d{1,3})\s+(?:fois\b(?!\s+plus)|versements?\b|mensualit[ée]s?\b|tranches?\b)/gi;
const RE_FRACTIONNE_SUFFIX =
  /(\d{1,3})\s+(?:fois\s+sans\s+frais|(?:versements?|mensualit[ée]s?|tranches?)\s+de\b)/gi;
const RE_INSTALLMENTS_SUFFIX =
  /(\d{1,3})\s*(?:x\b|vezes\b)\s+(?:sem\s+juros|de\s*R\$|no\s+(?:cart[ãa]o|boleto)|iguais)/gi;

/** "15 000" / "15.000" / "15000" (CFA, sans décimales) → 1500000 centimes. */
function cfaToCents(raw: string): number {
  return Number(raw.replace(/[\s.]/g, '')) * 100;
}

/** "1.497,00" → 149700 centavos; "1" → 100; "500" → 50000. */
function moneyToCents(raw: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(normalized) * 100);
}

function collect(re: RegExp, text: string, map: (m: RegExpExecArray) => number): number[] {
  const out: number[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(map(m));
  return out;
}

/** Todos os valores estruturados detectados na mensagem candidata (determinístico). */
export function extractPromises(body: string): DetectedPromise[] {
  const out: DetectedPromise[] = [];
  for (const cents of collect(RE_PRICE_RS, body, (m) => moneyToCents(m[1] ?? '0')))
    out.push({ kind: 'price', value: cents });
  for (const cents of collect(RE_PRICE_REAIS, body, (m) => moneyToCents(m[1] ?? '0')))
    out.push({ kind: 'price', value: cents });
  for (const cents of collect(RE_PRICE_CFA, body, (m) => cfaToCents(m[1] ?? '0')))
    out.push({ kind: 'price', value: cents });
  for (const pct of collect(RE_DISCOUNT_PREFIX, body, (m) => Number(m[1])))
    out.push({ kind: 'discount', value: pct });
  for (const pct of collect(RE_DISCOUNT_SUFFIX, body, (m) => Number(m[1])))
    out.push({ kind: 'discount', value: pct });
  for (const pct of collect(RE_REMISE_PREFIX, body, (m) => Number(m[1])))
    out.push({ kind: 'discount', value: pct });
  for (const pct of collect(RE_REMISE_SUFFIX, body, (m) => Number(m[1])))
    out.push({ kind: 'discount', value: pct });
  // Dedup por valor: "em 12x sem juros" casa prefix E suffix — a mesma parcela não vira
  // duas detecções (o veto só compara o valor contra o teto da tabela).
  const installments = new Set<number>();
  for (const n of collect(RE_INSTALLMENTS_PREFIX, body, (m) => Number(m[1]))) installments.add(n);
  for (const n of collect(RE_INSTALLMENTS_SUFFIX, body, (m) => Number(m[1]))) installments.add(n);
  for (const n of collect(RE_FRACTIONNE_PREFIX, body, (m) => Number(m[1]))) installments.add(n);
  for (const n of collect(RE_FRACTIONNE_SUFFIX, body, (m) => Number(m[1]))) installments.add(n);
  for (const n of installments) out.push({ kind: 'installments', value: n });
  return out;
}

const brl = (cents: number): string =>
  `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Vete quando um valor detectado CONTRADIZ claramente a tabela versionada da org
 * (preço abaixo do piso, desconto/parcelas acima do teto). Primeira contradição vence.
 * Sem tabela ou sem campo fiscalizado → passa (conservador: nada solto vira veto).
 */
export function decidePromise(args: { candidate: string; table: import('./table').PromiseTable }): PromiseDecision {
  const { table } = args;
  for (const p of extractPromises(args.candidate)) {
    if (p.kind === 'price' && table.minPriceCents !== undefined && p.value < table.minPriceCents) {
      return {
        allow: false,
        code: 'promise_out_of_table',
        reason:
          `le prix ${brl(p.value)} est hors du tableau du playbook (minimum autorisé : ` +
          `${brl(table.minPriceCents)}) ; corrigez avec une valeur du tableau avant de renvoyer.`,
        detail: { promise_kind: 'price', detected_cents: p.value, allowed_min_cents: table.minPriceCents },
      };
    }
    if (p.kind === 'discount' && table.maxDiscountPercent !== undefined && p.value > table.maxDiscountPercent) {
      return {
        allow: false,
        code: 'promise_out_of_table',
        reason:
          `la remise de ${p.value}% est hors du tableau du playbook (maximum autorisé : ` +
          `${table.maxDiscountPercent}%) ; corrigez avant de renvoyer.`,
        detail: { promise_kind: 'discount', detected_percent: p.value, allowed_max_percent: table.maxDiscountPercent },
      };
    }
    if (p.kind === 'installments' && table.maxInstallments !== undefined && p.value > table.maxInstallments) {
      return {
        allow: false,
        code: 'promise_out_of_table',
        reason:
          `le paiement en ${p.value} fois est hors du tableau du playbook (maximum autorisé : ` +
          `${table.maxInstallments} fois) ; corrigez avant de renvoyer.`,
        detail: { promise_kind: 'installments', detected: p.value, allowed_max: table.maxInstallments },
      };
    }
  }
  return { allow: true };
}
