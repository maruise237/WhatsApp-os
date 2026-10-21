"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { Card } from "@/components/ui/card";
import { RecoveryCodesPanel } from "@/components/auth/RecoveryCodesPanel";
import { MfaEnrollModal } from "@/components/auth/MfaEnrollModal";
import { regenerateRecoveryCodes } from "@/app/actions/settings/regenerateRecoveryCodes";
import { signOutEverywhere } from "@/app/actions/settings/signOutEverywhere";
import { definirExigenciaDeMfa, desativarMfaDaConta } from "@/app/actions/auth/politicaDeMfa";

export function SecurityClient({
  mfaEnrolled,
  obrigatorio,
  podeExigirDaEquipe,
  empresaExige,
}: {
  mfaEnrolled: boolean;
  /** A política obriga esta pessoa a ter a verificação? */
  obrigatorio: boolean;
  /** Só admin muda a regra da empresa. */
  podeExigirDaEquipe: boolean;
  empresaExige: boolean;
}) {
  const t = useT();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSigningOut, startSignOut] = useTransition();
  const [ativando, setAtivando] = useState(false);
  const [mexendo, startMexer] = useTransition();

  function handleRegenerate() {
    if (!confirm(t("Générer de nouveaux codes invalidera TOUS les codes actuels. Êtes-vous sûr ?"))) {
      return;
    }
    startTransition(async () => {
      const r = await regenerateRecoveryCodes();
      if (r.ok) {
        setCodes(r.recovery_codes);
        toast.success(t("Nouveaux codes générés."));
      } else {
        toast.error(`Erreur : ${r.error}`);
      }
    });
  }

  function handleSignOutAll() {
    if (!confirm(t("Se déconnecter de TOUS les appareils ? Vous devrez vous reconnecter."))) return;
    startSignOut(async () => {
      await signOutEverywhere();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* O modal é o MESMO do bloqueador de tela cheia — reusado, não copiado.
          Ele recarrega a página ao terminar, e o servidor reavalia o estado. */}
      {ativando ? <MfaEnrollModal motivo="escolha" /> : null}

      <Card className="space-y-3 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">{t("Validation en deux étapes")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "En plus du mot de passe, le système demande un code à 6 chiffres disponible uniquement sur votre téléphone. C’est la protection qui limite les risques liés à un mot de passe compromis.",
              )}
            </p>
          </div>
          <span
            className={
              "shrink-0 rounded-full px-2 py-0.5 text-xs " +
              (mfaEnrolled
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground")
            }
          >
            {mfaEnrolled ? t("Activée") : t("Désactivée")}
          </span>
        </div>

        {mfaEnrolled ? (
          <div className="space-y-2">
            {obrigatorio ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Elle est obligatoire pour les administrateurs de cette entreprise et ne peut donc pas être désactivée ici. Un administrateur peut modifier cette règle ci-dessous.",
                )}
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={mexendo}
                onClick={() => {
                  if (!confirm(t("Désactiver la validation en deux étapes de ce compte ?"))) return;
                  startMexer(async () => {
                    const r = await desativarMfaDaConta();
                    if (!r.ok) {
                      toast.error(r.erro);
                      return;
                    }
                    toast.success(t("Validation désactivée."));
                    window.location.reload();
                  });
                }}
              >
                {mexendo ? t("Désactivation…") : t("Désactiver")}
              </Button>
            )}
          </div>
        ) : (
          <Button size="sm" onClick={() => setAtivando(true)}>
            {t("Activer")}
          </Button>
        )}
      </Card>

      {podeExigirDaEquipe ? (
        <Card className="space-y-3 p-6">
          <h2 className="text-sm font-semibold">{t("L’exiger des administrateurs")}</h2>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={empresaExige}
              disabled={mexendo}
              onChange={(e) => {
                const marcar = e.target.checked;
                startMexer(async () => {
                  const r = await definirExigenciaDeMfa(marcar);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  toast.success(
                    marcar
                      ? t("Les administrateurs doivent désormais utiliser la validation.")
                      : t("La validation n’est plus obligatoire."),
                  );
                  window.location.reload();
                });
              }}
            />
            <span>
              {t(
                "Chaque administrateur de cette entreprise doit configurer la validation en deux étapes.",
              )}
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(
                  "Lorsqu’elle est activée, les administrateurs voient un écran demandant la configuration avant d’utiliser le système. Activez-la si votre équipe traite des données clients : cela peut faire la différence entre une alerte et une fuite après la compromission d’un mot de passe.",
                )}
              </span>
            </span>
          </label>
        </Card>
      ) : null}

      <Card className="space-y-3 p-6">
        <h2 className="text-sm font-semibold">{t("Codes de récupération")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("À utiliser si vous perdez l’accès à l’application d’authentification. Chaque code ne peut servir qu’une seule fois.")}
        </p>
        {codes ? (
          <RecoveryCodesPanel codes={codes} onAcknowledge={() => setCodes(null)} />
        ) : (
          <Button variant="outline" disabled={!mfaEnrolled || isPending} onClick={handleRegenerate}>
            {isPending ? t("Génération…") : t("Régénérer les codes de récupération")}
          </Button>
        )}
        {!mfaEnrolled && (
          <p className="text-xs text-muted-foreground">
            {t("Activez la MFA avant de générer des codes.")}
          </p>
        )}
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
