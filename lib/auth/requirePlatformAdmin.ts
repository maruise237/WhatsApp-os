/**
 * Garde serveur de /admin/* (sous-produit Super-Admin de la plateforme).
 *
 * Déroulé :
 *  1. Valide le JWT via getUser() (JAMAIS getSession côté serveur, cf. CLAUDE.md).
 *  2. Confirme la ligne dans platform_admins (active = sans revoked_at).
 *
 * Redirections :
 *  - pas d’utilisateur → /login?next=/admin
 *  - pas de ligne      → /admin/forbidden
 */
import { redirect } from "next/navigation";
import type { UtilisateurAuth as User } from "@/lib/neon/server-client";
import { createClient } from "@/lib/db/server";

export interface PlatformAdminInfo {
  user_id: string;
  scope: string;
}

export interface PlatformAdminContext {
  user: User;
  platformAdmin: PlatformAdminInfo;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    redirect("/login?next=/admin");
  }

  // RLS de platform_admins : seuls les admins de plateforme lisent ; les autres reçoivent null → refus.
  const { data: paRow } = await db
    .from("platform_admins")
    .select("user_id, scope, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!paRow) {
    redirect("/admin/forbidden");
  }

  return {
    user,
    platformAdmin: {
      user_id: paRow.user_id,
      scope: paRow.scope,
    },
  };
}
