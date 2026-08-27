import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { SalesCentral } from "./_client";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.agent) redirect("/403");

  return <SalesCentral canManageCatalog={user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager} />;
}
