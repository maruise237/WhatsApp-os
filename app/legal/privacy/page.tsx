import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { nomeDoOperador, resolverOperador } from "@/lib/legal/operador";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default async function PrivacyPage() {
  const op = await resolverOperador();

  // O operador publicou a política dele: é a dele que vale. Sem isto, o campo
  // `privacy_policy_url` da tela de Organização continuaria sendo um controle
  // que o produto oferece e o código ignora. A URL já vem checada — valor cru
  // do banco nunca chega a um redirect.
  if (op.politicaPropria) redirect(op.politicaPropria);

  const operador = nomeDoOperador(op);

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Politique de confidentialité</h1>
        <p className="text-muted-foreground">
          Comment cette installation de {op.sistema} trata dados pessoais.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">1. Qui est le responsable du traitement</h2>
        <p>
          Le responsable du traitement des données traitées ici est <strong>{operador}</strong>
          {op.cnpj ? ` (CNPJ ${op.cnpj})` : ""} — la personne qui a installé et exploite ce système. Les auteurs du logiciel n’ont accès ni à ce serveur ni aux données qui y sont stockées, et ne sont ni responsables ni sous-traitants de ces données.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">2. Quelles données sont traitées</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Des personnes servies :</strong> nom, téléphone, e-mail s’il est communiqué, contenu des conversations, fichiers envoyés (images, audios, documents) et historique des affaires.
          </li>
          <li>
            <strong>Des personnes qui utilisent le système :</strong> nom, e-mail, rôle d’accès et journal des actions réalisées.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">3. À quoi elles servent</h2>
        <p>
          À servir, répondre, suivre l’avancement des échanges et organiser la relation commerciale — y compris par des agents d’intelligence artificielle qui agissent selon les règles configurées par l’exploitant. Les journaux d’actions sont conservés à des fins d’audit et de sécurité.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">4. Avec qui elles sont partagées</h2>
        <p>
          Les données restent sur le serveur de l’exploitant. Pour fonctionner, le système communique avec des tiers choisis et engagés par l’exploitant :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>la plateforme de messagerie utilisée pour converser avec le client ;</li>
          <li>
            le fournisseur d’intelligence artificielle engagé par l’exploitant, qui reçoit l’extrait de conversation nécessaire pour générer la réponse ;
          </li>
          <li>le fournisseur d’infrastructure qui héberge le serveur.</li>
        </ul>
        <p>Les données ne sont ni vendues ni cédées à des fins publicitaires à des tiers.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">5. Por quanto tempo</h2>
        <p>
          Les conversations et les données commerciales sont conservées tant qu’il existe une relation avec le client ou une obligation légale de conservation. Les fichiers médias ont leur propre durée, configurée par l’exploitant. Les journaux d’audit sont conservés plus longtemps, car ils prouvent qui a fait quoi.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">6. Seus direitos</h2>
        <p>
          La réglementation sur la protection des données vous garantit le droit de savoir si vos données sont traitées, d’y accéder, de corriger des données incomplètes ou obsolètes, de demander leur anonymisation ou leur suppression, de savoir avec qui elles ont été partagées et de retirer votre consentement.
        </p>
        <p>
          Le système traite ces demandes par un circuit dédié : l’export rassemble ce qui existe sur la personne, et l’anonymisation supprime l’identification tout en préservant l’historique des échanges — c’est pourquoi elle <strong>est irréversible</strong>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">7. Sécurité</h2>
        <p>
          L’accès est contrôlé par compte, mot de passe et rôle, avec validation en deux étapes disponible pour les administrateurs. Chaque organisation hébergée ne voit que ses propres données, et les clés d’intégration sont stockées chiffrées.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">8. Délégué à la protection des données et contact</h2>
        <p>
          {op.dpoEmail ? (
            <>
              Pour exercer vos droits ou poser des questions sur la confidentialité, contactez le délégué à la protection des données :{" "}
              <a className="underline underline-offset-2" href={`mailto:${op.dpoEmail}`}>
                {op.dpoEmail}
              </a>
              .
            </>
          ) : (
            <>
              L’exploitant n’a pas encore publié d’adresse de contact du délégué à la protection des données sur cette installation. Les demandes doivent passer par les canaux de contact de l’organisation elle-même.
            </>
          )}
        </p>
      </section>
    </>
  );
}
