/**
 * Capacidades de GOVERNANCA — fila, direcionamento, marcadores e a passagem
 * do atendimento automatico para uma pessoa.
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

export const TOOLS_GOVERNANCA = declararTools([
  {
    name: "crm_get_queue_status",
    category: "read",
    rotulo: "Voir la file d’attente",
    explicacao:
      "Montre combien de personnes attendent une réponse en ce moment et depuis combien de temps, pour servir en priorité ceux qui attendent le plus.",
    oQueToca: "Service client",
    risco: "seguro",
    pacotes: ["atender", "escalar"],
  },
  {
    name: "crm_assign_conversation",
    category: "write",
    rotulo: "Confier une conversation à quelqu’un",
    explicacao:
      "Confie la conversation à un membre de l’équipe, la transfère à une autre personne ou remet le client dans la file d’attente.",
    oQueToca: "Service client",
    risco: "atencao",
    pacotes: ["escalar", "atender"],
  },
  {
    name: "crm_manage_tags",
    category: "write",
    rotulo: "Poser des étiquettes",
    explicacao:
      "Ajoute ou retire des étiquettes sur une conversation, un client ou une affaire, pour mieux organiser et filtrer ensuite.",
    oQueToca: "Organisation du travail",
    risco: "atencao",
    pacotes: ["organizar", "atender"],
  },
  {
    name: "crm_request_human_handoff",
    category: "handoff",
    rotulo: "Appeler une personne de l’équipe",
    explicacao:
      "Met en pause les réponses automatiques et appelle une personne, en lui donnant un résumé de la conversation.",
    oQueToca: "Service client",
    risco: "atencao",
    pacotes: ["escalar"],
  },
]);
