import { createAdminClient } from "@/lib/neon/admin-client";

/**
 * Compatibility factory for operational scripts. The URL/key arguments are
 * intentionally ignored: privileged access must come from the explicitly
 * configured Neon service-role JWT, never from script arguments or source code.
 */
export function createClient(_url?: string, _key?: string, _options?: unknown) {
  return createAdminClient();
}

export type SupabaseClient = ReturnType<typeof createAdminClient>;
