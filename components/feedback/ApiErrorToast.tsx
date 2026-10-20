"use client";

import { toast } from "sonner";
import { ApiError } from "@/lib/api/types";

type Variant = "error" | "warning" | "info";

const COPY: Record<string, { variant: Variant; msg: string }> = {
  body_malformed: {
    variant: "error",
    msg: "Requête invalide. Rechargez la page et réessayez.",
  },
  cursor_malformed: {
    variant: "error",
    msg: "Échec de la pagination. Revenez au début.",
  },
  validation_error: {
    variant: "error",
    msg: "Données invalides. Vérifiez les champs signalés.",
  },
  auth_required: {
    variant: "warning",
    msg: "Session expirée. Reconnectez-vous.",
  },
  forbidden_role: {
    variant: "warning",
    msg: "Vous n’avez pas l’autorisation d’effectuer cette action.",
  },
  resource_not_found: {
    variant: "error",
    msg: "Ressource introuvable ou déjà supprimée.",
  },
  tenant_not_found: {
    variant: "error",
    msg: "Organisation introuvable.",
  },
  idempotency_conflict: {
    variant: "warning",
    msg: "Opération déjà traitée.",
  },
  conversation_already_claimed: {
    variant: "warning",
    msg: "Un autre agent a déjà pris en charge.",
  },
  invalid_state: {
    variant: "warning",
    msg: "Ce dossier a déjà reçu une réponse ou a été clôturé.",
  },
  rate_limited: {
    variant: "warning",
    msg: "Calma — muitas tentativas. Espere alguns segundos.",
  },
  lgpd_anonymization_irreversible: {
    variant: "error",
    msg: "Cette action est irréversible : le contact a déjà été anonymisé.",
  },
  internal_error: {
    variant: "error",
    msg: "Erreur interne. Réessayez dans quelques instants.",
  },
};

export function showApiError(err: unknown): void {
  if (err instanceof ApiError) {
    const entry = COPY[err.code];
    const description = err.requestId ? `ID: ${err.requestId}` : undefined;
    if (entry) {
      const fn =
        entry.variant === "warning"
          ? toast.warning
          : entry.variant === "info"
            ? toast.info
            : toast.error;
      fn(entry.msg, { description });
      return;
    }
    toast.error(err.message || err.code, { description });
    return;
  }
  toast.error("Erreur inattendue. Réessayez.");
}

export function useApiErrorHandler(): (err: unknown) => void {
  return showApiError;
}
