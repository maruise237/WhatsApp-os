/**
 * GET /api/v1/system/version — version de l'image en service.
 *
 * Gravée au build (`APP_VERSION`, voir Dockerfile). Les mises à jour passent
 * par Dokploy (redéploiement), pas par l'application.
 */
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Connectez-vous pour continuer.", 401);
  return ok({ current_version: process.env.APP_VERSION ?? "dev" });
}
