/**
 * Compatibility entrypoint kept for existing client components during the Neon cutover.
 * The actual browser client is Neon Auth + Neon Data API.
 */
export { createClient, __resetNeonBrowserClient as __resetTokenDoRealtime } from "@/lib/neon/browser-client";
