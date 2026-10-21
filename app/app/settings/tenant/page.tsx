import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { createClient } from "@/lib/db/server";
import { indicatifDeLOrganisation } from "@/lib/telephone/normaliser";
import { TenantForm } from "./_form";

export const dynamic = "force-dynamic";

interface OrgRow {
  display_name: string;
  legal_name: string;
  cnpj: string | null;
  timezone: string;
  locale: string;
  media_retention_days: number;
  dpo_email: string | null;
  privacy_policy_url: string | null;
  settings: Record<string, unknown> | null;
}

export default async function TenantSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const db = await createClient();
  const { data } = await db
    .from("organizations")
    .select(
      "display_name, legal_name, cnpj, timezone, locale, media_retention_days, dpo_email, privacy_policy_url, settings",
    )
    .eq("id", activeOrg.orgId)
    .maybeSingle();

  const row = (data ?? null) as OrgRow | null;
  const lostReasonsExtra = (
    row?.settings &&
    Array.isArray((row.settings as { lost_reasons_extra?: unknown }).lost_reasons_extra)
      ? ((row.settings as { lost_reasons_extra?: string[] }).lost_reasons_extra ?? [])
      : []
  ) as string[];

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{"Organisation"}</h1>
        <p className="text-sm text-muted-foreground">
          {"Données de l’entreprise, rétention des médias et DPO. Réservé aux administrateurs."}
        </p>
      </header>
      {row && (
        <TenantForm
          initial={{
            display_name: row.display_name,
            legal_name: row.legal_name,
            cnpj: row.cnpj,
            timezone: row.timezone,
            // Les anciennes locales non proposées sont normalisées vers le français.
            locale: normalizarIdioma(row.locale),
            media_retention_days: row.media_retention_days,
            dpo_email: row.dpo_email,
            privacy_policy_url: row.privacy_policy_url,
            lost_reasons_extra: lostReasonsExtra,
            phone_country_code: indicatifDeLOrganisation(row.settings),
          }}
        />
      )}
    </div>
  );
}
