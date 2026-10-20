import { DEVISE_PAR_DEFAUT, LOCALE_PAR_DEFAUT } from "@/lib/marche/defauts";

/**
 * Nombre de décimales qu'une devise affiche (ISO-4217) : 0 pour XAF/XOF/GNF,
 * 2 pour EUR/USD… Demandé à `Intl`, pas à une table à nous. Code inconnu ⇒ 2.
 *
 * Le STOCKAGE ne change pas : tout montant reste en `_cents` (centièmes de
 * l'unité), y compris en XAF — 15 000 FCFA = 1 500 000. C'est l'affichage et la
 * saisie qui respectent les décimales de la devise.
 */
export function decimalesDeDevise(devise: string | null | undefined): number {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency: devise ?? DEVISE_PAR_DEFAUT })
        .resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Centimes → « 15 000 FCFA », « 249,90 € ». Pour tout montant MÉTIER (lead,
 * commande, produit). La devise vient de la ligne ; absente ⇒ XAF.
 * Ne lance jamais : devise invalide ⇒ « 15 000 ABC ».
 */
export function formatMontant(
  cents: number | null | undefined,
  devise: string | null | undefined = DEVISE_PAR_DEFAUT,
  locale: string = LOCALE_PAR_DEFAUT,
): string {
  const code = (devise ?? DEVISE_PAR_DEFAUT).toUpperCase();
  const valeur = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(valeur);
  } catch {
    return `${valeur.toLocaleString(locale, { maximumFractionDigits: 2 })} ${code}`;
  }
}

/**
 * Conversion de la valeur saisie (unités de la devise) en centimes.
 *
 * La version d'origine vivait copiée dans trois formulaires et faisait
 * `replace(/\./g, "").replace(",", ".")` — TOUT point devenait séparateur de
 * milliers. « 249.90 » (le geste naturel au pavé numérique) était enregistré
 * cent fois plus grand, sans erreur à l'écran.
 *
 * Désambiguïsation sans deviner — un groupe de milliers a TOUJOURS 3 chiffres :
 *
 *   "249,90"      → virgule décimale                         → 24990
 *   "249.90"      → point suivi de 2 chiffres = décimal      → 24990
 *   "1.234"       → point suivi de 3 chiffres = milliers     → 123400
 *   "1.234,56"    → il y a une virgule : les points = milliers → 123456
 *   "1,234.56"    → format en : le dernier séparateur est décimal → 123456
 *   "15 000"      → espaces ignorés                           → 1500000
 *
 * Devise SANS décimales (XAF, XOF…) : une virgule suivie de 3 chiffres est
 * aussi un séparateur de milliers (« 15,000 FCFA » = quinze mille), et la
 * valeur est arrondie à l'unité — 15 000,5 FCFA n'existe pas.
 *
 * Renvoie null quand ce n'est pas un nombre — l'appelant décide du message.
 */
export function parseMontantEnCents(
  input: string,
  devise: string | null | undefined = DEVISE_PAR_DEFAUT,
): number | null {
  const raw = input.trim();
  if (raw.length === 0) return null;
  if (!/^[\d.,\s\u00a0\u202f]+$/.test(raw)) return null;

  const sansDecimales = decimalesDeDevise(devise) === 0;
  const s = raw.replace(/[\s\u00a0\u202f]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  let decimalSep = "";
  if (lastComma >= 0 && lastDot >= 0) {
    // Les deux présents : le dernier est le décimal.
    decimalSep = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    decimalSep = sansDecimales && s.length - lastComma - 1 === 3 ? "" : ",";
  } else if (lastDot >= 0) {
    // Seulement des points : milliers seulement si le groupe final a 3 chiffres.
    decimalSep = s.length - lastDot - 1 === 3 ? "" : ".";
  }

  let normalized: string;
  if (decimalSep === "") {
    normalized = s.replace(/[.,]/g, "");
  } else {
    const cut = decimalSep === "," ? lastComma : lastDot;
    const inteiro = s.slice(0, cut).replace(/[.,]/g, "");
    const frac = s.slice(cut + 1);
    if (!/^\d*$/.test(frac)) return null;
    normalized = `${inteiro || "0"}.${frac}`;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return sansDecimales ? Math.round(n) * 100 : Math.round(n * 100);
}

/**
 * Centimes → texte du champ de saisie, SANS symbole : « 15000 » en XAF,
 * « 249,90 » en EUR. Pré-remplit le champ d'édition sans inventer de « ,00 ».
 */
export function centsVersSaisie(
  cents: number | null | undefined,
  devise: string | null | undefined = DEVISE_PAR_DEFAUT,
): string {
  if (cents === null || cents === undefined) return "";
  const dec = decimalesDeDevise(devise);
  return (cents / 100).toFixed(dec).replace(".", ",");
}

/**
 * Centimes → « 15 000 » / « 249,90 » : écho à l'écran de ce qui a été compris,
 * sans symbole (la devise est affichée à côté), décimales de la devise.
 */
export function formatSaisieComprise(
  cents: number,
  devise: string | null | undefined = DEVISE_PAR_DEFAUT,
): string {
  const dec = decimalesDeDevise(devise);
  return (cents / 100).toLocaleString(LOCALE_PAR_DEFAUT, {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

/**
 * Centavos de DÓLAR → "US$ 249,90". Para todo número que sai de
 * `llm_calls.cost_cents` / `ai_invocations.cost_cents`.
 *
 * ⚠️ EXISTE PORQUE O NÚMERO É DÓLAR E SETE TELAS O ESCREVIAM EM REAL.
 * `lib/agent-engine/edge/llm/pricing.ts` cota o provedor em USD e grava centavo
 * de USD; formatar em BRL fazia o dono do negócio ler um valor ~5x menor do que
 * o que estava sendo cobrado dele — e, depois que o teto passou a vincular,
 * armar um limite ~5x maior do que pensava. A conversão de moeda NÃO é feita
 * (exigiria fonte de câmbio, dependência externa nova num produto self-host):
 * o que muda é o rótulo dizer a unidade real.
 *
 * Vírgula decimal porque a frase é fr-FR; "US$" porque a moeda é dólar. É a
 * mesma escolha de `emDolares` em `lib/agent-engine/edge/llm/orcamento.ts` —
 * mas ali ela não pode importar daqui (o módulo é do engine e roda no worker).
 */
export function formatCentsUSD(cents: number): string {
  return ((cents ?? 0) / 100).toLocaleString("fr-FR", { style: "currency", currency: "USD" });
}
