# Migration Neon de WhatsApp OS

Cette arborescence contient la baseline PostgreSQL destinée à une **branche Neon neuve**. Aucune donnée historique n’est migrée : le dépôt ne contient pas de données de production et la baseline doit donc être appliquée comme une installation initiale.

## Prérequis obligatoires

Le projet Neon doit être créé dans une configuration AWS compatible avec les fonctionnalités retenues. Avant d’appliquer SQL, il faut activer **Managed Better Auth** et **Neon Data API**, configurer le domaine de confiance et le CORS de l’application, puis vérifier que le schéma `neon_auth` expose `neon_auth.user(id)`. Les JWT Neon doivent contenir un `sub` UUID et les rôles Data API doivent être accordés selon les politiques RLS.

Le stockage binaire n’est pas stocké dans PostgreSQL. La stack Dokploy conserve SeaweedFS S3 privé pour `whatsapp-media`, `ai-policy`, `skill-assets`, `lgpd-exports` et `brand-logos`. Les tables gardent uniquement les clés d’objet. Le gateway WhatsApp ne reçoit que les variables explicitement nécessaires à Evolution Go, SeaweedFS et l’API Data Neon ; il ne reçoit plus un `.env` global.

## Application de la baseline

Utiliser une branche Neon de test et une connexion DDL admin dédiée dans `NEON_DATABASE_ADMIN_URL`. Appliquer `neon/migrations/0001_whatsapp_os_baseline.sql` avec `psql` ou un outil de migration contrôlé, puis vérifier les erreurs et les politiques RLS. Ne pas appliquer `supabase/baseline.sql` directement : ce fichier historique contient des statements Supabase Storage et une publication `supabase_realtime` qui ne font pas partie du transport Neon retenu.

```sh
psql "$NEON_DATABASE_ADMIN_URL" \
  --set ON_ERROR_STOP=1 \
  --file neon/migrations/0001_whatsapp_os_baseline.sql
```

Après l’application, exécuter les contrôles de `neon/tests/invariants.sql` sur une branche disposable. Aucun test destructif ne doit être lancé sur la branche de production.

## Transport Realtime

Neon ne reçoit pas de publication `supabase_realtime` dans cette migration. Les abonnements de l’interface passent par `GET /api/v1/realtime/stream`, avec cookie d’authentification Neon et requêtes tenant-scoped via le Data API. Le flux est borné par la session HTTP, émet des heartbeats et déclenche une nouvelle lecture lorsqu’une signature de lignes change. Le worker `event_log` et Valkey/Redis restent les mécanismes durables de queue et de coordination ; un flux SSE ne les remplace pas.

## Limites à lever avant production

Les fonctionnalités Neon Auth avancées — MFA/TOTP, recovery codes, invitations, administration des utilisateurs et Realtime natif — doivent être testées contre le projet Neon réel. Une méthode non validée doit échouer explicitement ; elle ne doit jamais retourner un succès silencieux. Les routes qui utilisent SeaweedFS doivent être testées avec un bucket privé et une URL signée courte.
