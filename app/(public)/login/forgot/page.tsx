import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">
          Saisissez votre e-mail pour recevoir un lien de réinitialisation
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground">
        Vous vous souvenez de votre mot de passe ?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
