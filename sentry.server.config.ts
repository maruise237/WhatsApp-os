// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { resolveSentryDsn } from "./lib/sentry/dsn";
import { sentryScrubHooks } from "./lib/sentry/scrub";

const sentryDsn = resolveSentryDsn(process.env.SENTRY_DSN);

Sentry.init({
  dsn: sentryDsn,

  // Échantillon léger : 10 % des requêtes tracées, pour ne pas charger le serveur.
  tracesSampleRate: 0.1,
  enableLogs: true,
  sendDefaultPii: false,

  ...sentryScrubHooks,
});

// Une ligne au démarrage : ce qui est actif et comment le changer.
if (!sentryDsn) {
  console.info("[télémétrie] Désactivée — aucune erreur n'est envoyée (SENTRY_DSN vide).");
} else {
  console.info("[télémétrie] Erreurs envoyées au Sentry configuré dans SENTRY_DSN.");
}
