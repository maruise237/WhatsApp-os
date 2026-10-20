import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { AgentInboxList } from "./_components/AgentInboxList";

export const dynamic = "force-dynamic";

export default async function AgentInboxPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const canResolve = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Centre d’alertes</h1>
        <p className="text-sm text-muted-foreground">
          Ce que l’assistant a dû remonter à l’équipe : connexions perdues, tâches échouées, échanges transférés à des humains.
        </p>
      </header>
      <AgentInboxList canResolve={canResolve} />
    </div>
  );
}
