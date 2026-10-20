/**
 * A recusa de uma capacidade, escrita para o MODELO — e, por tabela, para quem
 * vai ler a resposta dele.
 *
 * ⚠️ POR QUE ISTO EXISTE, medido com LLM real (`gpt-5.6-terra`). Pedi ao agente
 * uma etapa nova de funil. Ele tentou, a barreira de papel segurou (nada foi
 * escrito — confirmado no banco), e a frase que chegou ao usuário foi:
 *
 *   "Não consegui criar a etapa: SEU perfil atual é agent, e essa alteração
 *    exige permissão de manager."
 *
 * A barreira funcionou; **a frase mente**. O papel `agent` é do ASSISTENTE, não
 * de quem lê. Um dono com papel `admin` conclui que o sistema se confundiu; e
 * num atendimento de verdade quem lê é o CLIENTE da empresa, que não tem papel
 * nenhum no CRM — a frase vaza `agent`/`manager`, vocabulário interno, para fora.
 *
 * O modelo não errou: ele recebeu `Role 'agent' insufficient (required:
 * 'manager')` e fez o melhor possível com uma mensagem que fala de "role" sem
 * dizer DE QUEM. O conserto é dar a ele um texto que já sabe o que é — a mesma
 * ideia do veto instrutivo dos gates de envio: a recusa não é só "não", é o que
 * fazer em seguida.
 *
 * ⚠️ NÃO É COSMÉTICO E NÃO AFROUXA NADA. `ensureRole` continua sendo quem barra;
 * aqui só se traduz o que já foi decidido. A mensagem técnica original vai para
 * o log e para a observabilidade, onde ela serve.
 */
import { catalogEntry } from "@/lib/mcp/tools/catalog";

/**
 * O que o modelo recebe quando uma capacidade é recusada por papel.
 *
 * ⚠️ DUAS SITUAÇÕES DIFERENTES, e a distinção importa para quem lê a resposta:
 *
 * - `apenasHumano` — restrição DELIBERADA. A capacidade é operada por gente com
 *   acesso de gestor, e a tela declara isso. O caminho existe: pedir a alguém do
 *   time. A instrução manda o agente oferecer isso.
 * - sem a marca — restrição por ACIDENTE (o BUG-02 desta wave). O humano ligou
 *   uma capacidade que o agente não alcança, e ninguém foi avisado. Aqui o
 *   agente não deve prometer que "um gestor faz": ele deve dizer que não
 *   consegue e sugerir que a pessoa fale com quem cuida do sistema, porque isso
 *   é defeito de configuração, não desenho.
 */
export function recusaDeCapacidadeParaOModelo(toolName: string): string {
  const entrada = catalogEntry(toolName);
  const oQue = entrada?.rotulo ? `«${entrada.rotulo.toLowerCase()}»` : "cette modification";

  if (entrada?.apenasHumano) {
    return [
      `Cette action (${oQue}) est effectuée par une PERSONNE de l’équipe disposant d’un accès gestionnaire — ce n’est pas vous qui l’exécutez.`,
      "Ce n’est ni votre faute ni un manque d’autorisation de la personne qui vous parle :",
      "c’est ainsi que le système a été configuré, et l’écran des capacités l’indique.",
      "Expliquez-le en une phrase, sans citer de fonctions internes du système ni de termes comme",
      '"agent", "manager", "rôle" ou "autorisation", et proposez que quelqu’un de l’équipe s’en charge.',
      "Si vous avez déjà établi quelque chose d’utile (par exemple, que l’élément n’existe pas encore), dites-le aussi.",
    ].join(" ");
  }

  return [
    `Vous ne pouvez pas exécuter cette action (${oQue}) pour le moment.`,
    "C’est une limite de la configuration du système, pas un problème de la personne qui vous parle.",
    "Dites que vous n’avez pas pu, sans citer de fonctions internes ni de termes comme",
    '"agent", "manager", "rôle" ou "autorisation", et orientez la personne vers celui qui gère le système.',
  ].join(" ");
}
