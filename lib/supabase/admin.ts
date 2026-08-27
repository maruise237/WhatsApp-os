/**
 * Compatibility entrypoint kept while the repository completes its Neon rename.
 * Runtime database access is the private Neon PostgreSQL pool; no service JWT is required.
 */
export { createAdminClient } from "@/lib/neon/admin-client";
export type { NeonAdminClient } from "@/lib/neon/admin-client";
