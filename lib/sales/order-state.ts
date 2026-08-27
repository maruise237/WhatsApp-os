export const SALES_ORDER_STATUSES = [
  "en_cours",
  "en_attente_paiement",
  "payée",
  "a_livrer",
  "livree",
  "refusee",
  "annulee",
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  en_cours: ["en_attente_paiement", "refusee", "annulee"],
  en_attente_paiement: ["refusee", "annulee"],
  payée: ["a_livrer"],
  a_livrer: ["livree"],
  livree: [],
  refusee: [],
  annulee: [],
};

export function canTransitionSalesOrder(from: string, to: string): boolean {
  if (!SALES_ORDER_STATUSES.includes(from as SalesOrderStatus)) return false;
  return ALLOWED_TRANSITIONS[from as SalesOrderStatus].includes(to as SalesOrderStatus);
}

export function transitionTargetsSalesOrder(from: string): readonly SalesOrderStatus[] {
  if (!SALES_ORDER_STATUSES.includes(from as SalesOrderStatus)) return [];
  return ALLOWED_TRANSITIONS[from as SalesOrderStatus];
}
