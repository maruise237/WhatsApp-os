"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useState } from "react";

import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/app/actions/auth/requestPasswordReset";
import { useT } from "@/hooks/i18n/useT";

export function ForgotPasswordForm() {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: ForgotPasswordInput) => {
    setServerError(null);
    startTransition(async () => {
      const res = await requestPasswordReset(values);
      if (res.ok) {
        setSent(true);
        return;
      }
      if (res.error === "rate_limited") {
        setServerError(t("Trop de tentatives. Patientez quelques minutes."));
      } else if (res.error === "validation_error") {
        setServerError(t("E-mail invalide. Vérifiez le champ."));
      } else {
        setServerError(t("Impossible d’envoyer l’e-mail. Réessayez."));
      }
    });
  };

  if (sent) {
    return (
      <div className="bg-muted/40 space-y-2 rounded-md border px-4 py-6 text-center" role="status">
        <p className="text-sm font-medium">{t("Vérifiez votre e-mail")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Si un compte existe avec cette adresse e-mail, un lien de réinitialisation du mot de passe vous a été envoyé.")}
        </p>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("E-mail")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{t(errors.email.message ?? "")}</p>
        )}
      </div>
      {serverError && (
        <div
          className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("Envoi…") : t("Envoyer le lien de réinitialisation")}
      </Button>
    </form>
  );
}
