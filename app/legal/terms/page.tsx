import type { Metadata } from "next";

import { nomeDoOperador, resolverOperador } from "@/lib/legal/operador";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Conditions d’utilisation" };

export default async function TermsPage() {
  const op = await resolverOperador();
  const operador = nomeDoOperador(op);

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Conditions d’utilisation</h1>
        <p className="text-muted-foreground">
          Les règles d’utilisation de cette installation de {op.sistema}.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">1. Qui est qui</h2>
        <p>
          {op.sistema} est un logiciel open source installé et exploité par{" "}
          <strong>{operador}</strong>
          {op.cnpj ? ` (CNPJ ${op.cnpj})` : ""}, ci-après <strong>l’exploitant</strong>. C’est l’exploitant qui maintient ce serveur, décide de l’usage du système et répond des données traitées ici.
        </p>
        <p>
          Les auteurs et mainteneurs du logiciel n’exploitent pas cette installation, n’ont accès ni à ce serveur ni aux données qui y sont stockées, et ne sont pas partie à la relation entre l’exploitant et vous. Toute demande concernant l’usage, la facturation, le support ou les données doit être adressée à l’exploitant.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">2. Ce que fait le système</h2>
        <p>
          {op.sistema} organise le service client et les ventes : il reçoit et envoie des messages via les canaux connectés par l’exploitant, enregistre les contacts et les affaires, et permet à des agents d’intelligence artificielle de servir aux côtés de personnes, selon les règles configurées par l’exploitant.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">3. Votre compte</h2>
        <p>
          L’accès est personnel. Vous êtes responsable de garder votre mot de passe secret et de ce qui est fait avec votre compte. Avertissez immédiatement l’exploitant si vous soupçonnez un accès non autorisé.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">4. Usage acceptable</h2>
        <p>En utilisant ce système, vous vous engagez à ne pas :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>envoyer de messages non sollicités en masse, ni contourner les demandes de désinscription ;</li>
          <li>utiliser les données des clients à une autre fin que celle qui les a fait naître ;</li>
          <li>tenter d’accéder aux données d’une autre organisation hébergée sur cette installation ;</li>
          <li>enfreindre les conditions des services connectés, comme les règles de la plateforme de messagerie.</li>
        </ul>
        <p>
          Le système respecte les demandes d’arrêt envoyées par les clients : quiconque demande à ne plus recevoir de messages est automatiquement bloqué pour les envois.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">5. Contenus et données</h2>
        <p>
          Les données saisies ici — contacts, conversations, affaires, fichiers — appartiennent à l’exploitant et aux personnes qu’elles concernent. Leur traitement est décrit dans la{" "}
          <a className="underline underline-offset-2" href="/legal/privacy">
            Politique de confidentialité
          </a>
          .
        </p>
        <p>
          Les réponses générées par l’intelligence artificielle peuvent contenir des erreurs. Elles ne remplacent pas une vérification humaine pour les décisions qui impliquent un prix, un délai, la santé, un crédit ou une obligation légale.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">6. Disponibilité et garanties</h2>
        <p>
          Ce système tourne sur le serveur de l’exploitant et dépend de services tiers pour fonctionner. Le logiciel est distribué &ldquo;tel quel&rdquo;, sans garantie de fonctionnement ininterrompu ni d’adéquation à un usage particulier. Les interruptions, défaillances de tiers et pertes de données dues à des causes hors du contrôle de l’exploitant n’ouvrent pas droit à indemnisation, sauf lorsque la loi l’impose.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">7. Résiliation</h2>
        <p>
          L’exploitant peut suspendre ou clôturer votre accès en cas de non-respect des présentes conditions. Vous pouvez demander la clôture de votre compte à tout moment. La clôture de l’accès n’efface pas automatiquement les historiques d’échanges, qui suivent les règles de conservation décrites dans la Politique de confidentialité.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">8. Modifications</h2>
        <p>
          L’exploitant peut mettre à jour ces conditions. Les changements importants doivent être communiqués avant d’entrer en vigueur.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">9. Contact</h2>
        <p>
          Contacter l’exploitant
          {op.dpoEmail ? (
            <>
              :{" "}
              <a className="underline underline-offset-2" href={`mailto:${op.dpoEmail}`}>
                {op.dpoEmail}
              </a>
            </>
          ) : (
            " par les canaux d’assistance de l’organisation elle-même"
          )}
          .
        </p>
      </section>
    </>
  );
}
