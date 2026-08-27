# Inventaire de migration Supabase vers Neon — WhatsApp-os

## Constat de départ

Le projet n’a pas encore de données métier à préserver. Une installation propre Neon est donc possible sans `pg_dump`, `pg_restore` ni réplication logique. Le risque principal est désormais la compatibilité du code et non la conservation des lignes existantes.

## Dépendances runtime identifiées

Le dépôt utilise actuellement `@supabase/ssr` et `@supabase/supabase-js`. Les routes serveur et actions d’authentification appellent `supabase.auth.getUser()`, `getSession()`, `signInWithPassword()`, `signUp()`, `verifyOtp()`, `resetPasswordForEmail()` et `updateUser()`. La MFA, les codes de récupération, les invitations d’équipe et la confirmation d’e-mail font partie du parcours existant.

Le projet utilise aussi Supabase Realtime pour invalider ou diffuser des événements dans le dashboard, l’inbox, les alertes et les handoffs. Les références détectées comprennent des channels, des événements de type `postgres_changes` et des broadcasts.

Le stockage Supabase est appelé depuis de nombreux workers et routes pour les médias WhatsApp, les avatars, les logos, les sources de connaissance, les assets d’agents et les exports LGPD. Les opérations incluent `upload`, `download`, `remove` et `createSignedUrl`. Le projet possède déjà une implémentation SeaweedFS S3 pour le Sales OS, mais la migration de tous les buckets historiques demande une abstraction commune et des tests de rétention.

Le SQL utilise fortement `auth.uid()`, `auth.users`, des références à `storage.objects`, des politiques RLS et des fonctions SECURITY DEFINER. Les invariants multi-tenant, les fonctions RPC de commandes et le contrôle humain des paiements doivent rester au niveau de la base.

## Conséquence pour Neon

Neon peut couvrir le PostgreSQL, le RLS par JWT/Data API, l’authentification Managed Better Auth, l’Object Storage S3, le branching et certaines fonctions WebSocket/SSE. Toutefois, Managed Better Auth est documenté comme Beta et ne prend pas en charge l’authentification téléphone/SMS/WhatsApp. Le code existant dépend également de MFA et de flux Supabase spécifiques ; ces flux ne doivent pas être considérés comme compatibles sans preuve d’implémentation.

Le Data API Neon utilise `auth.user_id()` et le claim JWT `sub`, alors que le SQL actuel utilise `auth.uid()` et des objets du schéma `auth` Supabase. Une migration propre devra donc soit fournir des fonctions/compatibilité SQL Neon, soit réécrire les politiques et fonctions pour le modèle d’identité Neon.

Neon Object Storage pourrait remplacer SeaweedFS via S3, mais il est actuellement documenté en Beta, limité à AWS `us-east-2` et soumis à des limites de stockage. Pour un déploiement Dokploy/VPS, SeaweedFS reste cohérent avec la constitution et doit être conservé dans la première migration.

Neon Functions peuvent héberger WebSockets/SSE, mais Neon précise qu’elles ne sont pas un moteur de jobs de fond. Le worker, les retries, les quotas et le pacing du Sales OS doivent donc rester sur Dokploy avec Valkey/Redis ou un orchestrateur dédié.

## Trajectoire recommandée sans données

1. Créer un projet Neon vierge dans une région compatible et une branche de test.
2. Décider explicitement entre Managed Better Auth et un Auth autonome ; ne pas basculer l’authentification production sans valider MFA, invitations et récupération de compte.
3. Adapter d’abord la connexion serveur PostgreSQL et les migrations métier vers Neon.
4. Reproduire les rôles, fonctions, schéma `auth` de compatibilité et politiques RLS, puis exécuter les tests cross-tenant.
5. Maintenir SeaweedFS pour les médias et Valkey pour les événements, quotas et retries.
6. Remplacer Realtime uniquement après avoir validé un canal WebSocket/SSE équivalent pour inbox, alertes, assignations et handoffs.
7. Déployer cette variante sur une branche Dokploy séparée ou un environnement staging, puis effectuer la bascule de production.

## Sources officielles Neon

- https://neon.com/docs/auth/migrate/from-supabase
- https://neon.com/docs/auth/overview
- https://neon.com/docs/data-api/get-started
- https://neon.com/docs/guides/rls-tutorial
- https://neon.com/docs/storage/overview
- https://neon.com/docs/compute/functions/overview
- https://neon.com/docs/compute/functions/reference/runtime-limits
- https://neon.com/docs/import/migrate-from-supabase
- https://neon.com/docs/ai/neon-mcp-server
