"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { connectNuvemshop } from "@/app/actions/integrations/connectNuvemshop";
import {
  skipNuvemshop,
  markNuvemshopConfigured,
} from "@/app/actions/onboarding/skipWhatsapp";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";

export function ConnectNuvemshopClient() {
  const [pending, startTransition] = useTransition();
  // Por PROP do servidor, nunca `branding()`: no navegador aquela função lê
  // `window.__PUBLIC_ENV__` (a marca do BANCO) e no SSR lê `process.env` (só o
  // `.env`). Renderizar o nome a partir dela faz o texto do servidor divergir do
  // hidratado — hydration mismatch. Ver `lib/branding/contexto.tsx`.
  const marca = useMarcaDaInstalacao();

  return (
    <div className="space-y-4 rounded-lg border bg-background p-6">
      <p className="text-sm">
        En cliquant sur <strong>Connecter</strong>, vous serez redirigé pour autoriser
        {marca.name} sur votre compte Nuvemshop.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await connectNuvemshop();
              if (res && !res.ok) {
                if (res.error === "not_configured") {
                  toast.message("Nuvemshop n’est pas encore configuré dans cet environnement.", {
                    description: "Passez cette étape pour l’instant et configurez-la plus tard dans Intégrations.",
                  });
                } else {
                  toast.error(`Erreur : ${res.error}`);
                }
              }
            })
          }
        >
          Connecter
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(() => void markNuvemshopConfigured())}
        >
          C’est connecté
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => void skipNuvemshop())}
        >
          Passer pour l’instant
        </Button>
      </div>
    </div>
  );
}
