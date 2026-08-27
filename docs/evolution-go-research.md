# Vérification Evolution Go — 2026-08-26

La source officielle [Evolution Go](https://github.com/evolution-foundation/evolution-go) indique une API REST Go avec les endpoints principaux `POST /instance/create`, `GET /instance/{name}/qrcode`, `POST /message/sendText`, `POST /message/sendMedia`, `GET /instance/{name}/status` et `DELETE /instance/{name}`. La configuration utilise une `GLOBAL_API_KEY`, PostgreSQL pour l’état et une intégration optionnelle MinIO/S3 pour les médias.

La documentation des instances confirme qu’un `instanceName` est unique dans une installation Evolution, qu’il porte une connexion WhatsApp isolée et que l’API expose les états `open`, `connecting` et `close`, ainsi que QR, restart, logout et delete. Notre champ `channel_sessions.evolution_instance_name` peut donc être la référence globale de l’instance, avec l’unicité cross-tenant déjà prévue par la migration 0176.

La documentation des webhooks confirme le besoin d’un webhook temps réel plutôt que d’un polling : les événements utiles sont `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `CONNECTION_UPDATE` et `QRCODE_UPDATED`. Le payload contient `event`, `instance` et `data`; une réception entrante porte notamment `data.key.remoteJid`, `data.key.fromMe`, `data.key.id`, `data.message` et `data.messageTimestamp`. Evolution recommande un accusé HTTP rapide, la gestion idempotente par identifiant de message et le filtrage des événements à fort volume.

Décision d’implémentation : le CRM ne parlera jamais directement à Evolution Go depuis l’interface. Le gateway interne vérifiera le bearer interne, résoudra `instance → organization_id` dans `channel_sessions`, traduira les appels neutres du seam vers les endpoints Evolution Go, et transmettra les webhooks vers le worker via `event_log` après idempotence. La documentation Evolution API classique est utilisée uniquement pour le contrat REST confirmé ; l’image officielle Evolution Go et ses variables devront être configurées explicitement dans le Compose de déploiement.

Références :

- https://github.com/evolution-foundation/evolution-go
- https://evolutionapi-evolution-api-90.mintlify.app/concepts/instances
- https://evolutionapi-evolution-api-90.mintlify.app/concepts/webhooks

## Vérification supplémentaire de sécurité webhook

La documentation publique Evolution Go décrit le webhook HTTP POST, ses retries et ses headers `Content-Type`, sans définir de signature HMAC du corps dans le contrat consulté. Elle montre également un système de headers personnalisés, tandis que la documentation de la famille Evolution API décrit un bearer statique ou un JWT lorsque le champ `jwt_key` est pris en charge, mais cela ne constitue pas une preuve que l’image Evolution Go utilisée par ce dépôt signe chaque payload.[3] [4] [5]

Décision de sûreté : ne pas fabriquer un header `sha256=...` que le provider ne génère pas. Le gateway conserve donc le contrôle bearer configuré comme garde d’authentification provisoire, journalise l’événement après résolution `instance → organization_id` et idempotence, et laisse C-003 bloquée jusqu’à une confirmation upstream d’un format HMAC ou d’un mécanisme signé équivalent. La prochaine implémentation devra lire le corps brut avant parsing et comparer la signature avec `timingSafeEqual`.

Références supplémentaires :

- [3] https://github.com/evolution-foundation/evolution-go — dépôt et documentation officielle Evolution Go.
- [4] https://github.com/evolution-foundation/evolution-go/blob/main/docs/wiki/recursos-avancados/events-system.md — système d’événements Evolution Go, webhook et headers documentés.
- [5] https://evolutionapi-evolution-api-90.mintlify.app/events/webhooks — documentation Evolution API sur headers personnalisés, bearer et JWT ; utilisée comme comparaison, pas comme preuve Evolution Go.
