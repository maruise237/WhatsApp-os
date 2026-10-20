"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectNuvemshop } from "@/app/actions/integrations/connectNuvemshop";
import { disconnectNuvemshop } from "@/app/actions/integrations/disconnectNuvemshop";

const CONNECT_ERRORS: Record<string, string> = {
  auth_required: "Connectez-vous pour relier la boutique.",
  no_active_org: "Aucune organisation active.",
  forbidden: "Seuls les administrateurs peuvent connecter des intégrations.",
  not_configured: "Intégration non configurée — renseignez les identifiants dans .env.local.",
};

const DISCONNECT_ERRORS: Record<string, string> = {
  auth_required: "Connectez-vous pour déconnecter la boutique.",
  no_active_org: "Aucune organisation active.",
  forbidden: "Seuls les administrateurs peuvent déconnecter.",
  not_connected: "L’intégration n’est pas connectée.",
  db_error: "Erreur de base de données lors de la déconnexion.",
};

export function ConnectButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      onClick={() =>
        startTransition(async () => {
          const res = await connectNuvemshop();
          // Server Action redirects on success — we only get a result on failure.
          if (res && !res.ok) {
            toast.error(CONNECT_ERRORS[res.error] ?? `Erreur : ${res.error}`);
          }
        })
      }
      disabled={disabled || pending}
    >
      {pending ? "Redirection…" : "Se connecter à Nuvemshop"}
    </Button>
  );
}

export function DisconnectButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      onClick={() =>
        startTransition(async () => {
          const res = await disconnectNuvemshop();
          if (res.ok) {
            toast.success("Nuvemshop déconnectée.");
          } else {
            toast.error(DISCONNECT_ERRORS[res.error] ?? `Erreur : ${res.error}`);
          }
        })
      }
      disabled={pending}
    >
      {pending ? "Déconnexion…" : "Déconnecter"}
    </Button>
  );
}
