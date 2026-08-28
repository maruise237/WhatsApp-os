import { requireAuth } from "@/lib/auth/server";
import { ProfileForm } from "./_form";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireAuth();
  const idioma = normalizarIdioma(user.locale);
  const meta = user as unknown as { full_name: string | null; avatar_url: string | null };
  // Read locale/timezone from raw user meta if present (loadAuthUser doesn't include them).
  // We pass safe defaults that the form re-syncs on submit.
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Profil", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Informations personnelles. Le changement d’e-mail sera bientôt disponible.",
            idioma,
          )}
        </p>
      </header>
      <ProfileForm
        email={user.email}
        initialFullName={meta.full_name}
        initialAvatarUrl={meta.avatar_url}
        initialLocale={user.locale}
      />
    </div>
  );
}
