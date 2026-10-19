import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { MetricsClient } from "./_components/MetricsClient";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // spec 13 §6.1: agent vê as próprias (RLS); a comparação por atendente é manager+.
  const canCompare = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
        <p className="text-sm text-muted-foreground">
          {canCompare
            ? "Friction, tableau et performance par conseiller sur les 30 derniers jours."
            : "La friction, votre tableau et votre performance sur les 30 derniers jours."}
        </p>
      </header>

      <MetricsClient canCompare={canCompare} currentUserId={user.id} />
    </div>
  );
}
