import { describe, expect, it } from "vitest";

import { ApiErrorCodes } from "@/lib/api/errors";

describe("AI WhatsApp Sales OS error codes", () => {
  it("exposes the constitution-required business codes", () => {
    expect(ApiErrorCodes.whatsapp_disconnected).toBe("whatsapp_disconnected");
    expect(ApiErrorCodes.out_of_stock).toBe("out_of_stock");
    expect(ApiErrorCodes.payment_not_confirmed).toBe("payment_not_confirmed");
    expect(ApiErrorCodes.rate_limited).toBe("rate_limited");
    expect(ApiErrorCodes.forbidden_cross_tenant).toBe("forbidden_cross_tenant");
    expect(ApiErrorCodes.invalid_order_transition).toBe("invalid_order_transition");
  });

  it("keeps the existing state transition code stable", () => {
    expect(ApiErrorCodes.invalid_state_transition).toBe("invalid_state_transition");
  });
});
