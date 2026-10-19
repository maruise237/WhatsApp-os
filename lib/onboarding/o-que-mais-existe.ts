/**
 * O que mais existe no sistema, além do que a pessoa acabou de montar.
 *
 * O wizard terminava com um botão que entregava o dono numa caixa de conversas
 * vazia. Ele tinha acabado de montar um funcionário e não fazia ideia de que
 * existe um lugar onde a IA pede ajuda, outro que mostra quem esfriou, outro
 * onde ela propõe as próprias melhorias. Descobrir isso ficava por conta da
 * curiosidade — e a maioria não volta para explorar menu.
 *
 * As frases NÃO são escritas aqui: vêm do registro de navegação, que já as tem
 * em português de dono de negócio e é a mesma fonte que alimenta o menu, o hub
 * e a busca. Uma segunda redação divergiria na primeira vez que alguém mudasse
 * uma das duas.
 *
 * A seleção é curada de propósito. São 34 destinos no produto; despejar todos
 * no fim do wizard seria trocar "não sei o que existe" por "não sei por onde
 * começar".
 */
import { NAV_DESTINATIONS } from "@/lib/navigation/registry";

/**
 * Na ordem em que fazem sentido para quem acabou de montar o funcionário.
 *
 * `comoChamar` existe porque os rótulos do menu ainda são "Inbox", "Kanban",
 * "Follow-ups", "Alertas" — nomes que quem instalou o sistema há dez minutos não
 * reconhece. Aqui a peça é apresentada pelo que ela FAZ. O menu continua com os
 * nomes dele (mudá-los é outra frente, com contrato de teste próprio); o que
 * este arquivo não faz é reescrever a DESCRIÇÃO, que segue vindo do registro.
 */
const CURADORIA: {
  href: string;
  comoChamar: string;
  porQue: string;
  comoFunciona: string[];
}[] = [
  {
    href: "/app/inbox",
    comoChamar: "Les conversations",
    porQue: "C’est ici que les conversations arrivent, et que vous répondez côte à côte avec lui.",
    comoFunciona: [
      "Le client envoie un message sur WhatsApp",
      "Il répond tout seul, en suivant les règles de la maison que vous avez écrites",
      "Si vous intervenez dans la conversation, il s’efface et vous laisse répondre",
    ],
  },
  {
    href: "/app/kanban",
    comoChamar: "Le tableau des clients",
    porQue: "Chaque client devient une fiche, et il la déplace lui-même au fil de la conversation.",
    comoFunciona: [
      "Chaque client devient une fiche, dans la première colonne",
      "Au fil de la conversation, il change la fiche de colonne tout seul",
      "Vous déplacez la fiche à la main quand vous voulez — le tableau est à vous",
    ],
  },
  {
    href: "/app/ai/followups",
    comoChamar: "Relancer ceux qui ont disparu",
    porQue: "Pour qu’aucun client ne se perde dans le silence — il relance tout seul, au bon moment.",
    // A peça mais técnica do produto, e a que mais assusta quem lê o nome. Os
    // passos abaixo são o comportamento real: `reactivity.ts` reage a mensagem
    // recebida, a pedido de parar e a atendimento humano; `intervencao.ts` é
    // quem dá as quatro formas de mexer no meio do caminho.
    comoFunciona: [
      "Le client arrête de répondre au milieu de la conversation",
      "Après le délai que vous avez choisi, il envoie un message pour relancer",
      "Si le client répond, la relance s’arrête aussitôt — personne n’est harcelé",
      "Si le client demande d’arrêter, il s’arrête et ne réécrit plus",
      "Et vous pouvez mettre en pause, reporter, sauter une étape ou annuler quand vous voulez",
    ],
  },
  {
    href: "/app/radar",
    comoChamar: "Ce qui se refroidit",
    porQue: "Les clients refroidis encore en cours, pour agir avant de les perdre.",
    comoFunciona: [
      "Il surveille depuis combien de temps chaque affaire en cours est sans réponse",
      "Ceux qui se refroidissent remontent en haut de cette liste",
      "Vous décidez qui mérite un coup de pouce de votre part, au lieu de le découvrir trop tard",
    ],
  },
  {
    href: "/app/ai/inbox",
    comoChamar: "Quand il demande de l’aide",
    porQue: "Quand il bloque sur quelque chose que seule une personne peut régler, la demande apparaît ici.",
    comoFunciona: [
      "Il tombe sur quelque chose qu’il ne peut pas décider seul — une remise, une exception, un cas bizarre",
      "Au lieu d’inventer, il s’arrête et ouvre une demande ici",
      "Vous décidez, et il repart avec votre réponse",
    ],
  },
  {
    href: "/app/ai/proposals",
    comoChamar: "Ses idées",
    porQue: "Avec le temps, il propose ses propres améliorations — et vous décidez si elles s’appliquent.",
    // `apply-proposal.ts`: nada auto-aplica. O clique de aplicar é o gate humano,
    // e o que ele faz é criar uma versão NOVA do agente — a publicada não muda
    // até o ponteiro virar.
    comoFunciona: [
      "Il suit ses propres conversations et repère ce qui pourrait aller mieux",
      "Il écrit sa suggestion ici, en français, et attend",
      "Rien ne change tout seul : ça ne s’applique que quand VOUS approuvez",
    ],
  },
];

export interface PecaDoSistema {
  href: string;
  /** Como a peça é apresentada a quem acabou de montar o funcionário. */
  comoChamar: string;
  /** O nome que ela tem no menu — para a pessoa reencontrá-la depois. */
  label: string;
  /** A frase do registro — a mesma do menu e da busca. */
  descricao: string;
  /** Por que ela importa para quem acabou de montar o funcionário. */
  porQue: string;
  /**
   * Como a peça funciona, em passos — o "tutorial" que o wizard deve a quem
   * acabou de instalar o sistema.
   *
   * Uma frase basta para dizer que a peça EXISTE; não basta para o follow-up,
   * que é a peça mais técnica do produto e a que mais assusta pelo nome. Quem lê
   * "volta a falar com quem sumiu" sem saber que o retorno PARA quando o cliente
   * responde imagina um robô perseguindo cliente — e desliga a peça que mais
   * recupera venda.
   *
   * ⚠️ CADA PASSO É COMPORTAMENTO REAL, verificado no código que o executa. Um
   * tutorial que promete o que o produto não faz é pior que tutorial nenhum: a
   * pessoa confia, não confere, e descobre com o cliente na linha.
   */
  comoFunciona: string[];
}

export function oQueMaisExiste(): PecaDoSistema[] {
  const porHref = new Map(NAV_DESTINATIONS.map((d) => [d.href as string, d]));
  return CURADORIA.flatMap((c) => {
    const d = porHref.get(c.href);
    // Destino que saiu do registro não vira card órfão apontando para o vazio.
    if (!d) return [];
    return [
      {
        href: c.href,
        comoChamar: c.comoChamar,
        label: d.label,
        descricao: d.description,
        porQue: c.porQue,
        comoFunciona: c.comoFunciona,
      },
    ];
  });
}
