/**
 * Camada de apresentacao do catalogo de tools — pacotes de capacidade e risco.
 *
 * Existe porque o publico que configura um agente no DeskcommCRM e dono de
 * clinica, de loja, de imobiliaria — nao engenheiro. `crm_move_lead_stage` nao
 * configura nada para essa pessoa.
 *
 * Duas razoes para agrupar em PACOTES em vez de listar tool por tool:
 *   1. modelo — 60 tools num prompt degradam a escolha do LLM (erra a tool,
 *      gasta contexto, alucina argumento). O teto de 20 por agente e real.
 *   2. tela — 60 checkboxes destroem a configuracao para um leigo.
 * O checkbox por tool continua existindo em "modo avancado"; o pacote e o
 * caminho padrao.
 *
 * Este modulo e CLIENT-SAFE: zero import de zod, supabase ou next/headers.
 * Pode ser importado por Client Component.
 */

/** Quanto estrago a capacidade pode fazer — dirige a cerimonia na tela. */
export type ToolRisk = "seguro" | "atencao" | "critico";

/** Jornada de trabalho a que a capacidade pertence. Uma tool pode servir a mais de uma. */
export type ToolBundle =
  | "atender"
  | "vender"
  | "reter"
  | "escalar"
  | "organizar"
  | "evoluir";

export interface PacoteMeta {
  id: ToolBundle;
  rotulo: string;
  /** O que o agente passa a conseguir fazer quando este pacote e ligado. */
  explicacao: string;
  /** Ordem de exibicao — do mais comum ao mais avancado. */
  ordem: number;
}

export const PACOTES: ReadonlyArray<PacoteMeta> = [
  {
    id: "atender",
    rotulo: "Accueillir et répondre",
    explicacao:
      "L’assistant lit la conversation, comprend l’historique et répond au client sans lui faire répéter ce qu’il a déjà dit.",
    ordem: 1,
  },
  {
    id: "vender",
    rotulo: "Vendre et faire avancer le tableau",
    explicacao:
      "L’assistant enregistre l’affaire, la met à jour et déplace le client de colonne au fil de la conversation.",
    ordem: 2,
  },
  {
    id: "reter",
    rotulo: "Ne pas perdre le client",
    explicacao:
      "L’assistant programme des relances et suit ceux qui se refroidissent, pour qu’aucun client intéressé ne soit perdu faute de réponse.",
    ordem: 3,
  },
  {
    id: "escalar",
    rotulo: "Passer la main à une personne",
    explicacao:
      "L’assistant sait reconnaître quand ce n’est pas à lui de régler un cas, appelle une personne et lui donne un résumé de la conversation.",
    ordem: 4,
  },
  {
    id: "organizar",
    rotulo: "Organiser le travail",
    explicacao:
      "L’assistant garde tout en ordre : étiquettes, colonnes du tableau, alertes automatiques et répartition du travail.",
    ordem: 5,
  },
  {
    id: "evoluir",
    rotulo: "Apprendre et progresser",
    explicacao:
      "L’assistant consulte ce que l’entreprise sait déjà, apprend des conversations et propose des améliorations à approuver.",
    ordem: 6,
  },
] as const;

export interface RiscoMeta {
  id: ToolRisk;
  rotulo: string;
  explicacao: string;
}

export const RISCOS: ReadonlyArray<RiscoMeta> = [
  {
    id: "seguro",
    rotulo: "Lecture seule",
    explicacao: "L’assistant lit seulement l’information. Rien ne change.",
  },
  {
    id: "atencao",
    rotulo: "Modifie des données",
    explicacao:
      "L’assistant modifie quelque chose. Vous pouvez voir ce qui a changé et l’annuler depuis l’écran.",
  },
  {
    id: "critico",
    rotulo: "Action irréversible",
    explicacao:
      "L’assistant fait quelque chose qui sort de l’application ou ne peut pas être annulé — comme écrire vraiment au client. À activer par vous, une par une.",
  },
] as const;

/**
 * Capacidade `critico` nunca entra ligada por pacote: exige marcacao explicita
 * do humano. Ligar "Accueillir et répondre" nao pode, sozinho, dar ao agente o
 * direito de mandar mensagem para o cliente.
 */
export function entraPorPacote(risco: ToolRisk): boolean {
  return risco !== "critico";
}

export function pacoteMeta(id: ToolBundle): PacoteMeta {
  const found = PACOTES.find((p) => p.id === id);
  if (!found) throw new Error(`paquet inconnu : ${id}`);
  return found;
}

export function riscoMeta(id: ToolRisk): RiscoMeta {
  const found = RISCOS.find((r) => r.id === id);
  if (!found) throw new Error(`risque inconnu : ${id}`);
  return found;
}
