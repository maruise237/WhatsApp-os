"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";
import type { ItemDoResumo } from "@/lib/onboarding/passos";
import type { PecaDoSistema } from "@/lib/onboarding/o-que-mais-existe";
import { useT } from "@/hooks/i18n/useT";

export function DoneClient({ itens, pecas }: { itens: ItemDoResumo[]; pecas: PecaDoSistema[] }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const pendentes = itens.filter((i) => !i.feito);
  // Sans numéro, l'assistant ne parle à personne : le dire, plutôt que
  // « déjà opérationnel » (constaté à l'écran avec le numéro ignoré).
  const semNumero = itens.some((i) => i.segmento === "connect-whatsapp" && !i.feito);

  return (
    <div className="space-y-6 rounded-lg border bg-background p-6">
      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          {semNumero ? "Presque prêt" : t("Tout est prêt !")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {pendentes.length === 0
            ? t("Votre assistant est prêt. Il ne vous reste plus qu’à suivre son activité.")
            : semNumero
              ? "Votre assistant est créé, mais il ne répondra à vos clients qu’une fois le numéro WhatsApp connecté (Menu › Connexions)."
              : t("Votre assistant est déjà opérationnel. Les éléments reportés vous attendent toujours.")}
        </p>
      </div>

      <ul className="mx-auto max-w-sm space-y-2 text-left text-sm">
        {itens.map((it) => (
          <li key={it.segmento} className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                "inline-block h-2 w-2 rounded-full " +
                (it.feito ? "bg-emerald-500" : "bg-muted-foreground/30")
              }
            />
            <span className={it.feito ? "" : "text-muted-foreground"}>
              {t(it.rotulo)}
              {/*
                "Pulado" é escolha da pessoa; "ainda não" é o que ela não
                chegou a fazer. Antes tudo que não estivesse feito virava
                "(pulado)", inclusive passo que a instalação nunca ofereceu —
                o wizard cobrando o que ninguém pediu.
              */}
              {it.pulado ? t(" (vous avez ignoré cette étape)") : it.feito ? "" : t(" (pas encore)")}
            </span>
          </li>
        ))}
      </ul>

      {/*
        O wizard acabava aqui, com um botão que entregava a pessoa numa caixa de
        conversas vazia. Ela tinha acabado de montar um funcionário e não fazia
        ideia de que existe um lugar onde ele pede ajuda, outro que mostra quem
        esfriou, outro onde ele propõe as próprias melhorias. Descobrir isso
        ficava por conta da curiosidade — e quase ninguém volta para explorar
        menu.
      */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">{t("Que trouve-t-on d’autre ici ?")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Vous n’avez rien à modifier maintenant. Cette section vous présente simplement les fonctionnalités disponibles.")}
          </p>
        </div>
        {/*
          Cada peça abre e mostra COMO funciona, em passos. Uma frase basta para
          dizer que a peça existe; não basta para o follow-up, que é a peça mais
          técnica do produto e a que mais assusta pelo nome — quem lê "volta a
          falar com quem sumiu" sem saber que o retorno PARA quando o cliente
          responde imagina um robô perseguindo cliente, e desliga justamente o
          que mais recupera venda.

          Fechado por padrão: quem acabou de montar o funcionário não precisa ler
          seis tutoriais agora. O que ele precisa é saber que a explicação existe
          e está a um clique.
        */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {pecas.map((p) => (
            <li key={p.href} className="rounded-md border p-3">
              <a href={p.href} className="text-sm font-medium underline-offset-2 hover:underline">
                {t(p.comoChamar)}
              </a>
              <span className="ml-1 text-xs text-muted-foreground">({t(p.label)})</span>
              <p className="mt-1 text-xs text-muted-foreground">{t(p.porQue)}</p>

              <details className="group mt-2">
                <summary className="cursor-pointer list-none text-xs text-muted-foreground underline underline-offset-2">
                  {t("Comment ça fonctionne")}
                </summary>
                <ol className="mt-2 space-y-1.5">
                  {p.comoFunciona.map((passo, i) => (
                    <li key={passo} className="flex gap-2 text-xs text-muted-foreground">
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]"
                      >
                        {i + 1}
                      </span>
                      <span>{t(passo)}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <div className="onb-acoes flex justify-center">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await finishOnboarding();
              if (res && !res.ok) toast.error(`${t("Échec")}: ${res.error}`);
            })
          }
        >
          {pending ? t("Finalisation…") : t("Commencer à utiliser")}
        </Button>
      </div>
    </div>
  );
}
