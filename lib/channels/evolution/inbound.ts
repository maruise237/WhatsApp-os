import type { SupabaseClient } from "@supabase/supabase-js";

import { ingestZernioInbound, type ZernioIngestResult } from "@/lib/channels/zernio/ingest";

interface EvolutionData {
  key?: { id?: unknown; remoteJid?: unknown; fromMe?: unknown };
  pushName?: unknown;
  messageTimestamp?: unknown;
  message?: Record<string, unknown>;
  status?: unknown;
  update?: unknown;
}

const textFromMessage = (message: Record<string, unknown> | undefined): string | null => {
  if (!message) return null;
  const extended = message.extendedTextMessage;
  if (extended && typeof extended === "object") {
    const text = (extended as Record<string, unknown>).text;
    if (typeof text === "string" && text) return text;
  }
  for (const key of ["conversation", "text", "caption"]) {
    const value = message[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
};

function statusEvent(status: unknown): string | null {
  const value = String(status ?? "").toUpperCase();
  if (["DELIVERY_ACK", "DELIVERED", "SERVER_ACK"].includes(value)) return "message.delivered";
  if (["READ", "PLAYED"].includes(value)) return "message.read";
  if (["ERROR", "FAILED"].includes(value)) return "message.failed";
  return null;
}

function phoneFromJid(jid: string): string | null {
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return null;
  const digits = jid.replace(/@.*$/, "").replace(/\D/g, "");
  return digits.length >= 8 ? `+${digits}` : null;
}

function mediaFromMessage(message: Record<string, unknown> | undefined): { type: string; url: string }[] {
  if (!message) return [];
  for (const [key, type] of [
    ["imageMessage", "image"],
    ["videoMessage", "video"],
    ["audioMessage", "audio"],
    ["documentMessage", "document"],
  ] as const) {
    const value = message[key];
    if (value && typeof value === "object") {
      const url = (value as Record<string, unknown>).url;
      if (typeof url === "string" && url) return [{ type, url }];
    }
  }
  return [];
}

export function evolutionPayloadToCrmEnvelope(instance: string, event: string, data: EvolutionData): Record<string, unknown> | null {
  const key = data.key ?? {};
  const externalId = typeof key.id === "string" ? key.id : null;
  const conversationId = typeof key.remoteJid === "string" ? key.remoteJid : null;
  if (!externalId || !conversationId || conversationId.endsWith("@g.us") || conversationId.endsWith("@broadcast")) return null;

  const status = event === "MESSAGES_UPDATE" ? statusEvent(data.status ?? data.update) : null;
  const phone = phoneFromJid(conversationId);
  const direction = key.fromMe === true ? "outgoing" : "incoming";
  const sender = {
    phoneNumber: phone,
    name: typeof data.pushName === "string" ? data.pushName : null,
  };
  const message = data.message ?? {};
  const envelopeEvent = status ?? (direction === "outgoing" ? "message.sent" : "message.received");

  return {
    event: envelopeEvent,
    accountId: instance,
    message: {
      platform: "whatsapp",
      direction,
      conversationId,
      platformMessageId: externalId,
      id: externalId,
      text: textFromMessage(message),
      attachments: mediaFromMessage(message),
      sentAt:
        typeof data.messageTimestamp === "number"
          ? new Date(data.messageTimestamp * 1000).toISOString()
          : new Date().toISOString(),
      sender,
      conversation: { participantId: conversationId, participantName: sender.name },
    },
  };
}

export async function ingestEvolutionGoInbound(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; instance: string; event: string; data: EvolutionData },
): Promise<ZernioIngestResult> {
  const envelope = evolutionPayloadToCrmEnvelope(input.instance, input.event, input.data);
  if (!envelope) return { status: "ignored", reason: "evento_sem_interesse" };
  return ingestZernioInbound(admin, {
    organizationId: input.organizationId,
    channelSessionId: input.channelSessionId,
    payload: envelope,
  });
}
