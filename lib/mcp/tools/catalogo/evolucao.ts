/**
 * Capacidades de EVOLUCAO — o que a empresa ja sabe e o que o agente aprende.
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
 *
 * DECISAO DELIBERADA — a IA nao aprova a propria melhoria. As propostas do
 * flywheel (`flywheel_distiller_proposals`) sao expostas para LEITURA. Nenhuma
 * capacidade de aprovar entra neste catalogo: o gate humano e o desenho do
 * flywheel, e dar ao agente o poder de aprovar mudancas em si mesmo removeria
 * exatamente a trava que torna a auto-melhoria segura. Aprovar continua sendo
 * um clique de pessoa, na tela do agente.
 */
import { declararTools } from "./tipos";

export const TOOLS_EVOLUCAO = declararTools([
  {
    name: "crm_search_knowledge",
    category: "read",
    rotulo: "Consulter ce que l’entreprise sait déjà",
    explicacao:
      "Cherche la réponse dans les documents que vous avez ajoutés, pour que l’assistant réponde avec les infos de votre entreprise au lieu d’inventer.",
    oQueToca: "Base de connaissances",
    risco: "seguro",
    pacotes: ["evoluir", "atender"],
  },
  {
    name: "crm_list_knowledge_sources",
    category: "read",
    rotulo: "Voir les documents ajoutés",
    explicacao:
      "Montre quels documents sont dans la bibliothèque de l’entreprise et s’ils ont été traités, pour savoir s’il manque du contenu ou si quelque chose a échoué.",
    oQueToca: "Base de connaissances",
    risco: "seguro",
    pacotes: ["evoluir"],
  },
  {
    name: "crm_list_improvement_proposals",
    category: "read",
    rotulo: "Voir les suggestions d’amélioration",
    explicacao:
      "Montre les améliorations proposées à partir des conversations, avec la raison de chacune. C’est toujours vous qui décidez de les approuver.",
    oQueToca: "Apprentissage de l’assistant",
    risco: "seguro",
    pacotes: ["evoluir"],
  },
  {
    name: "crm_get_org_memory",
    category: "read",
    rotulo: "Consulter les règles de l’entreprise",
    explicacao:
      "Lit les règles et accords qui valent pour toutes les conversations, pour que l’assistant suive les règles de la maison au lieu d’en inventer.",
    oQueToca: "Règles de l’entreprise",
    risco: "seguro",
    pacotes: ["evoluir", "atender"],
  },
  {
    name: "crm_save_org_memory",
    category: "write",
    rotulo: "Noter une règle apprise",
    explicacao:
      "Garde un apprentissage valable pour toutes les conversations, marqué comme écrit par l’assistant pour le distinguer de ce que vous avez noté.",
    oQueToca: "Règles de l’entreprise",
    risco: "atencao",
    pacotes: ["evoluir"],
  },
]);
