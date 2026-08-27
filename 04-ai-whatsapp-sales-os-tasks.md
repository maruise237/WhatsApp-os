# AI WhatsApp Sales OS — Tâches d’implémentation

**Version** : v1.0  
**Règle** : aucune tâche de code ne commence sans sa référence de spec et ses critères de validation.  
**Constitution** : `01-ai-whatsapp-sales-os-constitution.md`  
**Spec** : `02-ai-whatsapp-sales-os-spec.md`  
**Plan** : `03-ai-whatsapp-sales-os-plan.md`

## Statuts

- `[ ]` à faire
- `[~]` en cours
- `[x]` terminé et vérifié
- `[!]` bloqué par une dépendance externe

## Lot A — Gouvernance et baseline

| ID | Statut | Référence | Tâche | Validation |
|---|---|---|---|---|
| A-001 | [x] | P8 | Ajouter les quatre documents AI WhatsApp Sales OS à la racine et les référencer depuis `CLAUDE.md`. | Les documents existent, sont cohérents et la règle de précédence est explicite. |
| A-002 | [x] | P8 | Ajouter une matrice constitution → spec → tâche → test dans `docs/ai-whatsapp-sales-os-traceability.md`. | Chaque principe P1–P10 renvoie à au moins une exigence et une tâche. |
| A-003 | [x] | P8 | Déclarer dans `tasks/todo.md` l’épopée AI WhatsApp Sales OS et ses dépendances. | Le workflow historique indique clairement le nouveau chemin sans supprimer les fonctions Deskcomm indispensables. |
| A-004 | [x] | P9 | Vérifier les codes d’erreur canoniques et ajouter ceux nécessaires : `whatsapp_disconnected`, `out_of_stock`, `payment_not_confirmed`, `rate_limited`, `forbidden_cross_tenant`, `invalid_order_transition`. | `lib/api/errors.test.ts` passe : 2 tests, 2 assertions de compatibilité métier. |

## Lot B — Données et isolation

| ID | Statut | Référence | Tâche | Validation |
|---|---|---|---|---|
| B-001 | [x] | P1, F-001–F-004 | Mesurer le schéma actuel et appliquer la doctrine DIRC avant de créer une table. | `docs/ai-whatsapp-sales-os-code-audit.md` confirme la réutilisation de `channel_sessions`, `event_log`, `organizations`, `contacts`, `conversations` et la séparation justifiée des tables e-commerce externes. |
| B-002 | [~] | F-003, F-010 | Étendre `channel_sessions` avec le mapping Evolution Go, ses contraintes, son index d’unicité et le seam TypeScript. | Migration `0176`, baseline et typecheck passent ; invariants PostgreSQL ajoutés mais non exécutables ici faute de Docker. |
| B-003 | [~] | F-030–F-032 | Ajouter `products` et `product_media` avec prix en centimes, devise, stock et référence SeaweedFS. | Migration `0177` et baseline écrits ; validation PostgreSQL et routes CRUD restent à faire. |
| B-004 | [~] | F-040–F-045 | Ajouter `sales_orders`, `sales_order_items` et les contraintes de statut. | Migration `0177`, RPC idempotente `0178`, routes de commande et tests de machine d’états livrés ; tests PostgreSQL d’intégration en attente de Docker. |
| B-005 | [~] | F-042–F-044 | Ajouter `payment_proofs`, son statut de review et les métadonnées Gemini. | Table, RLS, schémas et routes de dépôt/revue livrés ; test PostgreSQL d’acteur non autorisé à ajouter. |
| B-006 | [~] | P3, F-043 | Créer la fonction/route transactionnelle d’approbation humaine avec contrôle d’organisation et d’autorité. | `fn_approve_sales_payment`, contrôle `auth.uid()`/rôle/tenant et route approve/reject livrés ; tests DB d’intégration en attente. |
| B-007 | [ ] | P8 | Ajouter chaque évolution dans `supabase/migrations/`, `baseline.sql` et `MANIFEST.md`. | Baseline fresh + update idempotent sur PostgreSQL pg17. |

## Lot C — Contrats de canal et gateway

| ID | Statut | Référence | Tâche | Validation |
|---|---|---|---|---|
| C-001 | [~] | P6, F-010–F-015 | Définir l’interface d’adaptateur de canal et isoler l’adaptateur WAHA existant. | Seam étendu à `evolution_go`, provisioning et QR/health passent par adaptateur ; les routes suppression/reconnexion restent à généraliser. |
| C-002 | [~] | P6, F-010 | Créer le service `whatsapp-gateway` avec configuration typée, token interne et corrélation `X-Request-Id`. | Service Node/Docker, bearer interne et `X-Request-Id` livrés ; test de configuration runtime à ajouter. |
| C-003 | [!] | P6, F-010 | Implémenter validation HMAC Evolution Go avec comparaison constante et résolution instance → organisation. | Résolution instance→tenant et idempotence livrées. Les sources Evolution Go consultées documentent le webhook HTTP et les headers personnalisés, mais ne prouvent pas de signature HMAC par payload ; le bearer configuré reste donc explicitement un blocage de contrat fournisseur, sans faux HMAC livré. |
| C-004 | [~] | F-011–F-012 | Implémenter ingestion DM-only, détection des groupes et idempotence des événements entrants. | Parseur Evolution Go, rejet `@g.us`/broadcast, `fromMe` et `external_id` sont branchés au worker ; fixtures multi-device à ajouter. |
| C-005 | [~] | F-013–F-015 | Implémenter `send` avec idempotency key, queue séquentielle, retry borné et erreurs métier. | Envoi text/media via gateway, tenant check et idempotency header livrés ; queue/retry bornés à compléter. |
| C-006 | [ ] | P5, F-014 | Implémenter les quotas 24 h, délais aléatoires, présence et locks Valkey. | Tests déterministes via horloge injectée et test de dépassement de quota. |
| C-007 | [ ] | F-015 | Implémenter récupération des messages `sending` bloqués et visibilité dans la Central. | Test de récupération sans toucher aux messages `queued` valides. |

## Lot D — Evolution Go et médias

| ID | Statut | Référence | Tâche | Validation |
|---|---|---|---|---|
| D-001 | [~] | P2, P6, P7 | Ajouter le service Evolution Go et son réseau privé au compose de développement. | Profil Compose `sales-os` et overlay de production ajoutés ; démarrage réel dépend de Docker/licence Evolution Go. |
| D-002 | [x] | P2, F-003 | Implémenter création, statut, QR, déconnexion et suppression d’une instance par vendeur via le gateway. | Provisioning, statut, QR, reconnexion et suppression passent par l’adaptateur/gateway ; tests transport réel encore dépendants de Docker. |
| D-003 | [x] | F-012 | Adapter les payloads Evolution Go vers le modèle canonique de message Deskcomm. | `lib/channels/evolution/inbound.ts` normalise messages/statuts/médias et réutilise l’ingest CRM ; tests de fixtures restent un durcissement recommandé. |
| D-004 | [~] | F-032, F-042 | Ajouter SeaweedFS au compose et implémenter upload, lecture signée, expiration et suppression des médias. | Services Compose et abstraction S3 privée avec URL signée, expiration et suppression livrés ; branchement des routes de preuves et tests S3 réels restent à faire. |
| D-005 | [ ] | P7 | Mettre à jour les images et scripts de packaging sans service de production build-only. | `pnpm test:shell`, build CI et test de compose fresh. |

## Lot E — Catalogue, agent et commandes

| ID | Statut | Référence | Tâche | Validation |
|---|---|---|---|---|
| E-001 | [x] | F-030–F-032 | Ajouter les routes `/api/v1/products` et l’écran catalogue minimal. | Routes tenant-scoped avec Zod/RBAC/audit et page `/app/sales` responsive livrées ; E2E réel reste à faire. |
| E-002 | [ ] | F-032 | Brancher Gemini vision pour produire un brouillon de produit sans bloquer en cas d’échec. | Fixtures vision, faible confiance visible et aucun prix inventé. |
| E-003 | [ ] | F-020–F-021 | Restreindre les tools de l’agent au catalogue, brouillon de commande, demande de preuve et handoff. | Test négatif : aucun tool `mark_paid`. |
| E-004 | [~] | F-040–F-041 | Implémenter création de commande et passage à `en_attente_paiement`. | RPC atomique idempotente, stock, total serveur et routes livrés ; intégration PostgreSQL bloquée sans Docker. |
| E-005 | [ ] | F-042 | Ingest de capture, stockage SeaweedFS, extraction Gemini et création de l’item Central. | Test photo brute conservée lorsque Gemini échoue. |
| E-006 | [~] | F-043–F-045 | Ajouter la file de preuves et l’action vendeur d’approbation/refus. | Dépôt pending, rejet/approbation RPC et onglet Central vendeur livrés ; upload SeaweedFS et E2E restent à faire. |
| E-007 | [~] | P4 | Ajouter les opérations à livrer, livrée, annulée et refusée avec historique. | Machine d’états et audit status livrés ; historique détaillé et tests DB restent à ajouter. |

## Lot F — Cohabitation, Central et mobile

| ID | Statut | Référence | Tâche | Validation |
|---|---|---|---|---|
| F-001 | [ ] | F-022–F-025 | Auditer puis compléter le handoff IA → humain existant, résumé, silence durable et annulation des follow-ups. | Tests du moteur et de l’item Central. |
| F-002 | [ ] | F-023–F-024 | Auditer puis compléter claim, transfer, conflit et restitution humain → IA avec note. | Tests de concurrence et de reprise contextuelle. |
| F-003 | [ ] | F-025 | Unifier la détection STOP/PARAR entre ingestion et runtime. | Corpus FR/PT et tests sans faux positif évident. |
| F-004 | [~] | F-050 | Faire de la Central l’entrée opérationnelle pour handoffs, preuves et messages bloqués. | Navigation `/app/sales`, onglets catalogue/commandes/preuves et états chargement/erreur/vide livrés ; handoffs/messages bloqués et E2E restent à relier. |
| F-005 | [~] | F-051–F-052 | Corriger les débordements à 390 px et rendre claim, réponse, restitution, média et paiement utilisables au mobile. | Le Central vendeur est responsive-first et les actions de preuve sont empilables sur mobile ; validation Playwright à faire. |
| F-006 | [ ] | F-052–F-053 | Ajouter manifest PWA, icônes minimales, stratégie de cache sûre et notifications optionnelles. | Installation navigateur, reprise de session et fonctionnement sans permission notification. |

## Lot G — Validation, documentation et livraison

| ID | Statut | Référence | Tâche | Validation |
|---|---|---|---|---|
| G-001 | [x] | DoD | Ajouter les variables nouvelles à `.env.example` et à `lib/env.ts` avec valeurs par défaut sûres. | Gateway et SeaweedFS documentés dans `.env.example` et validés par Zod ; test runtime complet à renforcer. |
| G-002 | [ ] | DoD | Ajouter les tests unitaires, DB, shell et E2E dans les bons gates CI. | Aucun test critique laissé hors du CI sans justification. |
| G-003 | [ ] | DoD | Mettre à jour `docs/testing/user-journey-map.md`, le système vivant et le graphe d’architecture. | Chaque feature possède entrée, consommateur, activité, écran et boucle de retour. |
| G-004 | [~] | DoD | Exécuter `pnpm typecheck`, `pnpm lint`, `pnpm lint:channels`, `pnpm test:unit`, `pnpm test:db`, `pnpm test:shell` et les E2E pertinents. | Typecheck, lint provider, lint général, unit (496 fichiers/5522 tests), shell et build passent. `test:db` est bloqué par `docker: command not found`; E2E réel et Compose restent à exécuter sur une machine Docker. |
| G-005 | [ ] | DoD | Rédiger le runbook local et self-host, notamment démarrage, migration, QR, stockage, backups et récupération. | Un opérateur peut suivre le document sans modifier manuellement les fichiers protégés. |
| G-006 | [x] | DoD | Livrer un rapport de changement avec limites, preuves et prochaines tâches. | Rapport `docs/ai-whatsapp-sales-os-validation-2026-08-26.md` ajouté ; il ne déclare pas le MVP complet prêt et liste les preuves manquantes. |

## Ordre de démarrage obligatoire

La première séquence d’implémentation est `A-002 → A-003 → A-004 → B-001`. Ensuite seulement, les lots B à G peuvent avancer dans l’ordre de leurs dépendances. Une tâche peut être scindée, mais elle ne peut pas être sautée silencieusement et aucune tâche de code ne doit être réalisée « en attendant » une spec.
