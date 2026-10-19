# Stack légère (Dokploy) — ce qui a changé et comment migrer

Fichier concerné : `docker-compose.dokploy.yml`. Garde-fou : `tests/unit/stack-legere-dokploy.test.ts`.

## Mesures (même machine, mêmes images, aucun numéro WhatsApp connecté)

| | Avant | Après |
|---|---|---|
| Conteneurs lancés | 14 | **7** |
| RAM au repos | ~807 Mo | **~312 Mo** |
| Plafond mémoire | aucun | chaque service plafonné (1,76 Go cumulés au maximum) |
| Image du worker | 2,2 Go | **351 Mo** |
| RAM du worker | 197 Mo | **89 Mo** |

Pour refaire la mesure sur votre VPS :

```bash
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
```

WAHA, à lui seul, prenait 260 Mo à vide et monte vers ~900 Mo avec des sessions
ouvertes. C'était le plus gros poste, et il tournait **en plus** d'Evolution Go.

## Ce qui a changé

1. **Un seul moteur WhatsApp par défaut : Evolution Go.** WAHA passe derrière le
   profil `waha` ; ne l'activez que si des numéros y sont encore connectés.
2. **Un seul Postgres pour Evolution Go** (`evolution-db`), qui héberge ses deux
   bases `evo_auth` et `evo_users`, réglé pour une petite charge. Avant : deux
   conteneurs `postgres:15` complets.
3. **SeaweedFS en un conteneur** (`weed server`). Avant : master, volume, filer
   et S3 séparés, et le filer **sans volume**, si bien que l'index des fichiers
   était perdu à chaque recréation du conteneur. L'ancien nom réseau
   `seaweedfs-s3` reste disponible comme alias.
4. **Redis + srh optionnels** (profil `redis`). Sur une seule VPS, le rate-limit
   et le debounce du RAG ont un repli en mémoire. Si Redis est configuré mais
   injoignable, les deux basculent désormais en mémoire au lieu d'échouer.
5. **Worker compilé** (`scripts/build-worker.mjs`) : un seul fichier JS exécuté
   par `node`, sans `tsx` ni les devDependencies.
6. **Gateway publié par le CI** (`ghcr.io/maruise237/whatsapp-gateway`) au lieu
   d'être construit sur la VPS à chaque déploiement.
7. **Plafond mémoire sur chaque service**, et tas V8 borné pour l'app
   (`APP_NODE_OPTIONS`) et le worker (`WORKER_NODE_OPTIONS`). Le worker traite 4
   tours d'agent en parallèle par défaut (`QUEUE_MAX_CONCURRENCY`, 8 avant).

## Migrer une installation Dokploy existante

**Avant de redéployer**, sauvegardez ce que l'ancienne stack contient.

### 1. Sessions Evolution Go (sinon : rescanner le QR)

Les deux bases d'Evolution Go étaient dans deux conteneurs. Exportez-les tant
qu'ils tournent encore :

```bash
P=<nom-du-projet-compose>   # docker ps | grep evolution-postgres
docker exec ${P}-evolution-postgres-auth-1  pg_dump -U evolution -Fc evo_auth  > evo_auth.dump
docker exec ${P}-evolution-postgres-users-1 pg_dump -U evolution -Fc evo_users > evo_users.dump
```

Après le redéploiement, avant de reconnecter les numéros :

```bash
docker compose -f docker-compose.dokploy.yml stop evolution-go
for db in evo_auth evo_users; do
  docker exec -i ${P}-evolution-db-1 pg_restore -U evolution -d $db --clean --if-exists < $db.dump
done
docker compose -f docker-compose.dokploy.yml start evolution-go
```

Sans cette étape, les numéros sont simplement à rescanner une fois.

### 2. Variables d'environnement Dokploy

- **Si vous n'utilisez plus WAHA :** supprimez `WAHA_API_BASE_URL`. Une URL vers
  un WAHA absent fait passer `/api/v1/health` en `unhealthy` (503).
- **Si vous n'activez pas Redis :** supprimez `UPSTASH_REDIS_REST_URL` et
  `UPSTASH_REDIS_REST_TOKEN` (repli en mémoire, sans aucune requête perdue).
- Pour garder l'un ou l'autre : `COMPOSE_PROFILES=waha`, `COMPOSE_PROFILES=redis`
  ou `COMPOSE_PROFILES=waha,redis`.
- `EVOLUTION_GO_POSTGRES_PASSWORD` reste la seule variable de base Evolution à
  renseigner.

### 3. Image du gateway

Le premier déploiement après la fusion sur `main` attend que le CI publie
`ghcr.io/maruise237/whatsapp-gateway:main`. Si le paquet GHCR est **privé**, la
VPS doit être connectée au registre (`docker login ghcr.io`), ou rendez le paquet
public dans GitHub → Packages → Package settings. En dernier recours, le `build:`
du service reste en secours.

### 4. Nettoyage (une fois tout vérifié)

Les anciens volumes restent déclarés pour qu'aucun déploiement ne les supprime.
Une fois la migration validée :

```bash
docker volume rm ${P}_evolution-postgres-auth-data-v2 ${P}_evolution-postgres-users-data-v2 ${P}_seaweedfs-volume-data
```

Les médias de l'ancien SeaweedFS ne sont pas récupérables proprement : l'index
du filer n'était pas persisté. Les preuves de paiement déjà approuvées restent en
base, seule l'image d'origine peut manquer.

## Vérifier après déploiement

```bash
docker compose -f docker-compose.dokploy.yml ps            # 7 services, healthy
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
curl -s -o /dev/null -w '%{http_code}\n' https://<domaine>/login   # 200
```
