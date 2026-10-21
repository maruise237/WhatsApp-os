/**
 * GET /api/v1/orders/:id/payment-proofs/:proofId/media — aperçu d'une preuve.
 *
 * Deux origines, une seule URL pour l'écran :
 * - capture reçue par WhatsApp (`message_id`, enregistrée par l'agent) → la
 *   route média du message, qui signe depuis le bucket `whatsapp-media` ;
 * - fichier déposé par le vendeur (SeaweedFS) → URL signée de 5 minutes.
 * Utilisable directement comme `src` d'une image (cookie de session same-origin).
 */
import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { signedMediaUrl } from "@/lib/storage/seaweedfs";
import { createClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; proofId: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "payment_proofs" });
  if (!authz.ok) return authz.response;
  const { id, proofId } = await params;

  const supabase = await createClient();
  const { data: proof, error } = await supabase
    .from("payment_proofs")
    .select("id, storage_key, message_id")
    .eq("id", proofId)
    .eq("order_id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!proof) return fail("not_found", "Preuve non trouvée.", 404, { requestId });

  let target: string;
  if (proof.message_id) {
    target = new URL(`/api/v1/messages/${proof.message_id}/media`, request.nextUrl.origin).toString();
  } else {
    try {
      target = await signedMediaUrl({ organizationId: authz.org.orgId, key: proof.storage_key });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "media_signed_url_failed";
      const forbidden = message === "forbidden_media_key";
      return fail(forbidden ? "forbidden_cross_tenant" : "unavailable", message, forbidden ? 403 : 503, { requestId });
    }
  }
  const response = NextResponse.redirect(target, 302);
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
