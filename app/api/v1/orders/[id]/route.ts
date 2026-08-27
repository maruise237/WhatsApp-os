import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { transitionSalesOrderSchema } from "@/lib/schemas";
import { canTransitionSalesOrder, type SalesOrderStatus } from "@/lib/sales/order-state";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "sales_order" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("*, sales_order_items(*), payment_proofs(*)")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Commande non trouvée.", 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "sales_order" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", "Corpo JSON inválido.", 400, { requestId });
  }
  const parsed = transitionSalesOrderSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Transition de commande invalide.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (readError) return fail("internal_error", readError.message, 500, { requestId });
  if (!current) return fail("not_found", "Commande non trouvée.", 404, { requestId });

  const currentStatus = current.status as SalesOrderStatus;
  const target = parsed.data.status as SalesOrderStatus;
  if (!canTransitionSalesOrder(currentStatus, target)) {
    return fail("invalid_order_transition", "Transition de commande non autorisée.", 409, { requestId });
  }

  const { data, error } = await supabase
    .from("sales_orders")
    .update({
      status: target,
      fulfillment_note: parsed.data.fulfillment_note ?? undefined,
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .eq("status", currentStatus)
    .select("*")
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("invalid_order_transition", "La commande a changé entre-temps.", 409, { requestId });

  void audit({
    action: "sales.order_status_changed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "sales_order",
    resourceId: data.id,
    requestId,
    metadata: { from: currentStatus, to: target },
  });

  return ok(data, { requestId });
}
