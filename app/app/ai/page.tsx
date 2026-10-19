import { NavHub } from "@/components/shell/NavHub";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Hub da área de IA.
 *
 * Substitui as abas que só apareciam para quem JÁ estava dentro de `/app/ai/*`:
 * Conhecimento, Credenciais, Uso, Casos e Alertas eram invisíveis de qualquer
 * outro lugar do sistema. Aqui as dez telas aparecem juntas, na jornada de quem
 * opera um agente — montar, ensinar, acompanhar.
 */
export default async function AiHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);

  return (
    <NavHub
      group="ia"
      isPlatformAdmin={user.is_platform_admin}
      role={activeOrg?.role ?? null}
      idioma={normalizarIdioma(user.locale)}
      title="Agent IA"
      subtitle="Tout ce qui définit qui répond à votre place — et comment suivre ce qu’il fait."
    />
  );
}
