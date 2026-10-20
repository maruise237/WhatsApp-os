/**
 * Capacidades de ESCALAÇÃO — o ciclo completo entre o agente e uma pessoa.
 *
 * O pacote nasceu com UMA capacidade: chamar um atendente. Depois disso o agente
 * ficava cego — não listava chamados, não lia o que a pessoa decidiu, não sabia
 * se o caso foi resolvido, não conseguia retomar. E também não enxergava quem
 * estava disponível, então escalava para uma fila que podia não ter ninguém.
 * Na prática ele jogava o problema por cima do muro e sumia.
 *
 * As seis capacidades abaixo fecham as duas direções: o agente participa do
 * atendimento humano em vez de terminar nele.
 *
 * ESTE ARQUIVO FALA COM O HUMANO que configura o agente — `rotulo`,
 * `explicacao` e `oQueToca`. O texto que vai ao MODELO é a `description` do
 * HANDLER (`lib/mcp/tools/<dominio>.ts`), e ela NÃO tem cópia aqui: até
 * 2026-08-07 tinha, ninguém lia essa cópia, e 48 das 51 divergiam do que o
 * modelo realmente recebia. O campo foi removido em vez de sincronizado —
 * duplicata que ninguém lê não é documentação, é armadilha: um script de
 * medição de vazamento chegou a montar o prompt com o texto errado, sob um
 * comentário dizendo "a ferramenta como o modelo a vê".
 * Ver `docs/handoffs/BRIEFING-ia-360.md` §4.
 */
import { declararTools } from "./tipos";

export const TOOLS_ESCALACAO = declararTools([
  {
    name: "crm_list_available_attendants",
    category: "read",
    rotulo: "Voir qui peut prendre le relais maintenant",
    explicacao:
      "Montre quelles personnes de l’équipe sont en service en ce moment, combien de conversations chacune a déjà et qui peut encore en prendre une.",
    oQueToca: "Équipe du service client",
    risco: "seguro",
    pacotes: ["escalar", "atender"],
  },
  {
    name: "crm_list_human_cases",
    category: "read",
    rotulo: "Voir les demandes en cours",
    explicacao:
      "Liste les sujets déjà confiés à une personne, avec l’état de chacun, pour que l’assistant ne demande pas deux fois la même chose.",
    oQueToca: "Demandes confiées à une personne",
    risco: "seguro",
    pacotes: ["escalar"],
  },
  {
    name: "crm_get_human_case",
    category: "read",
    rotulo: "Lire une demande et la décision prise",
    explicacao:
      "Ouvre une demande et montre tout ce qui s’y est passé, y compris la décision prise par la personne et le texte qu’elle a écrit.",
    oQueToca: "Demandes confiées à une personne",
    risco: "seguro",
    pacotes: ["escalar"],
  },
  {
    name: "crm_add_case_note",
    category: "write",
    rotulo: "Noter ce qui s’est passé sur une demande",
    explicacao:
      "Note sur la demande ce qui a changé depuis son ouverture, pour que la personne qui s’en charge n’ait pas à repartir de zéro.",
    oQueToca: "Demandes confiées à une personne",
    risco: "atencao",
    pacotes: ["escalar"],
  },
  {
    name: "crm_close_human_case",
    category: "write",
    rotulo: "Clôturer une demande avec son issue",
    explicacao:
      "Clôture une demande en notant comment elle s’est terminée, pour qu’elle n’encombre plus la file de l’équipe. Impossible de la rouvrir d’ici.",
    oQueToca: "Demandes confiées à une personne",
    risco: "critico",
    pacotes: ["escalar"],
  },
  {
    name: "crm_resume_ai_attendance",
    category: "write",
    rotulo: "Relancer les réponses automatiques",
    explicacao:
      "Rend la conversation à l’assistant après qu’une personne a répondu, en lui transmettant ce qui a été convenu avec le client. Seule une personne peut le déclencher.",
    oQueToca: "Service client",
    risco: "critico",
    pacotes: ["escalar"],
  },
]);
