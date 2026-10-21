"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useState } from "react";

import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "@/app/actions/auth/updatePassword";
import { useT } from "@/hooks/i18n/useT";

export function ResetPasswordForm() {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", password_confirm: "", mfa_code: "" },
  });

  const onSubmit = (values: ResetPasswordInput) => {
    setServerError(null);
    startTransition(async () => {
      // Sucesso redireciona server-side para /login?reset=success.
      const res = await updatePassword(values);
      if (!res) return;
      if (res.error === "mfa_required") {
        setNeedsMfa(true);
        setServerError(
          t(
            "Votre compte utilise la validation en deux étapes. Saisissez le code à 6 chiffres de votre application d’authentification pour terminer.",
          ),
        );
      } else if (res.error === "mfa_invalid") {
        setNeedsMfa(true);
        setServerError(t("Code de validation invalide. Réessayez."));
      } else if (res.error === "session_expired") {
        setServerError(t("La session de réinitialisation a expiré. Demandez un nouveau lien via « Mot de passe oublié »."));
      } else if (res.error === "same_password") {
        setServerError(t("Le nouveau mot de passe doit être différent de l’actuel."));
      } else if (res.error === "validation_error") {
        setServerError(t("Données invalides. Vérifiez les champs."));
      } else {
        setServerError(t("Impossible de réinitialiser le mot de passe. Réessayez."));
      }
    });
  };

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("Nouveau mot de passe")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-invalid={errors.password ? true : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{t(errors.password.message ?? "")}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password_confirm">{t("Confirmer le nouveau mot de passe")}</Label>
        <Input
          id="password_confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password_confirm ? true : undefined}
          {...register("password_confirm")}
        />
        {errors.password_confirm && (
          <p className="text-xs text-destructive">{t(errors.password_confirm.message ?? "")}</p>
        )}
      </div>
      {needsMfa && (
        <div className="space-y-1.5">
          <Label htmlFor="mfa_code">{t("Code de validation (2 étapes)")}</Label>
          <Input
            id="mfa_code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            autoFocus
            {...register("mfa_code")}
          />
        </div>
      )}
      {serverError && (
        <div
          className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive"
          role={needsMfa ? "status" : "alert"}
        >
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("Enregistrement…") : t("Définir le nouveau mot de passe")}
      </Button>
    </form>
  );
}
