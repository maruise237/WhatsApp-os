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
 * Fusos oferecidos, agrupados pelo que este público usa.
 *
 * Não é a lista IANA inteira (são centenas). Faltar um é um pedido de uma
 * linha; oferecer trezentos faz o operador procurar o dele numa lista que não
 * termina — e a busca é justamente onde ele digita errado.
 */
export const FUSOS_OFERECIDOS: { codigo: string; rotulo: string }[] = [
  { codigo: "Africa/Douala", rotulo: "Douala, Yaoundé (Afrique centrale)" },
  { codigo: "Africa/Abidjan", rotulo: "Abidjan, Dakar (Afrique de l’Ouest, GMT)" },
  { codigo: "Africa/Lagos", rotulo: "Lagos, Cotonou (Afrique de l’Ouest, GMT+1)" },
  { codigo: "Africa/Casablanca", rotulo: "Casablanca (Maroc)" },
  { codigo: "Africa/Johannesburg", rotulo: "Lubumbashi, Kigali (GMT+2)" },
  { codigo: "Indian/Antananarivo", rotulo: "Antananarivo, Nairobi (GMT+3)" },
  { codigo: "Europe/Paris", rotulo: "Paris (France)" },
  { codigo: "America/Asuncion", rotulo: "Asunción (Paraguay)" },
  { codigo: "America/Argentina/Buenos_Aires", rotulo: "Buenos Aires (Argentine)" },
  { codigo: "America/Montevideo", rotulo: "Montevideo (Uruguay)" },
  { codigo: "America/Santiago", rotulo: "Santiago (Chili)" },
  { codigo: "America/La_Paz", rotulo: "La Paz (Bolivie)" },
  { codigo: "America/Lima", rotulo: "Lima (Pérou)" },
  { codigo: "America/Bogota", rotulo: "Bogota (Colombie)" },
  { codigo: "America/Mexico_City", rotulo: "Mexico (Mexique)" },
  { codigo: "America/Sao_Paulo", rotulo: "São Paulo (Brésil)" },
  { codigo: "America/Manaus", rotulo: "Manaus (Brésil)" },
  { codigo: "America/Belem", rotulo: "Belém (Brésil)" },
  { codigo: "America/Recife", rotulo: "Recife (Brésil)" },
  { codigo: "America/Fortaleza", rotulo: "Fortaleza (Brésil)" },
  { codigo: "UTC", rotulo: "UTC" },
];

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
