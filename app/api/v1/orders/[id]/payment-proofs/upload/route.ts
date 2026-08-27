import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { putPrivateMedia } from "@/lib/storage/seaweedfs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "payment_proofs" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("validation_failed", "Le champ file est obligatoire.", 422, { requestId });

  const validation = validateOutboundMedia(file.type, file.size);
  if (!validation.ok) return fail(validation.code, validation.message, validation.code === "payload_too_large" ? 413 : 422, { requestId });

  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase
    .from("sales_orders")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (orderError) return fail("internal_error", orderError.message, 500, { requestId });
  if (!order) return fail("not_found", "Commande non trouvée.", 404, { requestId });
  if (order.status !== "en_attente_paiement") return fail("invalid_order_transition", "Cette commande n’attend pas de preuve de paiement.", 409, { requestId });

  const extension = file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
  const storageKey = `${authz.org.orgId}/orders/${id}/${randomUUID()}.${extension}`;
  try {
    await putPrivateMedia({
      organizationId: authz.org.orgId,
      key: storageKey,
      body: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
    });
  } catch (error) {
    return fail("unavailable", error instanceof Error ? error.message : "media_upload_failed", 503, { requestId });
  }

  const amountRaw = form.get("amount_cents");
  const amountCents = typeof amountRaw === "string" && amountRaw.trim() ? Number(amountRaw) : null;
  const safeAmountCents = amountCents !== null && Number.isInteger(amountCents) && amountCents >= 0 ? amountCents : null;
  const reference = typeof form.get("reference") === "string" ? String(form.get("reference")) : null;
  const { data, error } = await supabase
    .from("payment_proofs")
    .insert({
      organization_id: authz.org.orgId,
      order_id: id,
      storage_key: storageKey,
      mime_type: file.type,
      amount_cents: safeAmountCents,
      reference,
      review_status: "pending",
      extraction: {},
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
    metadata: { order_id: id, mime_type: file.type, storage_key: storageKey },
  });
  return ok(data, { requestId, status: 201 });
}
