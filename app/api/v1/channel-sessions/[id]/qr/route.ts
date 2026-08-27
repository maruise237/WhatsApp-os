/**
 * GET /api/v1/channel-sessions/[id]/qr — proxy QR privé et provider-neutral.
 *
 * La clé du transport reste côté serveur. Le navigateur ne reçoit que les bytes
 * du QR et le canal est résolu par l’organisation active.
 */
import { NextResponse } from "next/server";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import {
  getAdapter,
  resolveSessionRef,
  DEFAULT_CHANNEL_PROVIDER,
  CHANNEL_SESSION_REF_COLUMNS,
  type ChannelProvider,
  type ChannelSessionRef,
} from "@/lib/channels";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const user = await loadAuthUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return new NextResponse(null, { status: 403 });

  const supabase = await createClient();
  const buscar = (colunas: string) =>
    supabase.from("channel_sessions").select(colunas).eq("organization_id", activeOrg.orgId).eq("id", id).maybeSingle();
  const { data: sessionRaw } = await queryTolerantToMissingArchived(
    () => buscar(`${CHANNEL_SESSION_REF_COLUMNS}, ${ARCHIVED_AT}`),
    () => buscar(CHANNEL_SESSION_REF_COLUMNS),
  );
  const session = sessionRaw as (ChannelSessionRef & { archived_at?: string | null }) | null;
  if (!session) return new NextResponse(null, { status: 404 });
  if (session.archived_at) {
    return new NextResponse(null, { status: 409, headers: { "x-channel-state": "archived" } });
  }

  const provider = (session.provider ?? DEFAULT_CHANNEL_PROVIDER) as ChannelProvider;
  let sessionRef: string;
  try {
    sessionRef = resolveSessionRef({ ...session, provider } as ChannelSessionRef);
  } catch {
    return new NextResponse(null, { status: 409, headers: { "x-channel-state": "no-session" } });
  }

  const adapter = getAdapter(provider);
  if (!sessionRef || !adapter.getPairingQr) {
    return new NextResponse(null, { status: 409, headers: { "x-channel-state": "no-session" } });
  }

  try {
    const qr = await adapter.getPairingQr({ organizationId: activeOrg.orgId, sessionRef });
    return new NextResponse(qr.bytes, {
      status: 200,
      headers: { "content-type": qr.contentType, "cache-control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "qr_unavailable";
    const status = message.includes("_404") || message.includes("qr_not_ready") ? 404 : 503;
    return new NextResponse(null, { status, headers: { "x-qr-error": message.slice(0, 120) } });
  }
}
