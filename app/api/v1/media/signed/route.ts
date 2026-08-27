import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { signedMediaUrl } from "@/lib/storage/seaweedfs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = crypto.randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "media" });
  if (!authz.ok) return authz.response;
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return fail("validation_failed", "La clé média est obligatoire.", 422, { requestId });

  try {
    const url = await signedMediaUrl({ organizationId: authz.org.orgId, key });
    return ok({ url, expires_in: 300 }, { requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "media_signed_url_failed";
    return fail(message === "forbidden_media_key" ? "forbidden_cross_tenant" : "unavailable", message, message === "forbidden_media_key" ? 403 : 503, { requestId });
  }
}
