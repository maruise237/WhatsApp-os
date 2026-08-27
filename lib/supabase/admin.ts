/**
 * Compatibility entrypoint kept while the repository completes its Neon rename.
 * Runtime database access is Neon Data API with an explicit admin JWT.
 */
export { createAdminClient } from "@/lib/neon/admin-client";
export type { NeonAdminClient } from "@/lib/neon/admin-client";
