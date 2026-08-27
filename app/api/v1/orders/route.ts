import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createSalesOrderSchema } from "@/lib/schemas";
import { mapSalesError } from "@/lib/sales/errors";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "sales_orders" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("*, sales_order_items(*), payment_proofs(*)")
    .eq("organization_id", authz.org.orgId)
    .order("updated_at", { ascending: false });

  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "sales_orders" });
  if (!authz.ok) return authz.response;

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return fail("invalid_request", "O header Idempotency-Key é obrigatório.", 400, { requestId });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", "Corpo JSON inválido.", 400, { requestId });
  }

  const parsed = createSalesOrderSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Dados da commande invalides.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_create_sales_order", {
    p_contact_id: parsed.data.contact_id,
    p_conversation_id: parsed.data.conversation_id,
    p_created_by: authz.user.id,
    p_currency: parsed.data.currency,
    p_idempotency_key: idempotencyKey,
    p_items: parsed.data.items,
    p_organization_id: authz.org.orgId,
  });

  if (error || !data) {
    const mapped = mapSalesError(error?.message ?? "sales_order_create_failed");
    return fail(mapped.code, mapped.message, mapped.status, { requestId });
  }

  void audit({
    action: "sales.order_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "sales_order",
    resourceId: data.id,
    requestId,
    metadata: { total_cents: data.total_cents, item_count: parsed.data.items.length },
  });

  return ok(data, { requestId, status: 201 });
}
