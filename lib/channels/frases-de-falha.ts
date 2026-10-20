/**
 * O QUE DIZER À PESSOA quando o canal recusou a mensagem.
 *
 * Mora em `lib/channels/` pelo mesmo motivo que `adapter.codes` mora: as
 * chaves CARREGAM NOME DE PROVIDER (`waha_error`, `meta_not_configured`), e a
 * doutrina de restrição de canal (`docs/doctrine/restricao-de-canal.md`,
 * invariante 1) proíbe esse nome fora daqui — `scripts/lint-channels.ts`
 * reprova, e reprovou este arquivo quando o mapa nasceu dentro de
 * `lib/automation/`.
 *
 * A regra não é burocracia: quem chama não pode ramificar por provider, senão o
 * quarto canal exige editar N lugares espalhados. Aqui a tradução é uma função
 * pura que aceita o código VINDO do adapter e devolve texto de tela — quem
 * chama nunca precisa saber de quem é o código.
 *
 * Texto de TELA, não de log: quem lê é o dono do negócio na aba Atividade, e a
 * frase tem que dizer o que ele faz a respeito. "waha_error" não diz.
 */

const FRASES: Record<string, string> = {
  // Sessão do canal fora de WORKING — o número está desconectado.
  channel_session_not_working:
    "Le numéro choisi n’est pas connecté pour le moment. Reconnectez-le dans Connexions — le message partira tout seul à son retour.",
  // Credencial do transporte ausente no ambiente da instalação.
  waha_not_configured: "La connexion WhatsApp n’est pas encore configurée sur cette installation.",
  meta_not_configured: "La connexion WhatsApp n’est pas encore configurée sur cette installation.",
  zernio_not_configured: "La connexion WhatsApp n’est pas encore configurée sur cette installation.",
  // Canal excluído da Central de Conexões (migration 0106).
  channel_archived:
    "Ce numéro a été supprimé des Connexions. Choisissez un autre numéro dans cette automatisation.",
  missing_phone_number: "Le contact n’a pas de numéro de téléphone pour recevoir le message.",
  // O transporte não respondeu, ou respondeu erro.
  waha_error: "Impossible de joindre le service WhatsApp. Vérifiez qu’il est en ligne.",
  meta_error: "WhatsApp officiel a refusé l’envoi. Vérifiez la connexion dans Connexions.",
  zernio_error: "Le canal a refusé l’envoi. Vérifiez la connexion dans Connexions.",
  // Falha do NOSSO Storage ao preparar a mídia — não é do canal.
  storage_sign_failed: "Impossible de préparer le fichier pour l’envoi.",
};

/**
 * `null` quando o código não tem tradução — e o `null` é deliberado: quem
 * chama decide o texto de reserva, e uma frase genérica inventada aqui
 * ("houve um erro") apagaria a mensagem original do provedor, que às vezes é a
 * única pista real.
 */
export function fraseDaFalhaDeCanal(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return FRASES[codigo] ?? null;
}
