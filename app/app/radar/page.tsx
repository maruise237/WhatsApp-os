import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { RiskRadarList } from "./_components/RiskRadarList";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const idioma = normalizarIdioma(user.locale);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Radar de risco", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {"Les demandes ouvertes qui ont refroidi et ont besoin de vous. Si l’assistant a déjà planifié un retour, elle apparaît « en vol » ; sans prochaine étape, c’est un risque de perdre le client."}
        </p>
      </header>
      <RiskRadarList />
    </div>
  );
}
