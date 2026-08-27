import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { updateProductSchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "product" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_media(*)")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Produto não encontrado.", 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "product" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", "Corpo JSON inválido.", 400, { requestId });
  }
  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return fail("invalid_request", "Nenhuma alteração válida foi enviada.", 400, {
      requestId,
      details: parsed.success ? undefined : parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("*")
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Produto não encontrado.", 404, { requestId });

  void audit({
    action: "sales.product_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "product",
    resourceId: data.id,
    requestId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return ok(data, { requestId });
}

export async function DELETE(_request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "product" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id")
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", "Produto não encontrado.", 404, { requestId });

  void audit({
    action: "sales.product_archived",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "product",
    resourceId: data.id,
    requestId,
  });

  return ok({ id: data.id, archived: true }, { requestId });
}
