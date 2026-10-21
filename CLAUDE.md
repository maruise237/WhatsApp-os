# CLAUDE.md — WhatsApp OS

Instructions pour toute session (humaine ou IA) qui travaille dans ce dépôt.
Projet : CRM de vente sur WhatsApp avec assistant IA, pour les commerçants
d'Afrique francophone (FCFA, Africa/Douala, +237). Vue d'ensemble : [README.md](README.md).
Cahier des charges du MVP : [`docs/specs/`](docs/specs/) (constitution, spec, plan, tâches).

## Pile

- **Next.js 16** (App Router) + React 19 + TypeScript strict + Tailwind + shadcn/ui.
- **Neon** : Postgres 17, **Neon Auth** (Better Auth managé), **Data API** (PostgREST + RLS).
- Clients base : `lib/db/server.ts` (session, RLS), `lib/db/admin.ts` (connexion
  directe, **sans RLS**), `lib/db/browser.ts`. Type commun : `DbClient` (`lib/db/client.ts`).
- Temps réel : SSE `GET /api/v1/realtime/stream` (pas de websocket tiers).
- Fichiers : SeaweedFS S3 privé (`lib/neon/storage-adapter.ts`).
- WhatsApp : Evolution Go via `services/whatsapp-gateway` ; WAHA optionnel (profil compose).
- IA : DeepSeek, clé de la plateforme (`DEEPSEEK_API_KEY`). Aucun nom de fournisseur
  ni de modèle dans l'interface.
- File d'événements : table `event_log` + worker (`workers/agent-worker`) + `scheduler`.
- Validation Zod de toute entrée externe (corps, webhooks, env : `lib/env.ts`).

## Règles non négociables

### Multi-organisation
- Toute table métier a `organization_id uuid not null` + RLS (`fn_user_org_ids()`).
- Le client admin contourne la RLS : tout handler qui l'utilise **filtre
  `organization_id` lui-même**, tiré d'une source de confiance (session, jeton
  signé, secret de webhook), **jamais du corps de la requête**.
- Fonction `security definer` appelable par une session : elle vérifie elle-même
  l'appartenance de l'appelant (`auth.uid()` + rôle dans l'organisation).

### Base de données
- Schéma : `db/migrations/NNNN_nom.sql`, **idempotent**, une ligne dans
  `db/migrations/MANIFEST.md`. Appliqué par `scripts/db-migrate.mjs` (au démarrage
  du conteneur app). Ne jamais modifier une migration publiée : en ajouter une.
- Nouvelle fonction dans `public` : `revoke execute … from public, anon;` puis
  `grant execute … to` seulement qui en a besoin.
- Jamais de `grant all on all tables … to anon`.
- Un trigger Postgres ne fait **jamais** d'appel réseau : il écrit dans `event_log`.
- Types texte + `check`, pas d'enum. Argent en `_cents` + `currency` (ISO-4217, XAF par défaut).

### API `/api/v1/`
- JSON snake_case ; réponses via `ok()` / `fail()` (`lib/api/wrappers.ts`), codes
  d'erreur dans `lib/api/errors.ts`.
- Clé d'API jamais en query string ; jetons stockés hachés (SHA-256).
- Toute mutation réussie écrit une ligne d'audit (`api_audit_log`, append-only).

### Auth
- Côté serveur : `getUser()`, jamais `getSession()`.
- Rôles dans l'organisation : `viewer` < `agent` < `manager` < `admin` ;
  propriétaire de l'installation : `platform_admins`.

### WhatsApp
- Idempotence des messages : `unique (organization_id, external_id)` + gestion du `23505`.
- Anti-blocage : rythme d'envoi et plage horaire par numéro (réglables).
- Groupes (`@g.us`) : pas de rattachement CRM.
- Désinscription (STOP) : `lib/opt-out/deteccao.ts`, même règle à l'ingestion et pour l'assistant.

### Langue
- Tout texte visible, message d'erreur, log et prompt IA : **en français**.
- Nouveau code : commentaires en français.

### Interdits
`console.log` en code fusionné (utiliser `lib/logger`), `getSession()` côté serveur,
service admin sans filtre d'organisation, appel réseau dans un trigger, secret en
clair en base, fournisseur ou modèle d'IA nommé dans l'interface.

## Commandes

```bash
pnpm typecheck && pnpm lint && pnpm test:unit   # avant chaque commit
pnpm test:db      # schéma + invariants (RLS, droits) sur base jetable — obligatoire si le schéma ou les droits changent
bash scripts/local-stack/up.sh                  # pile locale complète (voir son README)
```

## Déploiement

Dokploy, fichier `docker-compose.dokploy.yml`, images publiées par le CI sur GHCR
(`publish-image.yml`). Rien n'est construit sur le serveur du client. Procédure :
[README.md](README.md#déployer-sur-dokploy) ; mesures et migration : [`docs/stack-dokploy.md`](docs/stack-dokploy.md).

## Définition de « terminé »

1. typecheck, lint, test:unit verts ; test:db vert si schéma/droits touchés.
2. Changement de schéma = nouvelle migration idempotente + ligne MANIFEST.
3. Écran ou parcours modifié : vérifié dans un navigateur (Playwright) sur la pile locale.
4. Variable d'environnement nouvelle : `.env.example` + `lib/env.ts` + défaut qui ne casse rien.
5. Textes en français ; README mis à jour si le déploiement change.
