/**
 * Capacidades de FUNIL — oportunidades de venda e as etapas por onde passam.
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

export const TOOLS_FUNIL = declararTools([
  {
    name: "crm_list_leads",
    category: "read",
    rotulo: "Lister les affaires du tableau",
    explicacao:
      "Liste les affaires d’un tableau de ventes, avec la colonne où se trouve chacune et la personne qui en est responsable.",
    oQueToca: "Tableau des ventes",
    risco: "seguro",
    pacotes: ["vender"],
  },
  {
    name: "crm_get_lead",
    category: "read",
    rotulo: "Voir une affaire",
    explicacao:
      "Ouvre le détail d’une affaire : colonne actuelle, responsable, étiquettes et montant de la vente.",
    oQueToca: "Tableau des ventes",
    risco: "seguro",
    pacotes: ["vender"],
  },
  {
    name: "crm_list_pipelines",
    category: "read",
    rotulo: "Lister les tableaux",
    explicacao:
      "Montre les tableaux de ventes existants et leurs colonnes, pour que l’assistant sache où placer une affaire.",
    oQueToca: "Tableau des ventes",
    risco: "seguro",
    pacotes: ["vender", "organizar"],
  },
  {
    name: "crm_create_lead",
    category: "write",
    rotulo: "Créer une affaire dans le tableau",
    explicacao:
      "Ajoute une nouvelle affaire dans le tableau, pour que l’intérêt montré par le client ne se perde pas.",
    oQueToca: "Tableau des ventes",
    risco: "atencao",
    pacotes: ["vender"],
  },
  {
    name: "crm_update_lead",
    category: "write",
    rotulo: "Mettre à jour une affaire",
    explicacao:
      "Modifie les infos d’une affaire : montant de la vente, responsable et infos recueillies dans la conversation.",
    oQueToca: "Tableau des ventes",
    risco: "atencao",
    pacotes: ["vender"],
  },
  {
    name: "crm_move_lead_stage",
    category: "write",
    rotulo: "Déplacer une affaire de colonne",
    explicacao:
      "Déplace l’affaire vers une autre colonne du tableau, pour noter l’avancée de la négociation ou la perte de la vente.",
    oQueToca: "Tableau des ventes",
    risco: "atencao",
    pacotes: ["vender"],
  },
]);
