import { describe, expect, it } from "vitest";

import { evolutionPayloadToCrmEnvelope } from "./inbound";

describe("Evolution Go inbound normalization", () => {
  it("normalizes an inbound DM into the CRM envelope", () => {
    const envelope = evolutionPayloadToCrmEnvelope("seller-1", "MESSAGES_UPSERT", {
      key: { id: "wamid-1", remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
      pushName: "Ana",
      messageTimestamp: 1_700_000_000,
      message: { extendedTextMessage: { text: "Quero o kit" } },
    });

    expect(envelope).toMatchObject({
      event: "message.received",
      accountId: "seller-1",
      message: {
        platform: "whatsapp",
        direction: "incoming",
        conversationId: "5511999999999@s.whatsapp.net",
        platformMessageId: "wamid-1",
        text: "Quero o kit",
        sender: { phoneNumber: "+5511999999999", name: "Ana" },
      },
    });
  });

  it("rejects groups and broadcasts before CRM writes", () => {
    expect(
      evolutionPayloadToCrmEnvelope("seller-1", "MESSAGES_UPSERT", {
        key: { id: "group-1", remoteJid: "123@g.us", fromMe: false },
        message: { conversation: "grupo" },
      }),
    ).toBeNull();
    expect(
      evolutionPayloadToCrmEnvelope("seller-1", "MESSAGES_UPSERT", {
        key: { id: "broadcast-1", remoteJid: "status@broadcast", fromMe: false },
        message: { conversation: "status" },
      }),
    ).toBeNull();
  });

  it("keeps outgoing echoes as outgoing and maps delivery updates", () => {
    const sent = evolutionPayloadToCrmEnvelope("seller-1", "MESSAGES_UPSERT", {
      key: { id: "wamid-2", remoteJid: "5511888888888@s.whatsapp.net", fromMe: true },
      message: { conversation: "Réponse" },
    });
    expect(sent).toMatchObject({ event: "message.sent", message: { direction: "outgoing" } });

    const delivered = evolutionPayloadToCrmEnvelope("seller-1", "MESSAGES_UPDATE", {
      key: { id: "wamid-2", remoteJid: "5511888888888@s.whatsapp.net", fromMe: true },
      status: "DELIVERY_ACK",
    });
    expect(delivered).toMatchObject({ event: "message.delivered", message: { platformMessageId: "wamid-2" } });
  });
});
