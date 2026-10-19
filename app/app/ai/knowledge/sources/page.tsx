import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import type { SourceRow } from "@/hooks/ai/useKnowledgeSources";
import { KnowledgeSourcesClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function KnowledgeSourcesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("id, name, is_default")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_default", true)
    .maybeSingle();

  if (!agent) {
    return (
      <div className="flex h-full flex-col gap-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Sources de connaissances</h1>
          <p className="text-sm text-muted-foreground">
            Configurez les sources RAG de l’agent par défaut de l’organisation.
          </p>
        </header>
        <div className="rounded-lg border border-border bg-surface p-6 text-sm">
          <p className="mb-4">
            Aucun agent par défaut trouvé. Créez un agent par défaut dans{" "}
            <span className="font-mono">/app/ai/agents</span> d’abord.
          </p>
          <Button asChild variant="primary" size="sm">
            <Link href="/app/ai/agents">Aller aux agents</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { data: sourcesRaw } = await supabase
    .from("ai_knowledge_sources")
    .select("*")
    .eq("organization_id", activeOrg.orgId)
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: true });

  const initialSources = (sourcesRaw ?? []) as unknown as SourceRow[];

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sources de connaissances</h1>
        <p className="text-sm text-muted-foreground">
          Statut et actions sur les sources RAG de l’agent <span className="font-medium">{agent.name}</span>.
        </p>
      </header>
      <KnowledgeSourcesClient agentId={agent.id} initialSources={initialSources} />
    </div>
  );
}
