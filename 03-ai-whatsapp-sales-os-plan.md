# AI WhatsApp Sales OS — Plan d’architecture et d’implémentation

**Version** : v1.0  
**Base** : DeskcommCRM cloné sur `main`  
**Constitution** : `01-ai-whatsapp-sales-os-constitution.md`  
**Spécification** : `02-ai-whatsapp-sales-os-spec.md`

## 1. Décision d’adaptation

Le projet part du dépôt DeskcommCRM existant afin de conserver les éléments déjà solides et indispensables : authentification Supabase, RLS, inbox temps réel à trois panneaux, historique des conversations, handoff humain/IA, Central vendeur, workers fondés sur `event_log`, audit, règles d’opt-out, tests d’isolation et packaging self-host.

Le remplacement se fait par étapes, sans réécriture générale : WAHA est isolé derrière une interface de canal puis remplacé par un service `whatsapp-gateway` ; le dashboard et l’agent ne parlent jamais directement à Evolution Go ; le stockage de médias sort de Supabase Storage vers SeaweedFS ; le rate limit et la file d’envoi sortent de Redis/Upstash vers Valkey ; PostgreSQL/Supabase self-host reste le socle d’authentification, RLS et Realtime au lancement.

## 2. Topologie Docker Compose cible

| Service | Responsabilité | Accès autorisé |
|---|---|---|
| `app` | Next.js, dashboard vendeur, API versionnée, auth et lecture métier | PostgreSQL/Supabase, Realtime, Valkey, SeaweedFS via clients internes ; jamais Evolution Go |
| `worker` | Consommation `event_log`, agent IA, extraction Gemini, orchestration des handoffs | PostgreSQL/Supabase, Valkey, SeaweedFS, gateway interne |
| `scheduler` | Déclenchement des drains, récupération des messages bloqués et tâches bornées | Endpoint interne de l’app ou worker, sans accès public |
| `whatsapp-gateway` | Proxy unique, validation HMAC, mapping instance/tenant, queue, pacing, retries, émission | Evolution Go, PostgreSQL/Supabase pour métadonnées minimales, Valkey, SeaweedFS |
| `evolution-go` | Connexions WhatsApp, une instance par vendeur | Réseau Docker privé ; jamais exposé au dashboard |
| `supabase-db` | PostgreSQL, migrations, RLS et fonctions transactionnelles | Réseau Docker privé |
| `supabase-auth` / `supabase-realtime` | Auth et mise à jour live de l’inbox | App et navigateur via URLs publiques nécessaires |
| `valkey` | Quotas, idempotence courte, file d’envoi, locks de claim | Gateway et workers |
| `seaweedfs` | Médias produits et preuves de paiement | Gateway, worker et app via URLs signées |

Le compose de production ne doit pas devenir `build`-only pour un nouveau service. Toute image produite pour le self-host doit être publiée par le CI ou déclarer une stratégie de build documentée compatible avec la doctrine de packaging.

## 3. Flux principaux

### 3.1 Message entrant DM

1. Evolution Go reçoit le message et appelle uniquement le webhook du gateway.
2. Le gateway vérifie HMAC, `X-Request-Id`, l’instance et le caractère DM.
3. Le gateway déduit `organization_id` depuis la table de mapping, jamais depuis le body reçu.
4. Le message et son identifiant externe sont insérés de manière idempotente.
5. Une ligne `event_log` est émise ; aucun trigger SQL ne fait d’HTTP.
6. Le worker consomme l’événement, vérifie le propriétaire du fil et exécute l’agent borné.
7. Toute sortie textuelle ou média passe par `whatsapp-gateway.send`.
8. Le gateway applique quota, délai, lock d’idempotence et appelle Evolution Go.
9. L’inbox reçoit la nouvelle activité via Supabase Realtime ou son mécanisme de revalidation existant.

### 3.2 Handoff humain

Le moteur de conversation conserve l’assignation de première classe déjà présente dans DeskcommCRM. Un handoff force `assignee_kind=user`, remplit `bot_silenced_until` à une valeur durable, annule les follow-ups automatiques concernés et crée un `agent_inbox_item` avec résumé, motif et prochain pas. Un claim concurrent est protégé par transaction et vérification d’assignation.

La restitution est une action explicite du vendeur. Elle exige une note structurée, efface le silence durable et repasse le fil à l’IA. La note est visible dans la timeline et sert de contexte au prochain tour.

### 3.3 Preuve de paiement

Le média entrant est téléchargé par le gateway ou l’app autorisée puis stocké dans SeaweedFS. PostgreSQL ne conserve que la clé, le type MIME, la taille, les métadonnées d’extraction et les liens métier. Gemini peut remplir `amount_cents`, `reference`, `operator` et `confidence`, mais la preuve demeure `pending`.

Une action vendeur appelle une fonction ou route transactionnelle tenant-scoped. Elle vérifie le statut précédent, le propriétaire de la commande et l’autorité de l’acteur avant de passer `en_attente_paiement` à `payée`. Aucun outil d’agent, cron, webhook ou traitement de vision ne possède cette capacité.

## 4. Données et migrations

Les nouvelles tables doivent porter `organization_id`, une clé primaire UUID et des index tenant-first. Le modèle minimal cible est le suivant :

| Table | Champs métier essentiels | Contraintes |
|---|---|---|
| `whatsapp_instances` | `organization_id`, `evolution_instance_name`, `phone_number`, `status`, réglages anti-ban | unique organisation et unique instance |
| `products` | titre, description, prix en centimes, devise, stock, actif | stock non négatif, tenant-scoped |
| `product_media` | produit, clé SeaweedFS, MIME, métadonnées | pas de bytes en base |
| `sales_orders` | conversation, client, statut, total, devise, timestamps | transitions contrôlées |
| `sales_order_items` | commande, produit, quantité, prix unitaire | snapshot du prix au moment de la commande |
| `payment_proofs` | commande, média, statut de review, extraction Gemini | `pending`, `approved`, `rejected` |
| `gateway_events` | organisation, instance, `external_id`, payload normalisé, statut | idempotence organisation + externe |

Les conversations, messages, assignations, handoffs, `agent_inbox_items`, audit et tables de tenant existants sont réutilisés lorsqu’ils satisfont la spécification. Toute duplication doit être justifiée selon la doctrine DIRC.

Chaque évolution du schéma suit le triptyque obligatoire : migration dans `supabase/migrations/`, ap­pendice idempotent dans `supabase/baseline.sql`, entrée dans `supabase/migrations/MANIFEST.md`. Les fonctions `security definer` révoquent l’exécution à `public` et `anon` puis accordent uniquement le rôle nécessaire.

## 5. Contrats internes

Le gateway expose un contrat interne versionné, non public :

- `POST /internal/v1/webhooks/evolution/:instance` pour l’entrée signée ;
- `POST /internal/v1/send` pour l’envoi idempotent ;
- `POST /internal/v1/instances/:instance/qr` pour demander un QR ;
- `GET /internal/v1/instances/:instance/status` pour l’état de connexion ;
- `POST /internal/v1/media/fetch` pour rapatrier un média entrant.

Les requêtes internes portent un token de service dans un header, un `Idempotency-Key`, un `X-Request-Id` et un payload validé par Zod côté app ou par le schéma Go côté gateway. Aucune clé Evolution Go ne figure dans le navigateur, dans les logs ou dans les variables publiques Next.js.

## 6. Anti-ban et fiabilité

Les valeurs par défaut sont appliquées à la création de chaque instance : présence contrôlée, statut de lecture configuré, rejet d’appels, quota quotidien, délai aléatoire et file séquentielle. Valkey fournit les verrous et compteurs à courte durée ; le gateway reste l’unique endroit qui décide si un message sort.

Les opérations d’envoi sont idempotentes. Un retry ne réutilise pas aveuglément un appel ambigu : l’état local est vérifié, l’`outbound_id` est conservé et les messages bloqués sont exposés dans la Central. Le système préfère une erreur visible à un double envoi.

## 7. Plan de migration par lots

| Lot | Résultat | Risque principal | Preuve requise |
|---|---|---|---|
| A | Spécifications, contrats, matrice et tests de non-régression | Divergence entre constitution et code | revue documentaire et tests existants |
| B | Modèle catalogue/commandes/preuves + RLS | fuite cross-tenant ou transition de paiement incorrecte | `test:db`, invariants, tests de transition |
| C | Abstraction de canal et gateway en mode local | double envoi ou secret exposé | tests HMAC, idempotence, receiver local |
| D | Evolution Go et remplacement des appels WAHA | incompatibilité payload/médias | tests d’intégration et environnement Docker |
| E | SeaweedFS et Valkey | médias perdus ou quotas incohérents | tests de stockage, reprise, rate limit |
| F | Surfaces vendeur, Central et PWA | parcours mobile incomplet | E2E à 390 px, captures et états d’erreur |
| G | Packaging et runbook | installation fraîche non reproductible | test shell, build des images, compose fresh |

## 8. Stratégie de compatibilité

Pendant la migration, les adaptateurs de canal doivent permettre aux tests et à l’inbox existants de fonctionner sans dupliquer la logique métier. Le code WAHA est conservé uniquement derrière un adaptateur transitoire clairement marqué, puis supprimé lorsque le gateway Evolution Go couvre les tests d’entrée, d’envoi, de média, de groupe, de multi-device et de reprise.

Aucun changement ne doit supprimer la cohabitation humain/IA, l’audit, l’opt-out, la Central, l’isolation RLS, les médias ou la reprise mobile au motif que ces fonctions ne figurent pas dans les trois gestes vendeur. Elles constituent les garde-fous qui rendent ces trois gestes sûrs et opérables.
