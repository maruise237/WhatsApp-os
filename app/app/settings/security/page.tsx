import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { SecurityClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * SÉCURITÉ — mot de passe et sessions ouvertes.
 *
 * La validation en deux étapes a été retirée : Neon Auth ne la propose pas aux
 * utilisateurs de l’application, et une politique « obligatoire » impossible à
 * satisfaire bloquait les administrateurs hors du produit.
 */
export default async function SecurityPage() {
  const user = await requireAuth();
  const idioma = normalizarIdioma(user.locale);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Segurança", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {"Le mot de passe de votre compte et les sessions ouvertes."}
        </p>
      </header>

      <SecurityClient />
    </div>
  );
}
