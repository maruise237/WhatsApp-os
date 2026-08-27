import { getNeonAuthHandler } from "@/lib/neon/server-client";

const handler = getNeonAuthHandler();

export const GET = handler.GET;
export const POST = handler.POST;
