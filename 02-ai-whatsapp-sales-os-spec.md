# AI WhatsApp Sales OS — Spécification fonctionnelle

**Version** : v1.0  
**Statut** : base d’implémentation  
**Source normative** : `01-ai-whatsapp-sales-os-constitution.md`  
**Portée** : MVP SaaS self-hosted, adapté depuis DeskcommCRM

> Cette spécification traduit la constitution en exigences testables. En cas de conflit, la constitution prévaut.

## 1. Périmètre produit

AI WhatsApp Sales OS permet à un vendeur de connecter un numéro WhatsApp dédié, de vendre exclusivement en conversation privée, de laisser un agent IA qualifier et conduire la vente, puis de reprendre la main pour confirmer le paiement et organiser la livraison. Les groupes WhatsApp peuvent être observés pour la présence et l’acquisition, mais ils ne sont jamais utilisés pour le closing dans le MVP.

Le vendeur utilise trois opérations métier récurrentes : vérifier le solde ou la disponibilité, confirmer une commande après examen d’une preuve de paiement, et organiser la livraison. Les fonctions nécessaires à la sécurité opérationnelle restent conservées : inbox, cohabitation humain/IA, handoff bidirectionnel, file centrale d’actions, historique, médias, opt-out, audit, authentification, isolation tenant et reprise mobile.

## 2. Exigences fonctionnelles EARS

### 2.1 Tenancy, identité et sécurité

| ID | Exigence | Critère d’acceptation |
|---|---|---|
| F-001 | QUAND une requête lit ou modifie une donnée métier, LE SYSTÈME DOIT vérifier l’organisation authentifiée avant toute opération. | Deux organisations de test ne peuvent lire, modifier ou recevoir aucune donnée l’une de l’autre. |
| F-002 | QUAND un composant utilise le service role, LE SYSTÈME DOIT appliquer explicitement le filtre `organization_id` issu d’une source de confiance. | Aucun handler ne prend `organization_id` depuis le body pour définir son périmètre. |
| F-003 | QUAND un vendeur connecte un numéro, LE SYSTÈME DOIT créer une relation unique entre l’organisation, le numéro et l’instance Evolution Go. | Une instance et un numéro ne peuvent appartenir qu’à une organisation. |
| F-004 | QUAND une opération sensible échoue, LE SYSTÈME DOIT retourner un code métier, un message humain et un `X-Request-Id`, sans exposer la stack ou les secrets. | Les réponses suivent `{ error: { code, message, details? } }`. |

### 2.2 Connexion WhatsApp et gateway

| ID | Exigence | Critère d’acceptation |
|---|---|---|
| F-010 | QUAND Evolution Go reçoit un webhook, LE gateway DOIT vérifier la signature, résoudre l’instance vers l’organisation et rejeter toute résolution ambiguë. | Un webhook invalide est rejeté ; un webhook valide est journalisé avec son organisation résolue. |
| F-011 | QUAND un message entrant provient d’un groupe `@g.us`, LE SYSTÈME DOIT l’ignorer pour le flux de vente privée. | Aucun contact, conversation commerciale ou commande n’est créé depuis un groupe. |
| F-012 | QUAND un message entrant provient d’un DM, LE SYSTÈME DOIT l’enregistrer de manière idempotente et créer l’événement de traitement associé. | Un même `external_id` ne produit pas de doublon. |
| F-013 | QUAND le dashboard, l’agent ou un worker veut envoyer un message, LE SYSTÈME DOIT passer exclusivement par le gateway. | Aucun de ces composants ne connaît l’URL ou la clé Evolution Go. |
| F-014 | QUAND un envoi est demandé, LE gateway DOIT appliquer quota 24 h, délai aléatoire, présence et anti-burst avant d’appeler Evolution Go. | Les messages sont sérialisés, temporisés et les limites retournent `rate_limited` sans double envoi. |
| F-015 | QUAND Evolution Go est indisponible, LE gateway DOIT enregistrer l’échec, appliquer un retry borné avec backoff et exposer une erreur humaine. | Le message reste traçable et n’est jamais envoyé deux fois à cause d’un retry. |

### 2.3 Agent IA et cohabitation humain/IA

| ID | Exigence | Critère d’acceptation |
|---|---|---|
| F-020 | QUAND une conversation est assignée à l’IA, L’AGENT DOIT pouvoir chercher un produit, proposer une offre, ouvrir un brouillon de commande et demander une preuve de paiement. | Les tools disponibles sont bornés et testés. |
| F-021 | QUAND une conversation est assignée à un humain ou silencée, L’AGENT NE DOIT envoyer aucun message automatique. | Le silence est vérifié avant chaque génération et avant chaque envoi. |
| F-022 | QUAND le client demande un humain, présente une preuve ou déclenche une faible confiance, LE SYSTÈME DOIT créer un item dans la Central avec résumé et prochain pas. | Le vendeur voit l’item, le fil associé et le contexte exploitable. |
| F-023 | QUAND le vendeur prend la conversation, LE SYSTÈME DOIT passer l’assignation à `user`, suspendre l’agent sans échéance automatique et enregistrer l’action. | Aucun follow-up automatique ne parle par-dessus le vendeur. |
| F-024 | QUAND le vendeur rend la main à l’IA avec une note, LE SYSTÈME DOIT enregistrer la note et réactiver l’agent avec ce contexte. | La reprise est auditée et le prochain tour peut utiliser la note. |
| F-025 | QUAND le client envoie un opt-out explicite, LE SYSTÈME DOIT bloquer l’automatisation future tout en conservant le fil pour le vendeur. | `STOP`, `PARAR` et formulations explicites sont traités par une règle partagée ingestion/runtime. |

### 2.4 Catalogue et stock

| ID | Exigence | Critère d’acceptation |
|---|---|---|
| F-030 | QUAND un vendeur crée ou valide un produit, LE SYSTÈME DOIT stocker titre, prix en centimes, devise, stock, statut actif et médias. | Toutes les données portent l’organisation et sont couvertes par RLS. |
| F-031 | QUAND l’agent cherche un produit, LE SYSTÈME DOIT retourner uniquement les produits actifs et disponibles de l’organisation courante. | Un produit d’un autre tenant ou hors stock est invisible et invendable. |
| F-032 | QUAND une photo de produit est importée, LE SYSTÈME DOIT la stocker hors base puis proposer une extraction Gemini comme brouillon révisable. | Une erreur ou faible confiance Gemini ne bloque pas la validation humaine. |

### 2.5 Commandes et paiements

| ID | Exigence | Critère d’acceptation |
|---|---|---|
| F-040 | QUAND le client accepte un produit et une quantité, LE SYSTÈME DOIT créer une commande `en_cours` liée au fil privé. | Une commande est tenant-scoped et sa création est idempotente. |
| F-041 | QUAND les instructions de paiement sont envoyées, LE SYSTÈME DOIT faire passer la commande à `en_attente_paiement`. | Une commande ne saute jamais directement à `payée`. |
| F-042 | QUAND le client envoie une capture, LE SYSTÈME DOIT la stocker dans SeaweedFS et créer une preuve `pending` avec extraction Gemini optionnelle. | L’image originale reste visible au vendeur avec montant, référence et confiance si disponibles. |
| F-043 | QUAND un vendeur autorisé approuve une preuve, LE SYSTÈME DOIT passer atomiquement la commande à `payée` puis à l’étape logistique appropriée. | Aucun agent, cron, webhook ou extraction IA ne peut poser `payée`. |
| F-044 | QUAND une preuve est refusée ou illisible, LE SYSTÈME DOIT conserver l’original, marquer la preuve `rejected` ou `pending` et expliquer le prochain pas. | Le client n’obtient jamais une confirmation de paiement automatique. |
| F-045 | QUAND une commande est livrée ou annulée, LE SYSTÈME DOIT enregistrer l’acteur, l’horodatage et l’évolution dans l’historique. | Les transitions invalides sont refusées avec une erreur métier. |

### 2.6 Central vendeur et reprise mobile

| ID | Exigence | Critère d’acceptation |
|---|---|---|
| F-050 | QUAND le vendeur ouvre la Central, LE SYSTÈME DOIT afficher handoffs, preuves à confirmer et messages bloqués avec priorité, résumé et prochain pas. | La Central devient la liste d’actions du matin. |
| F-051 | QUAND le vendeur utilise un écran étroit, LE SYSTÈME DOIT permettre de lire un fil, prendre la main, répondre, rendre la main et confirmer un paiement au pouce. | Les parcours essentiels sont utilisables à partir de 390 px sans débordement critique. |
| F-052 | QUAND le vendeur revient le lendemain, LE SYSTÈME DOIT retrouver la même organisation, les mêmes fils et la même file centrale après authentification. | Aucune reconnexion WhatsApp n’est nécessaire pour reprendre le dashboard. |
| F-053 | QUAND le navigateur l’autorise, LE SYSTÈME PEUT notifier les nouveaux handoffs et preuves ; la Central reste le mécanisme obligatoire. | Le produit reste fonctionnel sans permission de notification. |

## 3. États métier

### 3.1 Commande

`en_cours → en_attente_paiement → payée → a_livrer → livree`

Les sorties `refusee` et `annulee` sont autorisées depuis les états métier compatibles. La transition `payée` est exclusivement humaine et atomique. Toute transition non définie est rejetée.

### 3.2 Assignation conversation

`ai → user` lors d’un claim, transfert ou handoff ; `user → ai` uniquement lors d’une restitution explicite accompagnée d’une note. Le silence humain est durable jusqu’à cette restitution.

## 4. Hors périmètre MVP

Les fonctionnalités suivantes ne font pas partie du quotidien vendeur du MVP : kanban CRM généraliste, Nuvemshop, marketplace de skills, MCP public, applications mobiles natives iOS/Android, closing dans les groupes et confirmation automatique de paiement.

Les fonctions existantes de DeskcommCRM restent conservées lorsqu’elles sont nécessaires à l’authentification, l’isolation, l’audit, l’historique, la cohabitation humain/IA, la gestion des médias ou le self-hosting.

## 5. Exigences de validation

Toute exigence touchant le schéma doit disposer d’une migration versionnée, d’un ajout idempotent au `supabase/baseline.sql`, d’une entrée dans `supabase/migrations/MANIFEST.md` et d’un test RLS ou invariant approprié. Toute exigence touchant l’interface doit disposer d’un test E2E par le parcours utilisateur et d’une preuve mobile lorsque le parcours est concerné.
