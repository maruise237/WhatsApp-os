import type { NextRequest } from "next/server";

import { BUCKET_DE_LOGOS } from "@/lib/branding/logo";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const LOGO_PATH = new RegExp(`^(?:platform/${UUID}|${UUID})/${UUID}\\.(?:png|jpg)$`);

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!LOGO_PATH.test(path)) return new Response("Not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from(BUCKET_DE_LOGOS).download(path);
  if (error || !data) return new Response("Not found", { status: 404 });

  return new Response(data, {
    status: 200,
    headers: {
      "content-type": data.type || (path.endsWith(".png") ? "image/png" : "image/jpeg"),
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
