import { isEmailConfigured } from "@/lib/email/resend";
import { InviteTeamForm } from "./_form";

export const dynamic = "force-dynamic";

export default function InviteTeamPage() {
  const emailReady = isEmailConfigured();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Qui travaille avec lui</h2>
        <p className="text-sm text-muted-foreground">
          Votre assistant ne travaille pas seul : lorsqu’il transmet une conversation, l’une de ces
          personnes prend le relais.
        </p>
      </header>
      {!emailReady ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Cette installation n’envoie pas encore d’e-mails.</p>
          {/*
            A frase anterior dizia que os convites ficariam "registrados
            localmente" — e isso é falso: não existe tabela de convites, o
            convite É o link assinado. Quem confiasse na frase iria procurar
            depois uma lista de pendentes que nunca existiu. E o nome da
            variável de ambiente não ajuda quem só quer chamar um colega.
          */}
          <p className="mt-1">
            Vous recevrez un lien pour chaque personne et pourrez l’envoyer par le canal de votre
            choix — WhatsApp, e-mail ou autre. Le lien constitue l’invitation : la personne qui
            l’ouvre rejoint votre entreprise.
          </p>
        </div>
      ) : null}
      <InviteTeamForm />
    </div>
  );
}
