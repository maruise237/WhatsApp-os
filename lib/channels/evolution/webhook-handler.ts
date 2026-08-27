import { createAdminClient } from "@/lib/supabase/admin";
import { CHANNEL_PROVIDER_EVOLUTION_GO } from "@/lib/channels/capabilities";
import { ingestEvolutionGoInbound } from "@/lib/channels/evolution/inbound";
import type { EventHandler } from "@/lib/event-log/dispatcher";

interface ProviderEvent {
  event?: unknown;
  instance?: unknown;
  data?: Record<string, unknown>;
}

export const evolutionGoWebhookHandler: EventHandler = {
  key: "evolution-go-webhook-ingest",
  events: ["whatsapp.message_received", "whatsapp.provider_event"],
  async handle(row) {
    const wrapper = row.payload as { instance?: unknown; provider_event?: ProviderEvent };
    const providerEvent = wrapper.provider_event;
    const instance =
      typeof wrapper.instance === "string"
        ? wrapper.instance
        : typeof providerEvent?.instance === "string"
          ? providerEvent.instance
          : null;
    const event = typeof providerEvent?.event === "string" ? providerEvent.event : null;
    if (!instance || !event || !providerEvent?.data) {
      return { consumer_key: "evolution-go-webhook-ingest", status: "skipped", detail: "invalid_provider_event" };
    }

    const admin = createAdminClient();
    const { data: session, error } = await admin
      .from("channel_sessions")
      .select("id, provider")
      .eq("organization_id", row.organization_id)
      .eq("provider", CHANNEL_PROVIDER_EVOLUTION_GO)
      .eq("evolution_instance_name", instance)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error(`evolution_session_lookup_failed:${error.message}`);
    if (!session) return { consumer_key: "evolution-go-webhook-ingest", status: "skipped", detail: "session_not_found" };

    const outcome = await ingestEvolutionGoInbound(admin, {
      organizationId: row.organization_id,
      channelSessionId: session.id,
      instance,
      event,
      data: providerEvent.data,
    });

    return {
      consumer_key: "evolution-go-webhook-ingest",
      status: "ok",
      detail: `${event}:${outcome.status}:${outcome.reason ?? ""}`,
    };
  },
};
