import Link from "next/link";

import { SignupForm } from "@/components/auth/SignupForm";
import { branding } from "@/lib/branding";
import { verifyInviteToken } from "@/lib/auth/invite-token";

export const metadata = { title: "Créer un compte" };

/**
 * Aceita `?invite=<token>`: é o caminho de quem foi convidado e ainda não tem
 * conta. Sem isso, essa pessoa criava uma conta comum, e o provisionamento —
 * sem encontrar vínculo nenhum — abria uma organização e a tornava admin dela.
 *
 * O token só é lido aqui para MONTAR a tela (esconder o nome da empresa, travar
 * o e-mail). Quem decide o que ele vale é o servidor, duas vezes: ao criar a
 * conta e ao confirmar o e-mail.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const payload = invite ? verifyInviteToken(invite) : null;
  const convite = invite && payload ? { token: invite, email: payload.email } : undefined;
  const conviteExpirado = Boolean(invite) && !payload;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
        <p className="text-sm text-muted-foreground">
          {convite
            ? "Créez votre mot de passe pour rejoindre l’entreprise qui vous a invité"
            : `Commencez à utiliser ${branding().name} en quelques minutes`}
        </p>
      </div>

      {conviteExpirado && (
        <p
          role="alert"
          className="rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          Cette invitation a expiré ou n’est plus valide. Demandez-en une nouvelle à la personne qui
          vous a invité : créer un compte maintenant ouvrirait une nouvelle entreprise, ce qui n’est
          pas souhaité.
        </p>
      )}

      <SignupForm convite={convite} />

      <p className="text-center text-sm text-muted-foreground">
        Vous avez déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
