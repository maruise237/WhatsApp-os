import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/neon/admin-client";
import { CHANNEL_PROVIDER_EVOLUTION_GO } from "@/lib/channels/capabilities";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: NextRequest): string {
  const value = request.headers.get("authorization") ?? "";
  return value.replace(/^Bearer\s+/i, "").trim();
}

function authorized(request: NextRequest): boolean {
  const provided = bearer(request);
  const expected = env.WHATSAPP_GATEWAY_TOKEN;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeInstance(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(value);
}

function eventTypeFor(event: string): string {
  if (event === "MESSAGES_UPSERT") return "whatsapp.message_received";
  if (event === "CONNECTION_UPDATE") return "whatsapp.connection_updated";
  if (event === "QRCODE_UPDATED") return "whatsapp.qr_updated";
  return "whatsapp.provider_event";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      payload?: Record<string, unknown>;
      headers?: Record<string, unknown>;
    };
    const payload = body.payload;
    const instance = payload?.instance;
    if (!payload || !safeInstance(instance)) {
      return NextResponse.json({ error: "invalid_instance" }, { status: 400 });
    }

    const client = createAdminClient();
    const { data: session, error: sessionError } = await client
      .from("channel_sessions")
      .select("id,organization_id,evolution_instance_name")
      .eq("provider", CHANNEL_PROVIDER_EVOLUTION_GO)
      .eq("evolution_instance_name", instance)
      .is("archived_at", null)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return NextResponse.json({ error: "channel_instance_not_found" }, { status: 404 });

    const data = payload.data as Record<string, unknown> | undefined;
    const message = payload.message as Record<string, unknown> | undefined;
    const dataMessage = data?.message as Record<string, unknown> | undefined;
    const key = (payload.key ?? message?.key ?? data?.key ?? dataMessage?.key) as Record<string, unknown> | undefined;
    const externalId = (key?.id as string | undefined) ?? null;
    const eventType = String(payload.event ?? "UNKNOWN").toUpperCase();
    const rawBody = JSON.stringify(payload);

    const { error: webhookError } = await client.from("webhook_events_log").insert({
      organization_id: session.organization_id,
      channel_session_id: session.id,
      provider: "evolution_go",
      raw_body: rawBody,
      payload_parsed: payload,
      headers: body.headers ?? {},
      event_type: eventType,
      external_id: externalId,
      valid_signature: true,
    });
    if (webhookError) {
      if (isUniqueViolation(webhookError)) {
        return NextResponse.json({ ok: true, duplicate: true, organizationId: session.organization_id });
      }
      throw webhookError;
    }

    const { error: eventError } = await client.from("event_log").insert({
      organization_id: session.organization_id,
      event_type: eventTypeFor(eventType),
      entity_kind: "whatsapp_webhook",
      payload: { instance, provider_event: payload },
      metadata: { provider: "evolution_go", external_id: externalId },
    });
    if (eventError) throw eventError;

    return NextResponse.json({ ok: true, duplicate: false, organizationId: session.organization_id });
  } catch (error) {
    console.error("[gateway-webhook] persistence failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "gateway_webhook_failed" }, { status: 500 });
  }
}
