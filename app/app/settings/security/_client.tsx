"use client";
import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { Card } from "@/components/ui/card";
import { signOutEverywhere } from "@/app/actions/settings/signOutEverywhere";

export function SecurityClient() {
  const t = useT();
  const [isSigningOut, startSignOut] = useTransition();

  function handleSignOutAll() {
    if (!confirm(t("Se déconnecter de TOUS les appareils ? Vous devrez vous reconnecter."))) return;
    startSignOut(async () => {
      await signOutEverywhere();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="space-y-3 p-6">
        <h2 className="text-sm font-semibold">{t("Mot de passe")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("Pour changer de mot de passe, demandez un lien de réinitialisation par e-mail.")}
        </p>
        <Button variant="outline" asChild>
          <Link href="/login/forgot">{t("Réinitialiser le mot de passe")}</Link>
        </Button>
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="text-sm font-semibold">{t("Sessions actives")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("Liste des sessions — bientôt disponible. Pour l’instant, déconnectez tous les appareils :")}
        </p>
        <Button variant="outline" disabled={isSigningOut} onClick={handleSignOutAll}>
          {isSigningOut ? t("Déconnexion…") : t("Déconnecter tous les appareils")}
        </Button>
      </Card>
    </div>
  );
}
