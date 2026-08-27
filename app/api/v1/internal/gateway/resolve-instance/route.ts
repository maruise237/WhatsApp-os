import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/neon/admin-client";
import { CHANNEL_PROVIDER_EVOLUTION_GO } from "@/lib/channels/capabilities";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const expected = env.WHATSAPP_GATEWAY_TOKEN;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeInstance(value: string | null): value is string {
  return value !== null && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(value);
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const instance = request.nextUrl.searchParams.get("instance");
  const organizationId = request.nextUrl.searchParams.get("organization_id");
  if (!safeInstance(instance)) return NextResponse.json({ error: "invalid_instance" }, { status: 400 });

  try {
    const { data, error } = await createAdminClient()
      .from("channel_sessions")
      .select("id,organization_id,evolution_instance_name")
      .eq("provider", CHANNEL_PROVIDER_EVOLUTION_GO)
      .eq("evolution_instance_name", instance)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "channel_instance_not_found" }, { status: 404 });
    if (organizationId && data.organization_id !== organizationId) {
      return NextResponse.json({ error: "forbidden_cross_tenant" }, { status: 403 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[gateway-resolve-instance] failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "gateway_instance_lookup_failed" }, { status: 500 });
  }
}
