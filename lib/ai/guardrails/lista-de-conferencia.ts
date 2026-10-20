/**
 * O QUE O SISTEMA CONFERE ANTES DE UMA MENSAGEM SAIR — em linguagem de quem
 * configura.
 *
 * ## Por que esta lista existe
 *
 * A cadeia de conferências roda em `lib/agent-engine/guardrails/before-send.ts` e
 * é boa: dez verificações, veto instrutivo, trace por linha. Só que o dono do
 * negócio **não sabia que ela existia**. A spec 16 §3.3 chamou o papel de
 * "Segurança" e disse, com todas as letras, que o que faltava era *superfície* —
 * e o épico dos três papéis foi entregue com dois papéis na tela.
 *
 * Mecanismo invisível que funciona é pior do que não existir: quando ele barra
 * algo, a pessoa não sabe que foi barrado nem por quem; quando ele falha, falha
 * sem culpado. É o anti-exemplo escrito no invariante 6 da doutrina.
 *
 * ## Por que a lista é DUPLICADA aqui, e o que impede a duplicata de mentir
 *
 * `before-send.ts` importa `pg`, os stores de pacing/spinning e o adaptador de
 * canal. Importá-lo de um componente arrastaria o motor inteiro para o bundle do
 * browser. Então a apresentação vive aqui, pura.
 *
 * Duplicar uma constante de runtime numa lista de tela é exatamente como uma tela
 * passa a vender proteção que não roda — e o cabeçalho do próprio `before-send.ts`
 * registra que a cadeia já teve um guarda PROMETIDO E INEXISTENTE por meses. Por
 * isso `tests/unit/seguranca-lista-casa-com-a-cadeia.test.ts` importa a cadeia de
 * verdade (arquivo de teste pode importar `pg`) e reprova nos DOIS sentidos:
 * conferência que roda e não aparece, e conferência que aparece e não roda.
 *
 * ## A política: 9 não se desligam, e isso não é rigidez
 *
 * Um botão só existe onde há escolha real. Desligar o que impede o número do
 * cliente de ser bloqueado, ou o que respeita quem pediu para parar, não é
 * preferência — é sabotagem do produto dele, e oferecer o controle já ensina que
 * é opcional. Onde não há escolha, a tela diz POR QUÊ em uma linha; onde há, ela
 * diz o CUSTO. Controle decorativo é pior que controle ausente.
 */

/** Uma conferência, como ela se apresenta a quem configura o agente. */
export interface ConferenciaDeSaida {
  /** O `name` do gate na cadeia — a chave que casa esta lista com o runtime. */
  nome: string;
  rotulo: string;
  /** O que se perde se ela não existisse. Uma frase, sem jargão. */
  oQueProtege: string;
  /**
   * `null` = não se desliga, e o texto diz por quê.
   * Objeto = há escolha real, e ela custa dinheiro — o custo vai na tela.
   */
  escolha: { custo: string } | null;
  /** Por que não se desliga. Vazio quando há escolha. */
  porQueNaoSeDesliga: string;
  /**
   * A chave da camada em `org_guardrail_layers`, quando há escolha.
   *
   * São DOIS vocabulários e eles não coincidem: aqui o nome é o do gate na cadeia
   * (`semantic_promise`), lá é o da camada configurável (`promessa_semantica`). O
   * vínculo é explícito porque casar um pelo outro por semelhança de nome é como
   * a tela deixa de encontrar o estado e mostra "carregando…" para sempre —
   * aconteceu ao escrever isto, e o teste de componente pegou.
   */
  camada: "promessa_semantica" | "jailbreak" | null;
}

/**
 * Na MESMA ORDEM em que rodam. A ordem é informação: a primeira que veta
 * interrompe a cadeia, então quem lê entende por que uma mensagem barrada no
 * `stop` nunca chega a ser avaliada pelas seguintes.
 */
export const CONFERENCIAS_DE_SAIDA: readonly ConferenciaDeSaida[] = [
  {
    nome: "stop",
    rotulo: "Respecter ceux qui ont demandé l’arrêt",
    oQueProtege:
      "Si la personne a répondu STOP, ARRÊT ou a demandé à ne plus recevoir de messages, rien ne lui est envoyé.",
    escolha: null,
    porQueNaoSeDesliga:
      "Qui a demandé l’arrêt a le droit d’être laissé tranquille — insister est une infraction, pas une stratégie.",
     camada: null,
  },
  {
    nome: "lgpd",
    rotulo: "Respecter les données effacées et la base légale",
    oQueProtege:
      "Un contact anonymisé à sa demande ne reçoit aucun message, et aucune prospection sans base légale ne part.",
    escolha: null,
    porQueNaoSeDesliga: "C’est une obligation légale. L’effacement des données est irréversible par conception, et écrire à une personne effacée reviendrait à l’annuler.",
     camada: null,
  },
  {
    nome: "pacing",
    rotulo: "Maîtriser le rythme d’envoi",
    oQueProtege:
      "Espace les messages pour que votre numéro ne ressemble pas à un robot et ne soit pas bloqué par WhatsApp.",
    escolha: null,
    porQueNaoSeDesliga: "C’est ce qui empêche votre numéro d’être bloqué — et ce numéro, c’est votre activité.",
     camada: null,
  },
  {
    nome: "messaging_window",
    rotulo: "Respecter la fenêtre WhatsApp",
    oQueProtege:
      "En dehors de la fenêtre de 24 heures, seul un modèle de message approuvé peut partir — c’est ce que WhatsApp lui-même autorise.",
    escolha: null,
    porQueNaoSeDesliga:
      "C’est WhatsApp qui l’impose, pas nous. Désactiver ici ne débloque rien : le message serait refusé là-bas, ou facturé.",
     camada: null,
  },
  {
    nome: "spinning",
    rotulo: "Varier le texte des messages identiques",
    oQueProtege:
      "Évite d’envoyer exactement la même phrase à beaucoup de monde, ce qui trahit un envoi en masse.",
    escolha: null,
    porQueNaoSeDesliga: "Un texte identique en masse déclenche l’anti-spam de WhatsApp — même risque que le rythme d’envoi.",
     camada: null,
  },
  {
    nome: "promise",
    rotulo: "Ne pas promettre de prix ou de délai de sa propre initiative",
    oQueProtege:
      "Bloque le message où l’assistant invente une remise, un montant ou une date de livraison.",
    escolha: null,
    porQueNaoSeDesliga:
      "Une promesse écrite engage votre activité. Ce contrôle est une règle fixe, il ne coûte rien et n’a aucun compromis à proposer.",
     camada: null,
  },
  {
    nome: "semantic_promise",
    rotulo: "Vérifier les promesses formulées librement",
    oQueProtege:
      "Une seconde lecture, faite par l’IA, pour repérer une promesse formulée d’une façon que la règle fixe ne reconnaît pas.",
    escolha: { custo: "+1 requête au modèle d’IA par message envoyé" },
    porQueNaoSeDesliga: "",
    camada: "promessa_semantica",
  },
  {
    nome: "case_promise",
    rotulo: "Ne pas promettre une prise en charge humaine qui n’existe pas",
    oQueProtege:
      'Empêche le « je vais demander au responsable de vous appeler » quand aucune demande n’a réellement été ouverte.',
    escolha: null,
    porQueNaoSeDesliga:
      "C’est une promesse que vous seul pouvez tenir, et le client reste à attendre. Règle fixe, sans coût.",
     camada: null,
  },
  {
    nome: "internal_vocabulary",
    rotulo: "Ne pas parler notre jargon à votre client",
    oQueProtege:
      "Bloque les noms d’outils, noms de tables et codes d’erreur dans le message que lit le client.",
    escolha: null,
    porQueNaoSeDesliga:
      "C’est le contrôle qui a fait passer la fuite mesurée de 30 % à zéro. Le désactiver rouvre exactement le défaut qu’il existe pour corriger.",
     camada: null,
  },
  {
    nome: "disclosure",
    rotulo: "Dire que c’est un assistant quand on le demande",
    oQueProtege: "Si le client demande s’il parle à un robot, la réponse ne doit pas le tromper.",
    escolha: null,
    porQueNaoSeDesliga: "Cacher que c’est un assistant, c’est tromper le client.",
     camada: null,
  },
];

/**
 * A conferência de ENTRADA, que não está na cadeia de saída.
 *
 * Ela roda antes, sobre o que o cliente escreveu, e por isso aparece à parte: a
 * lista acima é, literalmente, o que acontece entre o assistente escrever e a
 * mensagem sair. Misturá-las faria a ordem da cadeia deixar de ser verdade.
 */
export const CONFERENCIA_DE_ENTRADA: ConferenciaDeSaida = {
  nome: "jailbreak_detect",
  rotulo: "Détecter les tentatives de manipulation de l’assistant",
  oQueProtege:
    "Lit le message entrant et repère qui essaie de faire ignorer ses instructions à l’assistant.",
  escolha: { custo: "+1 requête au modèle d’IA par message reçu" },
  porQueNaoSeDesliga: "",
  camada: "jailbreak",
};
