import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import {
  friendlyProvisionError,
  provisionErrorCode,
} from "@/lib/channels/provision";
import {
  getAdapter,
  resolveSessionRef,
  CHANNEL_SESSION_REF_COLUMNS,
  type ChannelProvider,
  type ChannelSessionRef,
} from "@/lib/channels";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const reconnectSchema = z.object({ force: z.boolean().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await params;
  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    rawBody = {};
  }
  const parsedBody = reconnectSchema.safeParse(rawBody ?? {});
  const force = parsedBody.success ? (parsedBody.data.force ?? false) : false;

  const authz = await requireRole("admin", {
    requestId,
    resource: "channel_sessions",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;
  const { user, org: activeOrg } = authz;

  const supabase = await createClient();
  const buscar = (colunas: string) =>
    supabase.from("channel_sessions").select(colunas).eq("organization_id", activeOrg.orgId).eq("id", id).maybeSingle();
  const { data: sessionRaw } = await queryTolerantToMissingArchived(
    () => buscar(`id, ${CHANNEL_SESSION_REF_COLUMNS}, ${ARCHIVED_AT}`),
    () => buscar(`id, ${CHANNEL_SESSION_REF_COLUMNS}`),
  );
  const session = sessionRaw as (ChannelSessionRef & { id: string; archived_at?: string | null }) | null;
  if (!session) return fail("not_found", "Canal não encontrado.", 404, { requestId });
  if (session.archived_at) {
    return fail(
      "channel_archived",
      "Ce numéro est archivé ; reconnectez-le en créant une nouvelle connexion.",
      409,
      { requestId },
    );
  }

  const adapter = getAdapter(session.provider as ChannelProvider);
  if (!adapter.reconnect) {
    return fail("channel_without_session", "Ce canal ne possède pas de cycle de reconnexion transport.", 422, { requestId });
  }

  let sessionRef: string;
  try {
    sessionRef = resolveSessionRef(session);
  } catch {
    return fail("channel_without_session", "Référence de session transport absente.", 422, { requestId });
  }

  try {
    const remote = await adapter.reconnect({ organizationId: activeOrg.orgId, sessionRef, force });
    await supabase
      .from("channel_sessions")
      .update({
        status: "STARTING",
        last_status_change_at: new Date().toISOString(),
        consecutive_health_fails: 0,
      })
      .eq("organization_id", activeOrg.orgId)
      .eq("id", id);

    void audit({
      action: "channel.reconnected",
      actorUserId: user.id,
      organizationId: activeOrg.orgId,
      resourceType: "channel_session",
      resourceId: id,
      requestId,
      metadata: { provider: session.provider, session_ref: sessionRef, force },
    });

    return ok({ id, status: remote.status ?? "STARTING", force }, { requestId });
  } catch (err) {
    return fail(provisionErrorCode(session.provider as ChannelProvider), friendlyProvisionError(err), 502, { requestId });
  }
}
