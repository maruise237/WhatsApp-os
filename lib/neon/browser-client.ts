import { createClient as createNeonClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";

type RuntimePublicEnv = {
  NEON_AUTH_BASE_URL?: string;
  NEON_DATA_API_URL?: string;
};

function publicEnv(): RuntimePublicEnv {
  if (typeof window !== "undefined") {
    return (window.__PUBLIC_ENV__ ?? {}) as RuntimePublicEnv;
  }
  return {
    NEON_AUTH_BASE_URL: process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? process.env.NEON_AUTH_BASE_URL,
    NEON_DATA_API_URL: process.env.NEXT_PUBLIC_NEON_DATA_API_URL ?? process.env.NEON_DATA_API_URL,
  };
}

function channel(name: string) {
  const listeners: Array<{ event: string; filter?: { table?: string; filter?: string; event?: string }; callback: (payload: unknown) => void }> = [];
  let source: EventSource | null = null;
  const api = {
    on(event: string, filter: unknown, callback: (payload: unknown) => void) {
      listeners.push({
        event,
        filter: typeof filter === "object" && filter !== null ? filter as { table?: string; filter?: string; event?: string } : undefined,
        callback,
      });
      return api;
    },
    subscribe(callback?: (status: string) => void) {
      if (typeof window === "undefined") {
        callback?.("CLOSED");
        return api;
      }
      const postgres = listeners.find((listener) => listener.event === "postgres_changes");
      const params = new URLSearchParams({ channel: name });
      if (postgres?.filter?.table) params.set("table", postgres.filter.table);
      if (postgres?.filter?.filter) params.set("filter", postgres.filter.filter);
      source = new EventSource(`/api/v1/realtime/stream?${params.toString()}`);
      source.addEventListener("ready", () => callback?.("SUBSCRIBED"));
      source.addEventListener("change", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as unknown;
        for (const listener of listeners) {
          if (listener.event === "postgres_changes" || listener.event === "*") listener.callback(payload);
        }
      });
      source.addEventListener("error", () => callback?.("CHANNEL_ERROR"));
      return api;
    },
    unsubscribe() {
      source?.close();
      source = null;
      listeners.length = 0;
      return Promise.resolve("ok");
    },
    __name: name,
  };
  return api;
}

type NeonBrowserClient = ReturnType<typeof createNeonClient> & {
  channel: typeof channel;
  removeChannel: (current: { unsubscribe?: () => Promise<unknown> }) => Promise<unknown> | undefined;
};

let client: NeonBrowserClient | null = null;

export function __resetNeonBrowserClient(): void {
  client = null;
}

export function createClient() {
  if (client) return client;
  const runtime = publicEnv();
  const authUrl = runtime.NEON_AUTH_BASE_URL;
  const dataApiUrl = runtime.NEON_DATA_API_URL;
  if (!authUrl || !dataApiUrl) {
    throw new Error("[neon/browser] NEON_AUTH_BASE_URL ou NEON_DATA_API_URL ausentes.");
  }

  const neon = createNeonClient({
    auth: {
      url: authUrl,
      adapter: SupabaseAuthAdapter(),
    },
    dataApi: {
      url: dataApiUrl,
    },
  });

  // The legacy channel surface is retained as a compatibility seam while the
  // server-backed SSE transport is introduced. It never grants data access;
  // real authorization remains in Neon Data API/RLS.
  client = Object.assign(neon, {
    channel,
    removeChannel: (current: { unsubscribe?: () => Promise<unknown> }) => current.unsubscribe?.(),
  });
  return client;
}
