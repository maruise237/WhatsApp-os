import type { NextRequest } from "next/server";
import { createClient } from "@/lib/neon/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TABLES = new Set([
  "conversations",
  "messages",
  "conversation_notes",
  "crm_leads",
  "crm_lead_activities",
  "ai_agent_runs",
  "ai_knowledge_sources",
  "organizations",
]);

function parseFilter(filter: string | null): { column: string; value: string } | null {
  if (!filter) return null;
  const match = /^([a-zA-Z_][a-zA-Z0-9_]*)=eq\.(.+)$/.exec(filter);
  if (!match?.[1] || !match[2]) return null;
  return { column: match[1], value: match[2] };
}

export async function GET(request: NextRequest) {
  const table = request.nextUrl.searchParams.get("table");
  const filter = parseFilter(request.nextUrl.searchParams.get("filter"));
  if (!table || !ALLOWED_TABLES.has(table)) {
    return new Response(JSON.stringify({ error: "realtime_table_not_allowed" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previousSignature = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => {
        if (cancelled) return;
        cancelled = true;
        if (timer) clearTimeout(timer);
        try { controller.close(); } catch { /* stream already closed */ }
      };

      const poll = async () => {
        if (cancelled) return;
        try {
          const client = await createClient();
          let query = client.from(table).select("id").limit(100);
          if (filter) query = query.eq(filter.column, filter.value);
          const result = await query;
          if (result.error) throw result.error;
          const rows = Array.isArray(result.data) ? result.data : [];
          const signature = JSON.stringify(rows);
          if (previousSignature && signature !== previousSignature) {
            send("change", { table, filter: request.nextUrl.searchParams.get("filter"), rows });
          }
          previousSignature = signature;
          send("heartbeat", { at: new Date().toISOString() });
        } catch (error) {
          send("error", { code: "realtime_poll_failed", message: error instanceof Error ? error.message : "Realtime polling failed" });
        }
        if (!cancelled) timer = setTimeout(() => void poll(), 3000);
      };

      request.signal.addEventListener("abort", close, { once: true });
      send("ready", { table });
      await poll();
    },
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
