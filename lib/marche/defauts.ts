/**
 * Le marché par défaut du produit : le Cameroun.
 *
 * Source UNIQUE des défauts régionaux — devise, fuseau, indicatif téléphonique,
 * locale. Avant ce fichier, chaque module supposait le Brésil à sa manière
 * (`'BRL'`, `America/Sao_Paulo`, `+55`, `pt-BR`), et changer de marché voulait
 * dire chasser des dizaines de littéraux.
 *
 * Ce ne sont que des DÉFAUTS : chaque organisation garde son propre fuseau
 * (`organizations.timezone`, `channel_knobs.timezone`), sa langue, son
 * indicatif (`organizations.settings.phone_country_code`) et la devise de
 * chaque montant (`*.currency`). Les défauts SQL correspondants sont posés par
 * la migration 0186.
 *
 * Module pur, sans import : il est lu par le front, les routes et les workers.
 */

/** Franc CFA BEAC (Afrique centrale). ISO-4217, 0 décimale à l'affichage. */
export const DEVISE_PAR_DEFAUT = "XAF";

/** Fuseau IANA du Cameroun (UTC+1, sans heure d'été). */
export const FUSEAU_PAR_DEFAUT = "Africa/Douala";

/** Indicatif pays, sans `+`. */
export const INDICATIF_PAR_DEFAUT = "237";

/** Locale BCP-47 de l'interface et des formats (nombres, dates, montants). */
export const LOCALE_PAR_DEFAUT = "fr-FR";
