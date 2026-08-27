import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createProductSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "products" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "products" });
  if (!authz.ok) return authz.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", "Corpo JSON inválido.", 400, { requestId });
  }

  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return fail("invalid_request", "Dados do produto inválidos.", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({ organization_id: authz.org.orgId, ...parsed.data })
    .select("*")
    .single();

  if (error || !data) return fail("internal_error", error?.message ?? "product_create_failed", 500, { requestId });

  void audit({
    action: "sales.product_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "product",
    resourceId: data.id,
    requestId,
    metadata: { price_cents: data.price_cents, stock: data.stock },
  });

  return ok(data, { requestId, status: 201 });
}
