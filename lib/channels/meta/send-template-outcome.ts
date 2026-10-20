/**
 * Tradução do resultado de `sendTemplate` para o que o MODELO lê.
 *
 * Separado da execução de propósito: é a peça que decide se o agente sai do buraco
 * ou entra em loop. Um erro que não diz o que fazer faz o modelo tentar de novo
 * igual — e o turno queima tentativas até morrer, deixando o lead sem resposta.
 *
 * Regra por trás de cada frase: **dizer se vale insistir**. Três desfechos, três
 * condutas diferentes:
 *   - `retriable: true`  → o modelo pode corrigir e chamar de novo (faltou valor)
 *   - `retriable: false` → nada que o modelo faça resolve; encerre e escale
 *   - sucesso            → pare de falar, a mensagem saiu
 */
import type { SendTemplateResult } from "./send-template";

export interface ToolOutcome {
  ok: boolean;
  /** Texto que volta ao modelo. Curto, e sempre com a conduta. */
  message: string;
  /** Vale o modelo chamar a ferramenta de novo neste turno? */
  retriable: boolean;
}

export function explainSendResult(r: SendTemplateResult): ToolOutcome {
  if (r.sent) {
    return {
      ok: true,
      // "Não escreva mais nada" é explícito: sem isso o modelo tende a emendar um
      // texto livre depois do template — que a janela fechada recusaria.
      message:
        "modèle envoyé au contact. N’écrivez plus rien à ce tour : hors de la " +
        "fenêtre de 24 heures seul un modèle est accepté, et le message est déjà parti.",
      retriable: false,
    };
  }

  switch (r.reason) {
    case "missing_values":
      return {
        ok: false,
        message:
          `valeur manquante pour le(s) paramètre(s) : ${r.missing.join(", ")}. ` +
          "Remplissez-les tous et rappelez l’outil.",
        retriable: true,
      };
    case "stale":
      return {
        ok: false,
        message:
          "ce modèle a changé chez Meta depuis sa configuration et les paramètres " +
          "enregistrés ne sont plus valables. N’essayez pas une autre valeur — terminez le tour ; un humain " +
          "doit le reconfigurer.",
        retriable: false,
      };
    case "missing":
      return {
        ok: false,
        message:
          "ce modèle n’existe plus sur le compte WhatsApp. Terminez le tour sans " +
          "envoyer ; un humain doit en choisir un autre.",
        retriable: false,
      };
    case "not_approved":
      return {
        ok: false,
        message:
          "ce modèle n’est pas approuvé chez Meta et ne peut pas être envoyé. Terminez le " +
          "tour ; un humain doit régler l’approbation.",
        retriable: false,
      };
    case "api_error":
      return {
        ok: false,
        // O código e o detalhe da Meta entram porque são o que um humano lendo o log
        // precisa para agir — mas a CONDUTA do modelo é a mesma: parar.
        message:
          `le canal a refusé l’envoi (${r.code ?? "sans code"}): ${r.message}. ` +
          "Terminez le tour sans réessayer.",
        retriable: false,
      };
  }
}
