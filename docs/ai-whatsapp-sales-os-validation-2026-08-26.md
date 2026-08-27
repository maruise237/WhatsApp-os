# Rapport de validation — AI WhatsApp Sales OS

**Date :** 26 août 2026  
**Dépôt :** `DeskcommCRM`  
**Branche :** `main`  
**Commit de départ :** `317adce8`

## Synthèse exécutive

L’adaptation directe de DeskcommCRM a atteint un état **techniquement cohérent et vérifié par les gates disponibles dans le sandbox**, mais elle ne doit pas être déclarée comme MVP complet prêt pour production. Les fondations Sales OS sont présentes : catalogue tenant-scoped, commandes idempotentes avec stock verrouillé, preuves de paiement, approbation humaine atomique, seam de providers avec Evolution Go derrière `whatsapp-gateway`, ingestion DM-only, stockage SeaweedFS privé, écran vendeur `/app/sales`, tests de machine d’états et protections de tenancy.

Les corrections finales de cette session ont supprimé les dernières régressions unitaires connues. Le QR WAHA legacy repasse par l’adaptateur tout en conservant le contrat historique des mocks. Le baseline ne reconstruit plus plusieurs fois les mêmes contraintes de vocabulaire. Le gate OpenRouter ne dépend plus d’un chemin coloré par Git. La varredura de privilèges `anon` couvre désormais les fonctions Sales OS ajoutées après la migration historique. Le DELETE d’un canal QR distingue à nouveau transport non configuré (`503`) et erreur upstream (`502`).

## Preuves exécutées

| Contrôle | Résultat | Preuve ou limite |
|---|---:|---|
| `pnpm typecheck` | **Vert** | TypeScript strict sans erreur. |
| `pnpm lint:channels` | **Vert** | Aucun nom de provider hors du seam `lib/channels`. |
| `pnpm lint` | **Vert** | 0 erreur ; 264 avertissements historiques/non bloquants. |
| `pnpm test:unit` | **Vert** | 496 fichiers, 5 522 tests réussis. |
| Tests ciblés QR/branding/documentation/i18n/numéro observé | **Vert** | 5 fichiers, 91 tests réussis. |
| `pnpm test:shell` | **Vert** | Installation self-host simulée, packaging, isolation crontab et flux proxy validés. |
| `pnpm build` | **Vert** | Build Next.js de production terminé ; route `/app/sales` et APIs Sales OS présentes dans l’inventaire. |
| `pnpm test:db` | **Bloqué** | `docker: command not found` dans le sandbox ; aucune conclusion PostgreSQL ne doit être extrapolée. |
| Compose Evolution Go / gateway / SeaweedFS | **Non prouvé** | Docker absent ; pas de démarrage réel, bucket S3, webhook ou E2E mobile. |

## Corrections appliquées pendant cette session

Le proxy QR conserve le seam provider-neutral. Pour les sessions WAHA legacy, l’adaptateur lit les variables d’exécution au moment de l’appel et réalise le fetch d’image attendu par les tests et par le runtime historique. Le transport n’est donc pas réintroduit dans la route App Router, et les deux chemins de QR archived/official restent protégés.

Le baseline applique désormais la règle « une contrainte, un bloc final » pour `channel_sessions_provider_check`, `channel_sessions_provider_ref_check` et `webhook_events_log_provider_check`. Les blocs historiques de reconstruction ont été remplacés par des commentaires, tandis que le vocabulaire final reste dans le bloc Evolution Go final. La varredura `anon` a été déplacée après les fonctions 0177–0179 afin qu’une fonction `SECURITY DEFINER` créée par l’appendice Sales OS soit couverte dans le même run.

Le DELETE des sessions utilise désormais `adapter.codes.notConfigured` pour renvoyer `503` lorsque le provider n’est pas configuré ; une exception upstream reste `502`. Le gate OpenRouter désactive explicitement la coloration Git lors de `git grep`, évitant de tenter de lire un chemin contenant des séquences ANSI. Enfin, la fixture shell de l’installateur utilise la position réelle de la couleur après les champs déjà fournis par le `.env` de test.

## Écarts MVP restant bloquants

| Domaine | État | Conséquence |
|---|---|---|
| Validation PostgreSQL/RLS/RPC | Bloquée par Docker absent | Les contraintes, RLS, idempotences et transitions paiement doivent encore être exécutées sur PostgreSQL frais puis en ré-application. |
| Signature Evolution Go | Bloquée par contrat fournisseur | Les sources publiques consultées documentent HTTP webhook et headers personnalisés, mais ne prouvent pas une signature HMAC par payload. Le gateway conserve donc le bearer configuré et ne fabrique pas un faux HMAC. Voir `docs/evolution-go-research.md`. |
| Anti-ban Valkey | À faire | Quotas 24 h, locks distribués, queue séquentielle, jitter et retry borné ne sont pas encore une chaîne runtime prouvée. Le moteur pur de pacing existe mais n’est pas la preuve d’une coordination multi-worker Valkey. |
| Gemini catalogue/preuves | À faire | Les captures et brouillons doivent être analysés sans bloquer, avec conservation de l’original et confiance visible. Aucun chemin ne doit approuver automatiquement un paiement. |
| Tools agent Sales OS | À faire | Il faut livrer la liste blanche catalogue/brouillon/preuve/handoff et un test négatif explicite interdisant `mark_paid`. |
| Central et cohabitation | Partiel | Catalogue, commandes et preuves sont visibles dans `/app/sales`; handoffs, messages bloqués, reprise humain↔IA et silence durable doivent être reliés à cette entrée opérationnelle. |
| Mobile/PWA/E2E | Partiel | Manifest minimal et écran responsive présents ; validation réelle à 390 px, reprise de session, upload mobile et notifications restent à exécuter. |
| SeaweedFS réel | Partiel | Client S3 privé et URLs signées testés unitairement ; provisioning du bucket, identifiants et upload de preuve en Compose ne sont pas prouvés. |
| Packaging production | Partiel | L’overlay Compose existe, mais le gateway reste build-only et aucune image CI publiée n’a été vérifiée. |

## Séquence obligatoire suivante

Sur une machine disposant de Docker et de PostgreSQL pgvector 17, exécuter d’abord `pnpm test:db` sur une base fraîche puis sur la même base en mode update. Ajouter ou conserver les assertions d’isolation cross-tenant, d’unicité active des instances Evolution, de stock et d’idempotence de commande, de transition humaine `payée`, et d’interdiction de toute transition automatique vers `payée`.

Ensuite, démarrer le profil Compose `sales-os`, provisionner réellement SeaweedFS, envoyer un webhook Evolution Go représentatif, vérifier la résolution `instance → organization_id`, l’idempotence et l’ingestion DM-only, puis exécuter les scénarios mobiles à 390 px. La mise en production doit rester bloquée tant que le contrat de signature du webhook n’est pas confirmé ou remplacé par un mécanisme signé officiellement supporté.

## Références

[1]: ../01-ai-whatsapp-sales-os-constitution.md "Constitution AI WhatsApp Sales OS"
[2]: ../02-ai-whatsapp-sales-os-spec.md "Spécification EARS AI WhatsApp Sales OS"
[3]: https://github.com/evolution-foundation/evolution-go "Dépôt officiel Evolution Go"
[4]: https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/recursos-avancados/events-system.md "Système d’événements Evolution Go"
[5]: https://evolutionapi-evolution-api-90.mintlify.app/events/webhooks "Documentation Evolution API sur les webhooks et headers"
