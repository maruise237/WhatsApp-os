/**
 * Compatibility entrypoint kept for existing callsites during the Neon cutover.
 * Runtime authentication and Data API requests are handled by Neon Auth/Data API.
 */
export { createClient, createNeonAuthForNextRequest, getNeonAuthHandler, getNeonAuthMiddleware } from "@/lib/neon/server-client";
