import Link from "next/link";

import { LoginForm } from "@/components/auth/LoginForm";
import { branding } from "@/lib/branding";

export const metadata = { title: "Se connecter" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const { next, reset, error } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Se connecter</h1>
        <p className="text-sm text-muted-foreground">{branding().name}</p>
      </div>
      {reset === "success" && (
        <div
          className="border-primary/30 bg-primary/10 rounded-md border px-3 py-2 text-sm"
          role="status"
        >
          Mot de passe réinitialisé avec succès. Connectez-vous avec votre nouveau mot de passe.
        </div>
      )}
      {error === "link_invalido" && (
        <div
          className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Lien invalide ou expiré. Demandez-en un nouveau via « Mot de passe oublié » ou recommencez
          l’inscription.
        </div>
      )}
      {/*
        Os dois avisos abaixo chegaram por frentes diferentes e falam de erros
        diferentes — o merge os pôs no mesmo lugar, e ficar com um só apagaria um
        diagnóstico inteiro da tela de login.
      */}
      {error === "convite_invalido" && (
        <div
          className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Votre compte a été confirmé, mais l’invitation n’est plus valide : elle a expiré ou a été
          émise pour une autre adresse e-mail. Demandez une nouvelle invitation à la personne qui
          vous l’a envoyée. Aucune entreprise n’a été créée, car ce n’était pas votre parcours.
        </div>
      )}
      {error === "template_padrao" && (
        <div
          className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Ce lien provient du modèle d’e-mail standard de Supabase et ne permet pas l’accès à cette
          installation ; demander un autre lien ne résoudra pas le problème. La personne qui
          administre le système doit configurer les e-mails d’accès (<code>marca-emails.sh</code>,
          dans le kit d’installation).
        </div>
      )}
      {error === "provisionamento" && (
        <div
          className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Votre compte a été confirmé, mais une erreur est survenue lors de la préparation de votre
          environnement. Réessayez de vous connecter dans quelques instants.
        </div>
      )}
      <LoginForm next={next} />
      <div className="space-y-2 text-center text-sm">
        <p>
          <Link
            href="/login/forgot"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Mot de passe oublié
          </Link>
        </p>
        <p className="text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
