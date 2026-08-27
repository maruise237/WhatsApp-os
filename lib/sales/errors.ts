import type { ApiErrorCode } from "@/lib/api/errors";

export function mapSalesError(rawMessage: string): {
  code: ApiErrorCode;
  status: number;
  message: string;
} {
  const message = rawMessage.toLowerCase();
  if (message.includes("forbidden_cross_tenant")) {
    return { code: "forbidden_cross_tenant", status: 403, message: "Ressource hors de l’organisation active." };
  }
  if (message.includes("out_of_stock")) {
    return { code: "out_of_stock", status: 422, message: "Stock insuffisant pour cette commande." };
  }
  if (message.includes("invalid_order_transition")) {
    return { code: "invalid_order_transition", status: 409, message: "Transition de commande non autorisée." };
  }
  if (message.includes("payment_not_confirmed")) {
    return { code: "payment_not_confirmed", status: 422, message: "Le paiement doit être confirmé par un opérateur." };
  }
  if (message.includes("payment_proof_not_pending")) {
    return { code: "payment_not_confirmed", status: 409, message: "Cette preuve de paiement a déjà été traitée." };
  }
  if (message.includes("product_not_found")) {
    return { code: "not_found", status: 404, message: "Produit indisponible." };
  }
  if (message.includes("currency_mismatch")) {
    return { code: "validation_failed", status: 422, message: "La devise des produits doit correspondre à celle de la commande." };
  }
  if (message.includes("invalid_order_items") || message.includes("invalid_order_quantity")) {
    return { code: "validation_failed", status: 422, message: "Les lignes de commande sont invalides." };
  }
  if (message.includes("payment_reviewer_not_authorized")) {
    return { code: "forbidden_role", status: 403, message: "Seul un vendeur autorisé peut traiter cette preuve." };
  }
  return { code: "internal_error", status: 500, message: "Une erreur interne est survenue." };
}
