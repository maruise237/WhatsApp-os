/**
 * Tradução leiga (pt-br) dos casos humanos (spec 15) — a superfície onde o
 * atendente vê os bloqueios que a IA não resolve sozinha e devolve a
 * resposta. Um caso NÃO é handoff: a IA segue conversando com o cliente,
 * só que espera o humano resolver um bloqueio pontual. Nunca mostrar enum
 * cru (status/kind/actor_kind/source) ao atendente — sempre via este mapa.
 */
import type { CaseEvent, CaseHumanAction, CaseStatus } from "@/hooks/ai/useCases";

export const STATUS_LABEL: Record<CaseStatus, string> = {
  awaiting_human: "Aguardando você",
  awaiting_lead: "Aguardando o cliente",
  resolved: "Réglé",
  escalated: "Confié à une personne",
  cancelled: "Annulé",
};

export const STATUS_BADGE_VARIANT: Record<CaseStatus, "warning" | "info" | "success" | "neutral"> = {
  awaiting_human: "warning",
  awaiting_lead: "info",
  resolved: "success",
  escalated: "neutral",
  cancelled: "neutral",
};

/**
 * Por que o painel de resposta está desabilitado fora de `awaiting_human`.
 * Sem entrada para `awaiting_human` de propósito — ali o painel está ativo.
 */
export const CASE_REPLY_DISABLED_REASON: Partial<Record<CaseStatus, string>> = {
  awaiting_lead: "Aguardando o cliente responder — a IA avisa você quando tiver a informação.",
  resolved: "Este caso já foi concluído.",
  escalated: "Este caso virou atendimento humano — não precisa mais de resposta aqui.",
  cancelled: "Este caso foi cancelado.",
};

export interface CaseActionOption {
  action: CaseHumanAction;
  label: string;
  help: string;
}

/** As 3 ações do POST .../reply — rótulo + efeito em 1 linha (não é óbvio). */
export const CASE_ACTIONS: CaseActionOption[] = [
  {
    action: "resolved",
    label: "C’est réglé",
    help: "L’IA prévient le client et clôt le sujet.",
  },
  {
    action: "need_lead_info",
    label: "J’ai besoin d’une information du client",
    help: "L’IA pose la question au client et le dossier vous revient quand il répond.",
  },
  {
    action: "escalate",
    label: "Je n’y arrive pas — passer à une personne",
    help: "L’IA se retire : la conversation est reprise par une vraie personne.",
  },
];

const EVENT_LABEL: Record<CaseEvent["kind"], string> = {
  opened: "L’IA a ouvert le dossier",
  human_replied: "Vous avez répondu",
  lead_asked: "L’IA a posé la question au client",
  lead_provided: "Le client a répondu",
  lead_unresponsive: "Le client n’a pas répondu à temps",
  resolved: "Réglé",
  escalated: "Confié à une personne",
  cancelled: "Annulé",
};

const HUMAN_ACTION_LABEL: Record<CaseHumanAction, string> = {
  resolved: "Vous avez terminé le dossier",
  need_lead_info: "Vous avez demandé une info au client",
  escalate: "Vous avez décidé de confier à une personne",
};

/** Traduz um evento da timeline pra uma frase pt-br — nunca o enum cru. */
export function caseEventLabel(event: Pick<CaseEvent, "kind" | "actor_kind" | "human_action">): string {
  if (event.kind === "opened" && event.actor_kind === "system") {
    return "Le dossier a été ouvert automatiquement";
  }
  if (event.kind === "human_replied" && event.human_action) {
    return HUMAN_ACTION_LABEL[event.human_action];
  }
  return EVENT_LABEL[event.kind] ?? "Mise à jour du dossier";
}
