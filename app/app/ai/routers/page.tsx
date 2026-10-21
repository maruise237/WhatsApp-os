import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { createClient } from "@/lib/db/server";
import type { RouterListItem } from "@/hooks/ai/useRouters";
import { RoutersClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function RoutersPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const db = await createClient();

  const [{ data: routerRows }, { data: memberRows }, channelSessions] = await Promise.all([
    db
      .from("ai_routers")
      .select("id, name, channel_session_id, is_active, fallback_agent_id, updated_at")
      .eq("organization_id", activeOrg.orgId)
      .order("created_at", { ascending: false }),
    db.from("ai_router_members").select("router_id").eq("organization_id", activeOrg.orgId),
    listSelectableChannels(db, activeOrg.orgId),
  ]);

  const counts = new Map<string, number>();
  for (const m of memberRows ?? []) {
    counts.set(m.router_id, (counts.get(m.router_id) ?? 0) + 1);
  }

  const routers: RouterListItem[] = (routerRows ?? []).map((r) => ({
    ...r,
    member_count: counts.get(r.id) ?? 0,
  }));

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Routeurs</h1>
        <p className="text-sm text-muted-foreground">
          Un routeur comprend ce que veut le client et confie la conversation au bon agent — branché sur un numéro WhatsApp.
        </p>
      </header>
      <RoutersClient initialState={{ routers }} channelSessions={channelSessions} />
    </div>
  );
}
