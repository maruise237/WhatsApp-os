# Recherche Neon vs Supabase — 27 août 2026

## Résumé vérifié

Neon propose désormais une plateforme backend composée de **Lakebase Postgres**, **Managed Better Auth**, **Neon Data API**, **Object Storage**, **Neon Functions** et **AI Gateway**.[1] Le Data API expose PostgreSQL par HTTPS et s’appuie sur des JWT et des politiques PostgreSQL RLS.[2] Neon propose donc davantage qu’une simple base PostgreSQL, mais plusieurs composants sont encore indiqués comme **Beta** et leurs régions ou limites doivent être vérifiées avant production.

## Authentification

Managed Better Auth stocke les utilisateurs, sessions et paramètres OAuth dans le schéma `neon_auth` du projet Neon. L’état d’authentification est branché avec les branches Neon.[3] La migration depuis Supabase documentée par Neon remplace `@supabase/supabase-js` par `@neondatabase/neon-js` et annonce une API Auth compatible pour la plupart des opérations courantes.[4]

Limites documentées à prendre en compte : les utilisateurs Supabase existants avec mot de passe ne peuvent pas être transférés tels quels à cause de différences de hachage ; les utilisateurs doivent recréer leur compte ou passer par OAuth. Managed Better Auth ne prend pas en charge `signInWithPhone()`/l’authentification téléphone SMS/WhatsApp, SAML SSO ou Web3. La vérification d’e-mail et le comportement de `updateUser()` nécessitent également une adaptation.[4] Managed Better Auth est actuellement en Beta et disponible dans les régions AWS, pas dans Azure.[3]

## PostgreSQL, Data API et RLS

Neon Data API est activé au niveau d’une branche pour une base donnée. Il accepte un fournisseur JWT, notamment Managed Better Auth ou un fournisseur externe, et permet d’utiliser RLS PostgreSQL. Les politiques peuvent utiliser `auth.user_id()` à partir du claim JWT `sub`.[2] Neon recommande de rafraîchir le cache de schéma après les modifications.[2]

Le modèle Sales OS peut conserver ses invariants SQL, ses RPC transactionnelles, ses contraintes, ses index et son RLS, mais les appels Supabase SSR/PostgREST et les fonctions spécifiques telles que `auth.uid()`, `auth.users` et les rôles Supabase devront être adaptés ou recréés. Le remplacement direct de l’URL Supabase par une URL Neon n’est pas suffisant.

## Stockage des médias

Neon Object Storage est compatible S3, permet les buckets privés ou publics et fournit des URLs présignées. Le stockage est isolé par branche et partage le système de credentials Neon.[5] Pendant la Beta, il est limité à la région AWS `us-east-2`, avec une limite annoncée de 5 Go sur le plan Free et de 5 Gio par objet.[5]

Le projet WhatsApp-os possède déjà un client SeaweedFS S3 privé, avec isolation stricte par `organization_id` et URLs signées. La migration vers Neon Object Storage serait techniquement possible grâce à la compatibilité S3, mais elle introduirait une dépendance Beta/régionale et nécessiterait une nouvelle validation des politiques de rétention LGPD et de l’isolation tenant. SeaweedFS reste le choix cohérent avec la constitution actuelle et l’objectif VPS/self-host.

## Realtime, WebSockets et traitements longs

Neon Functions peuvent héberger des API, webhooks, agents, WebSockets et SSE, avec une exécution longue et une proximité régionale avec PostgreSQL.[6] Elles restent néanmoins un modèle request/response : Neon documente qu’elles ne sont pas un moteur natif de jobs de fond avec file, retries et annulation. Pour ces tâches, Neon recommande une file ou un orchestrateur tiers comme QStash ou Inngest.[6]

Les limites documentées des Functions incluent un délai maximal de 15 minutes avant le premier octet, un heartbeat de 15 minutes pour les flux silencieux, une éviction possible lorsqu’une fonction est inactive et une limite par défaut d’environ 100 invocations concurrentes par compte.[7] Cela ne constitue donc pas un remplacement direct de Supabase Realtime ni du worker/event_log/Valkey du Sales OS ; il faudrait implémenter WebSocket/SSE et conserver une vraie file de jobs.

## Migration de données

Neon documente une migration Supabase par `pg_dump`/`pg_restore` avec les options `--no-owner` et `--no-acl`, car Supabase lie la propriété et les ACL à son système d’authentification.[8] Pour minimiser l’arrêt, Neon documente aussi la réplication logique : publication côté Supabase, abonnement côté Neon, connexion IPv4 directe Supabase et autorisation des IP NAT Neon.[9]

Les schémas `auth` et `storage` doivent être traités séparément si l’on veut les exporter, car ils contiennent des objets liés aux services Supabase. Pour le Sales OS, la migration doit commencer par une branche Neon de test, la restauration du schéma et des données métier, puis la vérification de l’isolation inter-tenant, des RPC de commande, de la réservation du stock et de l’approbation humaine obligatoire du paiement.

## MCP et CLI Neon

Neon propose un serveur MCP officiel hébergé à `https://mcp.neon.tech/mcp`, ainsi qu’un CLI. Le MCP peut être restreint en lecture seule par `?readonly=true`, limité à un projet par `?projectId=...` et filtré par catégories.[10] Neon recommande explicitement le MCP pour le développement et les tests, pas pour une connexion directe à des bases de production. Le MCP local stdio historique est indiqué comme obsolète au profit du serveur hébergé Streamable HTTP.[10]

## Conclusion pour WhatsApp-os

La meilleure trajectoire n’est pas une bascule immédiate complète, mais une migration par étapes :

1. Créer un projet Neon dans une région compatible et une branche de test.
2. Restaurer le schéma métier avec `--no-owner --no-acl` ou utiliser une réplication logique contrôlée.
3. Remplacer progressivement les accès PostgreSQL directs par `DATABASE_URL` Neon côté serveur, sans exposer de clé privilégiée au navigateur.
4. Conserver temporairement Supabase Auth et Realtime, ou tester séparément Managed Better Auth avec des utilisateurs neufs.
5. Conserver SeaweedFS pour les médias et Valkey pour la coordination, les quotas et les retries.
6. Ne basculer la production qu’après des tests d’isolation tenant, Auth, Realtime, commandes et paiement.

## Références

[1]: https://neon.com/docs/introduction "Neon documentation — plateforme backend"
[2]: https://neon.com/docs/data-api/get-started "Neon Data API — démarrage, JWT et RLS"
[3]: https://neon.com/docs/auth/overview "Neon Managed Better Auth — vue d’ensemble"
[4]: https://neon.com/docs/auth/migrate/from-supabase "Neon — migration depuis Supabase"
[5]: https://neon.com/docs/storage/overview "Neon Object Storage — vue d’ensemble"
[6]: https://neon.com/docs/compute/functions/overview "Neon Functions — vue d’ensemble"
[7]: https://neon.com/docs/compute/functions/reference/runtime-limits "Neon Functions — limites runtime"
[8]: https://neon.com/docs/import/migrate-from-supabase "Neon — migration de données depuis Supabase"
[9]: https://neon.com/docs/guides/logical-replication-supabase-to-neon "Neon — réplication logique Supabase vers Neon"
[10]: https://neon.com/docs/ai/neon-mcp-server "Neon MCP Server — accès, restrictions et sécurité"


## Précision supplémentaire vérifiée

Neon Data API n’a pas de système de permission séparé : les droits reposent sur les `GRANT` PostgreSQL et les politiques RLS.[11] Le rôle PostgreSQL est sélectionné à partir du claim `role` du JWT ; les rôles standards sont `authenticated` et `anonymous`, et des rôles personnalisés peuvent être utilisés si le rôle existe dans la base.[11] Le Data API est actuellement documenté comme Beta.[11] La configuration d’un fournisseur d’authentification externe se fait par une URL JWKS et un éventuel `audience` JWT ; Neon valide ensuite le JWT et applique le RLS à partir du claim `sub` via `auth.user_id()`.[12]

Ces éléments imposent de traiter séparément le JWT d’utilisateur et le JWT d’administration. Un simple remplacement du `SUPABASE_SERVICE_ROLE_KEY` par une clé arbitraire Neon ne serait pas sûr ni fonctionnel. Le template de configuration doit donc distinguer `NEON_SERVICE_ROLE_JWT`, utilisé uniquement côté serveur, des URLs publiques Auth/Data API.

[11]: https://neon.com/docs/data-api/access-control "Neon Data API — access control & security"
[12]: https://neon.com/docs/data-api/custom-authentication-providers "Neon Data API — custom authentication providers"
