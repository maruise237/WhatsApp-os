# Recherche Dokploy — API, CLI et MCP

## Conclusion opérationnelle

L’API REST/OpenAPI de Dokploy utilise un jeton JWT/API généré depuis la section **Settings → Profile → API/CLI**, transmis dans l’en-tête **`x-api-key`**. Le format `Authorization: Bearer ...` indiqué dans une ancienne compétence locale n’est pas le format documenté par Dokploy et retourne `401 Unauthorized` sur l’instance testée. L’URL de base doit inclure le chemin `/api`, par exemple `https://dokploy.example.com/api`.[1]

La vérification correcte est donc :

```bash
curl -fsS \
  -H 'accept: application/json' \
  -H "x-api-key: $DOKPLOY_API_TOKEN" \
  'https://dokploy.example.com/api/project.all' | jq .
```

La documentation officielle de déploiement API utilise le même header pour `project.all` et `application.deploy`.[2]

## Flux retenu

Le dépôt `https://github.com/maruise237/WhatsApp-os` est public et sa branche `main` contient le commit `2c6422693652db140fdbb39a138cfb50488159d9`. Pour un déploiement Compose, Dokploy permet de créer un service dans un environnement, de sélectionner un provider Git/GitHub, de configurer le chemin du fichier Compose, puis de déclencher le déploiement. Les variables ajoutées dans Dokploy sont écrites dans un fichier `.env`; le Compose doit cependant référencer explicitement ces variables via `${VAR}` ou `env_file` pour qu’elles entrent dans les conteneurs.[3] [4]

Le service doit utiliser des volumes nommés ou les montages Dokploy `../files` pour conserver les données. Les montages directs depuis le répertoire cloné du dépôt ne sont pas adaptés à l’AutoDeploy, car Dokploy reclone le dépôt lors des déploiements suivants.[3]

## API et MCP

Le package MCP officiel est `@dokploy/mcp`. Il utilise les variables `DOKPLOY_URL` et `DOKPLOY_API_KEY`, ce dernier correspondant au même jeton transmis en `x-api-key`. Le serveur expose les procédures Dokploy comme outils MCP, mais pour cette tâche l’appel REST direct est préférable : il est plus traçable, limite les outils disponibles et permet de redacter les champs secrets avant affichage. Le package MCP documente aussi des presets, dont `deploy`, pour réduire la surface d’outils si un client MCP est utilisé.[5]

## Règles de sécurité

Le jeton ne doit jamais être écrit dans le dépôt, dans une commande persistante, dans un fichier `.env` du projet ou dans les journaux. Les réponses Dokploy peuvent contenir des mots de passe de bases de données et des variables d’environnement : elles doivent être filtrées avant archivage. Les endpoints de lecture doivent être utilisés avant toute création, modification ou déploiement. Un déploiement ne doit commencer qu’après confirmation de l’environnement cible, du domaine, des variables obligatoires et de la stratégie de stockage.

## Références

[1]: https://docs.dokploy.com/docs/api "Dokploy API — documentation officielle"
[2]: https://docs.dokploy.com/docs/core/auto-deploy "Dokploy Auto Deploy — API method"
[3]: https://docs.dokploy.com/docs/core/docker-compose "Dokploy Docker Compose"
[4]: https://docs.dokploy.com/docs/core/providers "Dokploy Providers"
[5]: https://github.com/Dokploy/mcp "Dépôt officiel Dokploy MCP"
