/**
 * Tradução leiga (pt-br) dos itens da inbox do runtime do agente (Operação
 * Visível F1). `kind` é contrato do engine (agent_inbox_items.kind, migration
 * 0050) — a central de avisos mostra o que aconteceu sem jargão.
 */

import type { InboxKind } from "@/lib/agent-engine/db/repository";

export type AgentInboxSeverity = "info" | "warn" | "critical";

/**
 * `satisfies Record<InboxKind, string>` é o que faz o compilador cobrar: kind
 * novo no tipo sem rótulo aqui = erro de build. Antes isto era
 * `Record<string, string>`, que aceita qualquer chave e **não exige nenhuma** —
 * uma anotação que parecia tipagem e era o oposto dela. Foi assim que
 * `next_action_ambiguous` chegou à tela caindo no genérico "Aviso do
 * assistente": o item existia para pedir uma escolha e se anunciava sem dizer
 * de quê.
 */
export const KIND_LABEL = {
  qr_rescan: "La connexion WhatsApp est coupée — il faut rescanner le code QR",
  job_dead: "Une tâche de l’assistant a échoué et ne réessaie plus",
  event_dead: "Un événement reçu n’a pas pu être traité",
  budget_exceeded: "Le budget IA est atteint",
  handoff: "L’assistant a passé une conversation à une personne",
  promotion_review: "Une amélioration proposée par l’assistant attend votre avis",
  judge_unaligned: "Le contrôle qualité doit être réajusté",
  followup_dead: "Une séquence de relance ne réessaie plus",
  snooze_expired: "Le client n’a pas répondu dans le délai que vous avez fixé",
  next_action_ambiguous: "Prochaine action sans affaire précise — à vous de choisir",
  risk_backlog_seeded: "Des affaires déjà à l’arrêt — une décision est nécessaire",
  reactivation_expired: "La proposition de recontacter a expiré — à vous de décider",
  // Diz o que ACONTECEU com o cliente, não o que falhou por dentro: o dono do
  // negócio precisa saber que um atendimento saiu capado, não que um token
  // colidiu. O motivo técnico fica no corpo do aviso, para quem for investigar.
  capabilities_missing: "Une conversation s’est faite sans les outils que vous avez activés",
  // Diz o que o CLIENTE viu, não o que o worker registrou: uma resposta que
  // ficou "enviando" para sempre é, do lado de lá, uma mensagem que nunca
  // chegou. O motivo técnico fica no corpo do aviso.
  message_send_stuck: "Une réponse est restée bloquée et n’est pas arrivée au client",
  midia_nao_lida: "L’assistant n’a pas pu lire une photo ou un audio envoyé par le client",
  // Diz o que o CLIENTE está esperando, não o que o sistema deixou de gravar.
  // "Promessa não cumprida" é a única frase que faz o dono do negócio agir: do
  // lado de lá existe uma pessoa que ouviu um compromisso e está aguardando.
  // O que a PLATAFORMA decidiu, não o assistente. O texto diz o que mudou e
  // por que importa agora — quem lê a Central quer saber se pode trabalhar, não
  // qual evento chegou.
  channel_template_review: "Un modèle de message a changé de statut lors de la validation",
  channel_number_alert: "Votre numéro WhatsApp demande votre attention",
  // "ninguém cumpriu" é um veredito que NENHUMA linha de código apura — o
  // sistema não sabe se a promessa foi cumprida, e agendar um retorno não é
  // cumprir. "ninguém ficou responsável" é exatamente o que `apuraDonoDaPromessa`
  // mede: houve ferramenta neste turno? há retorno vivo? Se não, ninguém assumiu.
  promise_unfulfilled: "L’assistant a promis quelque chose à un client et personne n’en est responsable",
  contact_proposal_expired:
    "Une info donnée par un client à l’assistant a expiré sans que personne ne la vérifie",
  // Diz o que ACONTECEU, e nunca que algo parou — contraste deliberado com
  // `budget_exceeded` ("foi atingido"). Quem lê este aviso ainda tem a IA
  // respondendo; confundir os dois faria o dono do negócio correr atrás de uma
  // parada que não houve, ou ignorar a que houve.
  budget_warning: "Les dépenses IA ont dépassé le seuil d’alerte que vous avez fixé",
  other: "Alerte de l’assistant",
} as const satisfies Record<InboxKind, string>;

export const SEVERITY_LABEL: Record<AgentInboxSeverity, string> = {
  info: "information",
  warn: "attention",
  critical: "critique",
};

/**
 * O parâmetro segue `string` (não `InboxKind`) de propósito: o kind chega do
 * banco em runtime, e um clone com engine mais novo pode trazer um valor que
 * este build não conhece. O genérico é a defesa para ESSE caso — não para
 * cobrir esquecimento, que agora o compilador pega acima.
 */
export function kindLabel(kind: string): string {
  return (KIND_LABEL as Record<string, string>)[kind] ?? "Alerte de l’assistant";
}

/** Por que ninguém ficou responsável — o que muda é a AÇÃO que cabe a quem lê. */
export type PromessaSemDono =
  | "operador_sem_ferramentas"
  | "operador_nao_agiu"
  | "operador_nao_rodou";

/**
 * O texto do aviso de promessa sem responsável.
 *
 * ═══ A REGRA DE ESCRITA, E POR QUE ELA É ESTREITA ═══
 *
 * Nenhuma frase daqui afirma que a promessa foi ou não foi CUMPRIDA. O sistema
 * não sabe: agendar um retorno não é cumprir, e mandar uma mensagem depois
 * também não. O que ele apura é se **alguém ficou responsável**, e é só isso que
 * o texto pode dizer. A versão anterior afirmava "o sistema ainda não registrou
 * o cumprimento" — um veredito que nenhuma linha de código tinha apurado, no
 * único item que esta feature mostra ao dono do negócio.
 *
 * As três variantes dizem o MESMO fato e mudam só a ação: sem capacidade
 * marcada, o caminho é a tela do assistente; com capacidade e sem ação, é
 * decidir sobre este cliente. Um texto único mandaria metade das pessoas para o
 * lugar errado.
 */
export function copyDaPromessaSemDono(
  quantas: number,
  porque: PromessaSemDono,
): { title: string; body: string } {
  const title =
    quantas === 1
      ? "L’assistant a promis quelque chose au client et personne n’en est responsable"
      : `${quantas} promesses faites à des clients sans personne responsable`;

  const CORPO: Record<PromessaSemDono, string> = {
    operador_sem_ferramentas:
      "Dans cette conversation, l’assistant a convenu de quelque chose avec le client. Il n’a encore " +
      "aucune capacité activée pour l’enregistrer, donc rien n’a été programmé ni noté. " +
      "Ouvrez la conversation pour voir ce qui a été convenu — et, sur l’écran de l’assistant, cochez ce qu’il " +
      "peut faire.",
    operador_nao_agiu:
      "Dans cette conversation, l’assistant a convenu de quelque chose avec le client sans prévoir de " +
      "suite — aucune relance n’est programmée. Ouvrez la conversation, voyez ce qui a été convenu et " +
      "décidez qui s’en charge.",
    operador_nao_rodou:
      "Dans cette conversation, l’assistant a convenu de quelque chose avec le client, mais la partie qui organise le suivi " +
      "ne s’est pas lancée. Rien n’a été programmé. Ouvrez la conversation pour voir ce qui a été " +
      "convenu et décidez qui s’en charge.",
  };

  return { title, body: CORPO[porque] };
}
