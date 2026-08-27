import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createPaymentProofSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "payment_proofs" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("*")
    .eq("order_id", id)
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false });

  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "payment_proofs" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", "Corpo JSON inválido.", 400, { requestId });
  }
  const parsed = createPaymentProofSchema.safeParse(body);
  if (!parsed.success || parsed.data.order_id !== id) {
    return fail("validation_failed", "La preuve ne correspond pas à la commande.", 422, {
      requestId,
      details: parsed.success ? undefined : parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (orderError) return fail("internal_error", orderError.message, 500, { requestId });
  if (!order) return fail("not_found", "Commande non trouvée.", 404, { requestId });
  if (order.status !== "en_attente_paiement") {
    return fail("invalid_order_transition", "Une preuve ne peut être ajoutée qu’en attente de paiement.", 409, {
      requestId,
    });
  }

  const { data, error } = await supabase
    .from("payment_proofs")
    .insert({
      ...parsed.data,
      organization_id: authz.org.orgId,
      order_id: id,
      review_status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) return fail("internal_error", error?.message ?? "payment_proof_create_failed", 500, { requestId });

  void audit({
    action: "sales.payment_proof_submitted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "payment_proof",
    resourceId: data.id,
    requestId,
    metadata: { order_id: id, mime_type: data.mime_type },
  });

  return ok(data, { requestId, status: 201 });
}
