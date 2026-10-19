import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { Stepper } from "./_components/Stepper";
import { SkipToEnd } from "./_components/SkipToEnd";
import { branding } from "@/lib/branding";
import { passosVisiveis } from "@/lib/onboarding/passos";
import { env } from "@/lib/env";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");

  const { state, onboardedAt } = await loadOnboardingState(activeOrg.orgId);
  if (onboardedAt) redirect("/app/inbox");

  // Os passos que ESTA instalação oferece, com o que já foi resolvido. O
  // indicador não decide mais nada sozinho — ele desenha o que recebe.
  const passos = passosVisiveis({ lojaLigada: env.NUVEMSHOP_ENABLED }).map((p) => ({
    segmento: p.segmento,
    rotulo: p.rotulo,
    cumprido: p.cumprido(state),
  }));

  const isDev = process.env.NODE_ENV !== "production";

  return (
    // `data-onboarding` : les règles mobiles de globals.css (pages à plat,
    // boutons collés en bas) ne s'appliquent qu'ici.
    <div data-onboarding className="flex min-h-screen flex-col bg-background sm:bg-muted/40">
      {/*
        Téléphone : l'en-tête mesurait ~320 px sur 844 (marque, nom, six ronds,
        libellé) avant le premier mot de l'étape. Ici ~90 px, collé en haut pour
        que « où j'en suis » reste visible pendant qu'on fait défiler.
      */}
      <header className="sticky top-0 z-20 border-b bg-background sm:static">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-1 pt-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:block">{branding().name}</p>
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{activeOrg.name}</h1>
          </div>
          {isDev ? <SkipToEnd /> : null}
        </div>
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 sm:pb-2">
          <Stepper passos={passos} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-5 sm:py-8">{children}</main>
    </div>
  );
}
