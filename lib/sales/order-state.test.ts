import { describe, expect, it } from "vitest";

import { canTransitionSalesOrder, transitionTargetsSalesOrder } from "./order-state";

describe("sales order state machine", () => {
  it("requires payment approval before the paid state", () => {
    expect(canTransitionSalesOrder("en_cours", "payée")).toBe(false);
    expect(canTransitionSalesOrder("en_attente_paiement", "payée")).toBe(false);
    expect(canTransitionSalesOrder("payée", "a_livrer")).toBe(true);
  });

  it("allows only the intended lifecycle transitions", () => {
    expect(transitionTargetsSalesOrder("en_cours")).toEqual([
      "en_attente_paiement",
      "refusee",
      "annulee",
    ]);
    expect(transitionTargetsSalesOrder("a_livrer")).toEqual(["livree"]);
    expect(transitionTargetsSalesOrder("livree")).toEqual([]);
  });

  it("fails closed for unknown states", () => {
    expect(canTransitionSalesOrder("unknown", "payée")).toBe(false);
    expect(transitionTargetsSalesOrder("unknown")).toEqual([]);
  });
});
