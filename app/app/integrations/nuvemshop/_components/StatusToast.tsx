"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Intégration non configurée — renseignez les identifiants dans .env.local.",
  invalid_state: "La session d’autorisation a expiré. Réessayez.",
  missing_code: "Réponse de Nuvemshop incomplète — code absent.",
  token_exchange_failed: "Impossible d’échanger le code contre le jeton d’accès.",
  invalid_token_response: "Réponse inattendue de Nuvemshop.",
  network_error: "Erreur réseau lors du contact avec Nuvemshop.",
  encrypt_failed: "Échec du chiffrement du jeton. Vérifiez NUVEMSHOP_OAUTH_ENCRYPTION_KEY.",
  db_upsert_failed: "Échec de l’enregistrement de l’intégration en base de données.",
};

export function StatusToast() {
  const params = useSearchParams();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const ok = params.get("ok");
    const error = params.get("error");
    if (!ok && !error) return;
    handled.current = true;

    if (ok) {
      toast.success("Nuvemshop connectée avec succès.");
    } else if (error) {
      toast.error(ERROR_MESSAGES[error] ?? `Erreur : ${error}`);
    }

    // Strip the query params so reload doesn't replay the toast.
    router.replace("/app/integrations/nuvemshop");
  }, [params, router]);

  return null;
}
