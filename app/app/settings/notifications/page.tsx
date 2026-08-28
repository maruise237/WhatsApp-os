import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "@/lib/schemas/settings";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<(typeof NOTIFICATION_CATEGORIES)[number], string> = {
  lead_assigned: "Lead atribuído a você",
  lead_won: "Lead ganho",
  lead_lost: "Lead perdido",
  mention: "Você foi mencionado",
};

const CHANNEL_LABELS: Record<(typeof NOTIFICATION_CHANNELS)[number], string> = {
  email: "Email",
  in_app: "In-app",
  push: "Push",
};

export default async function NotificationsPage() {
  const user = await requireAuth();
  const idioma = normalizarIdioma(user.locale);
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Notificações", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">{traduzir("Canais e categorias.", idioma)}</p>
      </header>

      <Card className="border-amber-500/40 bg-amber-50/40 p-4 text-sm dark:bg-amber-900/10">
        {traduzir(
          "Preferências de notificação em breve. Por enquanto, alertas críticos são enviados por email.",
          idioma,
        )}
      </Card>

      {/* `overflow-x-auto` isolado nesta tabela — sem ele, categoria + 3 canais
          passava da largura de um celular pequeno e a PÁGINA inteira ganhava
          scroll horizontal (esta era a única tabela do app fora do componente
          `ui/table.tsx`, que já embrulha assim por padrão). */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{traduzir("Categoria", idioma)}</th>
              {NOTIFICATION_CHANNELS.map((c) => (
                <th key={c} className="px-4 py-3 text-center font-medium">
                  {traduzir(CHANNEL_LABELS[c], idioma)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_CATEGORIES.map((cat) => (
              <tr key={cat} className="border-b last:border-0">
                <td className="px-4 py-3">{traduzir(CATEGORY_LABELS[cat], idioma)}</td>
                {NOTIFICATION_CHANNELS.map((ch) => (
                  <td key={ch} className="px-4 py-3 text-center">
                    <Switch
                      checked={false}
                      disabled
                      aria-label={`${traduzir(CATEGORY_LABELS[cat], idioma)} via ${traduzir(CHANNEL_LABELS[ch], idioma)}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
