/**
 * Tradução leiga (pt-br) dos vetos da cadeia before_send (Operação Visível F2-i).
 * Os códigos são contrato do engine (lib/agent-engine/guardrails/before-send.ts +
 * pacing/spinning/promise/disclosure) — a tela mostra POR QUE uma resposta do
 * assistente foi retida, sem jargão. Módulo puro: testável sem DOM.
 */

/** Contexto dos knobs efetivos do número — interpola janela/horário na copy. */
export interface RetentionContext {
  window_start_hour: number;
  window_end_hour: number;
  allow_sunday: boolean;
  timezone: string;
}

export type RetentionKind = "protection" | "compliance" | "quality";

export interface RetentionCopy {
  kind: RetentionKind;
  title: string;
  description: string;
}

const TITLES: Record<RetentionKind, string> = {
  protection: "Réponse retenue pour protéger le numéro",
  compliance: "Réponse bloquée pour conformité",
  quality: "Réponse retenue pour correction",
};

/**
 * Copy por código de veto. Códigos de proteção (pacing/spinning) tranquilizam:
 * foi proteção anti-bloqueio, não erro. Conformidade (stop/LGPD) é definitivo.
 * Qualidade (promise/disclosure) explica que o assistente corrige sozinho.
 */
export function retentionCopy(code: string | null, ctx: RetentionContext): RetentionCopy {
  const janela = `${ctx.window_start_hour}h–${ctx.window_end_hour}h${ctx.allow_sunday ? "" : ", sans le dimanche"}`;
  const make = (kind: RetentionKind, description: string): RetentionCopy => ({
    kind,
    title: TITLES[kind],
    description,
  });

  switch (code) {
    case "outside_window":
      return make(
        "protection",
        `En dehors des heures d’envoi (${janela}). La réponse est programmée pour la prochaine ouverture, à ${ctx.window_start_hour}h — cela protège le numéro contre un blocage WhatsApp.`,
      );
    case "warmup_cap":
      return make(
        "protection",
        `Ce numéro est encore en période de rodage et sa limite d’envois du jour est atteinte. Envoyer davantage risquerait un blocage WhatsApp — c’est de nouveau possible demain, à partir de ${ctx.window_start_hour}h.`,
      );
    case "daily_cap":
      return make(
        "protection",
        `La limite d’envois du jour pour ce numéro est atteinte — protection contre un blocage WhatsApp. C’est de nouveau possible demain, à partir de ${ctx.window_start_hour}h.`,
      );
    case "mass_identical":
      return make(
        "protection",
        "Le même message était envoyé en masse depuis ce numéro. L’envoi a été retenu pour varier le texte et ne pas passer pour un robot auprès de WhatsApp.",
      );
    case "contato_bloqueado":
      return make(
        "compliance",
        "Le contact a demandé à ne plus recevoir de messages (désinscription). Rien ne lui sera envoyé.",
      );
    case "lgpd_anonymized":
      return make(
        "compliance",
        "Ce contact a été anonymisé (protection des données) — il est interdit de lui envoyer le moindre message.",
      );
    case "lgpd_missing_legal_basis":
      return make(
        "compliance",
        "Aucune base légale (protection des données) pour un premier contact de prospection avec ce client. L’équipe doit régulariser sa fiche avant de le contacter.",
      );
    case "promise_out_of_table":
      return make(
        "quality",
        "La réponse promettait un prix ou une condition hors du tarif approuvé. L’assistant doit la corriger avant l’envoi.",
      );
    case "promise_semantic":
      return make(
        "quality",
        "La réponse contenait une promesse non autorisée. L’assistant doit la réécrire avant l’envoi.",
      );
    case "disclosure_required":
      return make(
        "quality",
        "Le premier message à un nouveau contact doit se présenter comme un assistant virtuel. L’assistant doit le corriger avant l’envoi.",
      );
    default:
      return make(
        "protection",
        `Une sécurité a retenu cette réponse${code ? ` (code ${code})` : ""}. Elle n’a pas été envoyée au contact.`,
      );
  }
}
