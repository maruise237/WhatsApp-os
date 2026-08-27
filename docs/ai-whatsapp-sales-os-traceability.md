# AI WhatsApp Sales OS — Matrice de traçabilité

Cette matrice relie la constitution aux exigences de `02-ai-whatsapp-sales-os-spec.md`, aux tâches de `04-ai-whatsapp-sales-os-tasks.md` et aux preuves attendues. Elle constitue le point de contrôle minimal avant toute déclaration de livraison.

| Principe | Exigences principales | Tâches | Preuves attendues |
|---|---|---|---|
| P1 — Isolation par vendeur | F-001 à F-004, F-030 à F-045 | B-001 à B-007, G-002 | RLS, filtres service-role, tests négatifs entre deux organisations |
| P2 — Un numéro = une instance = un vendeur | F-003, F-010, F-011 | B-002, C-003, D-002 | Unicité mapping, contrôle instance inconnue, cycle QR/statut |
| P3 — Paiement semi-humain | F-042 à F-045 | B-005, B-006, E-005, E-006 | Aucun tool IA de paiement, approbation vendeur atomique, tests d’autorisation |
| P4 — Commande officielle après paiement | F-040 à F-045 | B-004, B-006, E-004, E-006, E-007 | Machine à états, transitions interdites, audit de l’acteur |
| P5 — Anti-ban par défaut | F-014, F-015 | C-005, C-006, C-007 | Quota, jitter, lock, retry sans double envoi, message bloqué visible |
| P6 — Proxy unique Evolution Go | F-010 à F-015 | C-001 à C-005, D-001 à D-003 | App/worker sans secret Evolution, HMAC, receiver local et test de chemin unique |
| P7 — Docker Compose, zéro Cloudflare/AWS | Architecture §2, F-015 | D-001, D-004, D-005, G-005 | Compose fresh, images publiables, runbook et test shell |
| P8 — Spec-driven | Ensemble | A-001 à A-003, G-003, G-006 | Documents normatifs, tâches référencées, rapport de livraison |
| P9 — Erreurs typées | F-004, F-015, F-044 | A-004, C-005, G-001 | Codes métier, wrapper API, `X-Request-Id`, absence de stack côté client |
| P10 — Trois gestes vendeur | Périmètre §1, F-050 à F-052 | E-001 à E-007, F-004 à F-006 | Central orientée actions, reprise mobile et absence de CRM récurrent superflu |
| Cohabitation humain/IA | F-020 à F-025 | F-001 à F-003 | Claim, silence durable, restitution avec note, STOP, Central |
| Reprise mobile | F-050 à F-053 | F-004 à F-006 | E2E à 390 px, PWA, session persistante et parcours paiement au mobile |

## Règles d’utilisation

Une tâche de code ne peut être marquée terminée que si la colonne « preuves attendues » est satisfaite par un test, un artefact ou une mesure concrète. Une fonctionnalité qui modifie le schéma ajoute simultanément migration, baseline et invariant. Une fonctionnalité qui modifie un flux visible ajoute une preuve frontend, pas uniquement un test HTTP.

Les fonctions DeskcommCRM déjà livrées — inbox live, handoff, audit, RLS, opt-out, médias et Central — sont considérées comme des dépendances de sécurité et d’exploitation. Elles ne peuvent être supprimées sans une nouvelle exigence explicitement approuvée dans la constitution ou la spécification.
