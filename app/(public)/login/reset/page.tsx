import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Nouveau mot de passe" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Définir le nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez un nouveau mot de passe pour votre compte
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
