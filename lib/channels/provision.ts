import { env } from "@/lib/env";
import { getWahaClient, wahaFriendlyError } from "@/lib/waha/client";
import type { ChannelProvider } from "./types";

export interface ProvisionChannelInput {
  organizationId: string;
  sessionRef: string;
  displayName?: string | null;
}

function gatewayHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.WHATSAPP_GATEWAY_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function provisionEvolutionGo(input: ProvisionChannelInput): Promise<void> {
  if (!env.WHATSAPP_GATEWAY_BASE_URL || !env.WHATSAPP_GATEWAY_TOKEN) {
    throw new Error("whatsapp_gateway_not_configured");
  }
  const response = await fetch(`${env.WHATSAPP_GATEWAY_BASE_URL.replace(/\/$/, "")}/internal/v1/instances`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      organization_id: input.organizationId,
      instance: input.sessionRef,
      display_name: input.displayName ?? null,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error(`whatsapp_gateway_${response.status}: ${detail}`);
  }
}

const PROVISIONERS: Record<ChannelProvider, (input: ProvisionChannelInput) => Promise<void>> = {
  waha: async (input) => {
    const client = getWahaClient();
    if (!client) throw new Error("waha_not_configured");
    await client.startSession(input.sessionRef);
  },
  meta_cloud: async () => {
    throw new Error("provider_provision_not_supported");
  },
  zernio: async () => {
    throw new Error("provider_provision_not_supported");
  },
  evolution_go: provisionEvolutionGo,
};

export function sessionReferenceColumns(provider: ChannelProvider, sessionRef: string): Record<string, string | null> {
  return provider === "evolution_go"
    ? { waha_session_name: null, evolution_instance_name: sessionRef }
    : { waha_session_name: sessionRef, evolution_instance_name: null };
}

export function provisionErrorCode(provider: ChannelProvider): "waha_error" | "upstream_unavailable" {
  return provider === "waha" ? "waha_error" : "upstream_unavailable";
}

export async function provisionChannel(provider: ChannelProvider, input: ProvisionChannelInput): Promise<void> {
  await PROVISIONERS[provider](input);
}

export function friendlyProvisionError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("waha_")) return wahaFriendlyError(error);
  if (error instanceof Error && error.message === "whatsapp_gateway_not_configured") {
    return "Le gateway WhatsApp n’est pas configuré dans cet environnement.";
  }
  if (error instanceof Error && error.message === "waha_not_configured") {
    return "WAHA n’est pas configuré dans cet environnement.";
  }
  return error instanceof Error ? error.message.slice(0, 240) : "channel_provision_failed";
}
