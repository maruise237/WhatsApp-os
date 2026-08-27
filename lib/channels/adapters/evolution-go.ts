import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import type { FetchedMedia } from "@/lib/messaging/media/types";
import type { ChannelAdapter, ChannelHealth, OutboundEnvelope, RecipientInput } from "../types";

function resolveEvolutionRecipient(input: RecipientInput): string | null {
  // Le Sales OS est DM-only : les groupes peuvent être observés par le gateway,
  // mais ne deviennent jamais une destination commerciale.
  if (input.isGroup) return null;
  if (input.waLid) return `${input.waLid}@lid`;
  if (input.waIdentity?.startsWith("lid:")) return `${input.waIdentity.slice(4)}@lid`;
  if (input.phoneNumber) return `${input.phoneNumber.replace(/\D/g, "")}@c.us`;
  return null;
}

function gatewayUrl(path: string): string {
  return `${env.WHATSAPP_GATEWAY_BASE_URL.replace(/\/$/, "")}${path}`;
}

function gatewayHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.WHATSAPP_GATEWAY_TOKEN}`,
    "Content-Type": "application/json",
    "X-Request-Id": randomUUID(),
  };
}

async function readGatewayError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return body.slice(0, 240) || `status_${response.status}`;
}

async function gatewayRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(gatewayUrl(path), {
    ...init,
    headers: { ...gatewayHeaders(), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`evolution_go_${response.status}: ${await readGatewayError(response)}`);
  }
  return (await response.json()) as T;
}

function unwrapData<T>(body: T | { data: T }): T {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export const evolutionGoAdapter: ChannelAdapter = {
  provider: "evolution_go",

  resolveRecipient: resolveEvolutionRecipient,

  isConfigured(): boolean {
    return Boolean(env.WHATSAPP_GATEWAY_BASE_URL && env.WHATSAPP_GATEWAY_TOKEN);
  },

  codes: {
    notConfigured: "whatsapp_gateway_not_configured",
    sendFailed: "whatsapp_gateway_error",
    unknownError: "whatsapp_gateway_unknown",
  },

  async checkHealth(input: { organizationId: string; sessionRef: string }): Promise<ChannelHealth> {
    if (!this.isConfigured()) {
      return { reachable: false, status: null, detail: "transport_not_configured" };
    }

    try {
      const body = await gatewayRequest<
        | { status?: string | null; detail?: string | null }
        | { data: { status?: string | null; detail?: string | null } }
      >(`/internal/v1/instances/${encodeURIComponent(input.sessionRef)}/status`, {
        method: "GET",
        headers: { "X-Organization-Id": input.organizationId },
      });
      const result = unwrapData(body);
      return { reachable: true, status: result.status ?? null, detail: result.detail ?? null };
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 200) : "gateway_unreachable";
      return { reachable: false, status: null, detail };
    }
  },

  async reconnect(input: { organizationId: string; sessionRef: string; force: boolean }): Promise<{ status: string | null }> {
    const body = await gatewayRequest<{ status?: string | null } | { data: { status?: string | null } }>(
      `/internal/v1/instances/${encodeURIComponent(input.sessionRef)}/reconnect`,
      {
        method: "POST",
        headers: { "X-Organization-Id": input.organizationId },
        body: JSON.stringify({ force: input.force }),
      },
    );
    return { status: unwrapData(body).status ?? null };
  },

  async deleteSession(input: { organizationId: string; sessionRef: string }): Promise<void> {
    await gatewayRequest(`/internal/v1/instances/${encodeURIComponent(input.sessionRef)}`, {
      method: "DELETE",
      headers: { "X-Organization-Id": input.organizationId },
    });
  },

  async getPairingQr(input: { organizationId: string; sessionRef: string }): Promise<{
    bytes: ArrayBuffer;
    contentType: string;
  }> {
    const body = await gatewayRequest<
      | { bytes_base64: string; content_type?: string }
      | { data: { bytes_base64: string; content_type?: string } }
    >(`/internal/v1/instances/${encodeURIComponent(input.sessionRef)}/qrcode`, {
      method: "GET",
      headers: { "X-Organization-Id": input.organizationId },
    });
    const result = unwrapData(body);
    const binary = Buffer.from(result.bytes_base64, "base64");
    return {
      bytes: binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength),
      contentType: result.content_type ?? "image/png",
    };
  },

  async fetchInboundMedia(input: {
    organizationId: string;
    sessionRef: string;
    url: string;
    hintMime?: string | null;
  }): Promise<FetchedMedia> {
    const body = await gatewayRequest<
      | { bytes_base64: string; mime: string }
      | { data: { bytes_base64: string; mime: string } }
    >("/internal/v1/media/fetch", {
      method: "POST",
      body: JSON.stringify({
        organization_id: input.organizationId,
        instance: input.sessionRef,
        url: input.url,
        hint_mime: input.hintMime ?? null,
      }),
    });
    const result = unwrapData(body);
    return { buffer: Buffer.from(result.bytes_base64, "base64"), mime: result.mime };
  },

  async send(envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    const body = await gatewayRequest<
      | { external_id?: string | null }
      | { data: { external_id?: string | null } }
    >("/internal/v1/send", {
      method: "POST",
      headers: { "Idempotency-Key": `${envelope.organizationId}:${envelope.sessionRef}:${envelope.to}:${randomUUID()}` },
      body: JSON.stringify({
        organization_id: envelope.organizationId,
        instance: envelope.sessionRef,
        to: envelope.to,
        kind: envelope.kind,
        body: envelope.body ?? null,
        media: envelope.media
          ? {
              url: envelope.media.url,
              mime: envelope.media.mime,
              filename: envelope.media.filename ?? null,
              caption: envelope.media.caption ?? null,
            }
          : null,
        contact: envelope.contact ?? null,
        provider_conversation_id: envelope.providerConversationId ?? null,
        reply_to_external_id: envelope.replyToExternalId ?? null,
      }),
    });
    return { externalId: unwrapData(body).external_id ?? null };
  },
};
