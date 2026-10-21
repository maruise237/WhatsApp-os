/**
 * Téléphone saisi par un humain → E.164 (`+<indicatif><numéro>`).
 *
 * ─── Ce qui existait avant ─────────────────────────────────────────────────
 *
 * `normalizePhoneBR` supposait le Brésil : 10 ou 11 chiffres sans `+` étaient
 * lus comme DDD + numéro et recevaient `+55`. Pour un vendeur camerounais,
 * `699 99 88 88` (9 chiffres) était REJETÉ, et `6 99 99 88 88 0` devenait un
 * numéro brésilien inexistant — message envoyé à personne, sans erreur.
 *
 * ─── La règle, générique ───────────────────────────────────────────────────
 *
 *   1. `+…` ou `00…` : le numéro porte déjà son indicatif → gardé tel quel.
 *   2. 11 chiffres ou plus sans `+` : aucun plan national africain (ni la
 *      plupart des autres) n'a de numéro national aussi long — c'est un
 *      indicatif + numéro écrit sans `+` (`237699998888`) → `+` ajouté.
 *   3. Moins de 11 chiffres : numéro LOCAL → reçoit l'indicatif par défaut de
 *      l'organisation (237 par défaut). Le `0` de préfixe interurbain est
 *      retiré seulement dans les pays où il existe (France, RDC, Maroc…) — au
 *      Cameroun, au Sénégal ou en Côte d'Ivoire il n'y en a pas, et en Côte
 *      d'Ivoire le `0` fait partie du numéro.
 *
 * ─── Le Brésil n'est plus le défaut, mais n'est pas cassé ──────────────────
 *
 * Une organisation dont l'indicatif par défaut est `55` garde EXACTEMENT
 * l'ancienne règle (DDD + numéro à 10/11 chiffres, `55` + 10/11 chiffres sans
 * `+`), pour qu'un clone brésilien qui met à jour ne change pas de lecture.
 */
import { INDICATIF_PAR_DEFAUT } from "@/lib/marche/defauts";

/**
 * Pays où le numéro national s'écrit avec un `0` de préfixe interurbain qui
 * DISPARAÎT derrière l'indicatif (`06 12 34 56 78` → `+33 6 12 34 56 78`).
 * Liste volontairement courte : retirer un `0` qui fait partie du numéro
 * (Côte d'Ivoire, Congo-Brazzaville, Gabon) enverrait à un autre abonné.
 */
const PREFIXE_INTERURBAIN_ZERO = new Set([
  "33", // France
  "32", // Belgique
  "41", // Suisse
  "212", // Maroc
  "213", // Algérie
  "243", // RD Congo
  "250", // Rwanda
  "257", // Burundi
  "261", // Madagascar
  "234", // Nigeria
  "44", // Royaume-Uni
  "49", // Allemagne
]);

/** `"+237"`, `"237"`, `"00237"` → `"237"`. Invalide/absent → indicatif par défaut. */
export function normaliserIndicatif(valeur: unknown): string {
  if (typeof valeur !== "string" && typeof valeur !== "number") return INDICATIF_PAR_DEFAUT;
  const chiffres = String(valeur).replace(/\D/g, "").replace(/^00/, "");
  return /^[1-9]\d{0,2}$/.test(chiffres) ? chiffres : INDICATIF_PAR_DEFAUT;
}

/**
 * Indicatif par défaut d'une organisation, lu dans `organizations.settings`
 * (`phone_country_code`). Ne lance jamais : réglage absent ou illisible ⇒ 237.
 */
export function indicatifDeLOrganisation(settings: unknown): string {
  if (!settings || typeof settings !== "object") return INDICATIF_PAR_DEFAUT;
  return normaliserIndicatif((settings as Record<string, unknown>).phone_country_code);
}

function e164(chiffres: string): string | null {
  return /^[1-9]\d{7,14}$/.test(chiffres) ? `+${chiffres}` : null;
}

/** L'ancienne règle brésilienne, gardée pour les organisations en `55`. */
function normaliserBresil(chiffres: string): string | null {
  if (chiffres.length === 12 || chiffres.length === 13) {
    return chiffres.startsWith("55") ? `+${chiffres}` : null;
  }
  if (chiffres.length === 10 || chiffres.length === 11) return `+55${chiffres}`;
  return null;
}

/**
 * Normalise un numéro saisi. `indicatif` = indicatif par défaut de
 * l'organisation (sans `+`) ; absent ⇒ 237. Renvoie `null` quand ce n'est pas
 * un numéro plausible — l'appelant décide du message.
 */
export function normaliserTelephone(
  raw: unknown,
  indicatif: string = INDICATIF_PAR_DEFAUT,
): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const texte = raw.trim();
  // Lettres = pas un téléphone (« abc », « appeler Paul »). Séparateurs usuels OK.
  if (/[A-Za-z]/.test(texte)) return null;
  const chiffres = texte.replace(/\D/g, "");
  if (chiffres.length === 0) return null;

  if (texte.startsWith("+")) return e164(chiffres);
  if (chiffres.startsWith("00")) return e164(chiffres.slice(2));

  const cc = normaliserIndicatif(indicatif);
  if (cc === "55") return normaliserBresil(chiffres);

  if (chiffres.length >= 11) return e164(chiffres);

  let national = chiffres;
  if (PREFIXE_INTERURBAIN_ZERO.has(cc) && national.startsWith("0")) national = national.slice(1);
  if (national.length < 6) return null;
  return e164(`${cc}${national}`);
}
