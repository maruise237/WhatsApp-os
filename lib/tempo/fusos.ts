/**
 * Os fusos horários que a tela oferece — e a checagem de que o fuso EXISTE.
 *
 * ─── O defeito, medido ─────────────────────────────────────────────────────
 *
 * O campo do fuso da janela de envio era texto livre, validado só por
 * `z.string().min(1).max(64)`. Qualquer coisa passava. E o motor usa
 * `Intl.DateTimeFormat({ timeZone })`, que LANÇA `RangeError` num fuso que não
 * existe:
 *
 *   America/Asuncion   → 23h        ✓
 *   America/Asunción   → RangeError  ← o acento que um hispanofalante escreve
 *   Asuncion           → RangeError
 *
 * Ou seja: um acento no campo salvava sem reclamar e derrubava a avaliação da
 * janela em TODO envio daquele canal. O defeito não aparece na tela que o
 * causou — aparece no worker, horas depois, como envio que não sai.
 *
 * ─── Duas defesas, e as duas fazem falta ───────────────────────────────────
 *
 * A LISTA impede o erro de digitação, que é a origem real. A CHECAGEM defende a
 * API, que aceita qualquer cliente e não passa pela tela — e defende a lista de
 * si mesma, se alguém acrescentar um código errado aqui.
 */

/**
 * Fuseaux proposés, l'Afrique francophone EN TÊTE — c'est le marché du produit.
 *
 * Pas la liste IANA entière (des centaines) : en manquer un est une demande
 * d'une ligne ; en proposer trois cents fait chercher l'opérateur dans une
 * liste sans fin — et la recherche est précisément là où il se trompe.
 *
 * Une ville par entrée, même quand deux capitales partagent l'heure : la
 * vendeuse de Lomé cherche « Lomé », pas « GMT ». `Africa/Douala` (Cameroun)
 * est le défaut du produit (`FUSEAU_PAR_DEFAUT`).
 *
 * Les fuseaux d'Amérique latine (Brésil, Paraguay…) restent en fin de liste
 * pour les installations existantes qui les utilisent — ils ne sont plus mis
 * en avant.
 */
export const FUSOS_OFERECIDOS: { codigo: string; rotulo: string }[] = [
  // Afrique centrale (UTC+1)
  { codigo: "Africa/Douala", rotulo: "Douala, Yaoundé (Cameroun)" },
  { codigo: "Africa/Libreville", rotulo: "Libreville (Gabon)" },
  { codigo: "Africa/Brazzaville", rotulo: "Brazzaville, Pointe-Noire (Congo)" },
  { codigo: "Africa/Kinshasa", rotulo: "Kinshasa (RD Congo, ouest)" },
  { codigo: "Africa/Ndjamena", rotulo: "N’Djamena (Tchad)" },
  { codigo: "Africa/Bangui", rotulo: "Bangui (Centrafrique)" },
  { codigo: "Africa/Malabo", rotulo: "Malabo (Guinée équatoriale)" },
  { codigo: "Africa/Niamey", rotulo: "Niamey (Niger)" },
  { codigo: "Africa/Porto-Novo", rotulo: "Porto-Novo, Cotonou (Bénin)" },
  { codigo: "Africa/Lagos", rotulo: "Lagos (Nigeria)" },
  // Afrique de l'Ouest (UTC+0)
  { codigo: "Africa/Abidjan", rotulo: "Abidjan (Côte d’Ivoire)" },
  { codigo: "Africa/Dakar", rotulo: "Dakar (Sénégal)" },
  { codigo: "Africa/Bamako", rotulo: "Bamako (Mali)" },
  { codigo: "Africa/Ouagadougou", rotulo: "Ouagadougou (Burkina Faso)" },
  { codigo: "Africa/Lome", rotulo: "Lomé (Togo)" },
  { codigo: "Africa/Conakry", rotulo: "Conakry (Guinée)" },
  { codigo: "Africa/Nouakchott", rotulo: "Nouakchott (Mauritanie)" },
  // Afrique de l'Est et australe (UTC+2 / UTC+3 / UTC+4)
  { codigo: "Africa/Lubumbashi", rotulo: "Lubumbashi (RD Congo, est)" },
  { codigo: "Africa/Kigali", rotulo: "Kigali (Rwanda)" },
  { codigo: "Africa/Bujumbura", rotulo: "Bujumbura (Burundi)" },
  { codigo: "Africa/Djibouti", rotulo: "Djibouti" },
  { codigo: "Indian/Comoro", rotulo: "Moroni (Comores)" },
  { codigo: "Indian/Antananarivo", rotulo: "Antananarivo (Madagascar)" },
  { codigo: "Indian/Mauritius", rotulo: "Port-Louis (Maurice)" },
  { codigo: "Indian/Reunion", rotulo: "Saint-Denis (La Réunion)" },
  // Maghreb
  { codigo: "Africa/Casablanca", rotulo: "Casablanca, Rabat (Maroc)" },
  { codigo: "Africa/Algiers", rotulo: "Alger (Algérie)" },
  { codigo: "Africa/Tunis", rotulo: "Tunis (Tunisie)" },
  // Europe et Amériques francophones
  { codigo: "Europe/Paris", rotulo: "Paris (France)" },
  { codigo: "Europe/Brussels", rotulo: "Bruxelles (Belgique)" },
  { codigo: "Europe/Zurich", rotulo: "Genève (Suisse)" },
  { codigo: "America/Toronto", rotulo: "Montréal (Canada)" },
  { codigo: "America/Port-au-Prince", rotulo: "Port-au-Prince (Haïti)" },
  // Autres (installations existantes)
  { codigo: "America/Asuncion", rotulo: "Asunción (Paraguay)" },
  { codigo: "America/Sao_Paulo", rotulo: "São Paulo (Brésil)" },
  { codigo: "UTC", rotulo: "UTC (temps universel)" },
];

/**
 * Les options d'un sélecteur de fuseau, en garantissant que la valeur ACTUELLE
 * y figure : une organisation réglée sur un fuseau retiré de la liste
 * (`America/Recife`, par ex.) verrait sinon un champ vide et l'écraserait sans
 * le savoir au prochain enregistrement.
 */
export function fusosComAtual(atual: string | null | undefined): { codigo: string; rotulo: string }[] {
  if (!atual || FUSOS_OFERECIDOS.some((f) => f.codigo === atual)) return FUSOS_OFERECIDOS;
  return [...FUSOS_OFERECIDOS, { codigo: atual, rotulo: atual }];
}

/**
 * O runtime consegue usar este fuso?
 *
 * Pergunta ao `Intl`, e não a uma lista: é o `Intl` que o motor da janela usa, e
 * uma lista nossa responderia "sim" para um código que ele recusa. A base de
 * fusos muda (países criam e apagam zonas), e quem sabe qual versão está
 * instalada é o próprio runtime.
 */
export function fusoValido(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
