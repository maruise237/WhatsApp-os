import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { reviewPaymentSchema } from "@/lib/schemas";
import { mapSalesError } from "@/lib/sales/errors";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; proofId: string }> };

export async function POST(request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "payment_proof_review" });
  if (!authz.ok) return authz.response;
  const { id: orderId, proofId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", "Corpo JSON inválido.", 400, { requestId });
  }
  const parsed = reviewPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Décision de revue invalide.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();

  if (parsed.data.action === "approve") {
    const { data, error } = await supabase.rpc("fn_approve_sales_payment", {
      p_organization_id: authz.org.orgId,
      p_order_id: orderId,
      p_proof_id: proofId,
      p_reviewer_id: authz.user.id,
    });

    if (error || !data) {
      const mapped = mapSalesError(error?.message ?? "payment_approval_failed");
      return fail(mapped.code, mapped.message, mapped.status, { requestId });
    }

    void audit({
      action: "sales.payment_approved",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "payment_proof",
      resourceId: proofId,
      requestId,
      metadata: { order_id: orderId },
    });

    return ok(data, { requestId });
  }

  const { data, error } = await supabase
    .from("payment_proofs")
    .update({
      review_status: "rejected",
      review_note: parsed.data.note ?? null,
      reviewed_by_user_id: authz.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", proofId)
    .eq("order_id", orderId)
    .eq("organization_id", authz.org.orgId)
    .eq("review_status", "pending")
    .select("*")
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("payment_not_confirmed", "Cette preuve est absente ou déjà traitée.", 409, { requestId });

  void audit({
    action: "sales.payment_rejected",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "payment_proof",
    resourceId: proofId,
    requestId,
    metadata: { order_id: orderId },
  });

  return ok(data, { requestId });
}
