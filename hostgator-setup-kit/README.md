# DeskcommCRM — Kit d'installation (HostGator)

Ce kit met **DeskcommCRM** en ligne sur votre serveur VPS HostGator. Vous avez deux chemins :

> **Vous n'avez pas encore de serveur ?** Commencez par `comecar.sh` — il tourne **sur votre ordinateur**, avant
> que le VPS n'existe, et répond à la question qui bloque tout le monde au début : *que dois-je
> louer ?* Il nomme l'offre (VPS Turing, 2 vCPU / 4 Go — la Cartesius ne suffit pas pour
> WhatsApp), ouvre la page si vous le souhaitez, et vous donne la commande exacte pour votre cas. Une fois
> le VPS créé, le chemin est l'`install.sh` ci-dessous.
>
> ```bash
> bash comecar.sh
> ```

> **Autre hébergeur ?** Le kit est conçu pour HostGator (c'est le partenariat du projet et le chemin
> testé de bout en bout), mais il tourne sur n'importe quel VPS avec Docker. Si le vôtre arrive déjà avec un
> **proxy inverse propre** qui occupe les ports 80/443 — cas d'Hostinger, Coolify, Dokploy
> et CapRover —, l'installateur **le détecte tout seul** et publie le CRM à travers lui, au lieu
> d'essayer de démarrer un Caddy qui n'aurait pas sa place. Voir
> [VPS livré avec son propre proxy](#vps-livré-avec-son-propre-proxy-hostinger-coolify-dokploy).

## 🤖 Chemin facile : laissez un assistant de code le faire

1. Louez un **VPS chez HostGator** et accédez-y en SSH.
2. Déposez ce dossier (ou le `.zip`) dans le chat de votre **assistant de code** qui tourne dans le VPS.
3. Dites : *« installe DeskcommCRM pour moi »*. Il lit le `CLAUDE.md` et conduit tout —
   crée la base, génère les mots de passe, démarre le CRM et vous aide à connecter WhatsApp.

## ⚙️ Chemin manuel : une seule commande

Dans le VPS :

```bash
bash install.sh
```

> **VPS sans Docker ?** L'installateur s'en occupe. S'il ne trouve pas Docker, il **demande**
> d'abord puis l'installe via `get.docker.com` — l'installateur officiel de Docker, qui tourne en
> root, comme le prescrit leur documentation. Avec `--yes` il continue sans demander, c'est le
> contrat de ce mode. Si vous préférez l'installer vous-même, répondez `n` et lancez
> `curl -fsSL https://get.docker.com | sh` avant.

L'installateur demande ce dont il a besoin (domaine, clés de la base et du fournisseur d'IA,
e-mail/mot de passe de l'admin), génère le reste et démarre tout.

> Mode non interactif : copiez `.env.hostgator.example` (du dépôt) vers `.env`,
> remplissez-le, et lancez `bash install.sh --yes`.

## Créer la base Supabase automatiquement (optionnel)

Créer le projet dans le navigateur et copier les 4 identifiants est l'étape la plus longue de
l'installation — et la plus facile à rater (copier la *Direct connection*, qui est IPv6 uniquement et
ne se connecte pas depuis un VPS IPv4, est le piège le plus courant). Vous pouvez sauter tout cela :

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...        # supabase.com/dashboard/account/tokens
bash install.sh                             # crée le projet et poursuit l'installation
```

`install.sh` appelle le provisionnement tout seul quand il trouve le jeton et que les
identifiants sont encore vides — les 4 variables entrent dans le flux sans copier-coller.
Pour créer seulement le projet, sans installer, le script tourne aussi seul :

```bash
bash supabase-provision.sh "Nom du Projet" sa-east-1 >> .env
```

Le script crée le projet, **attend que la base soit `ACTIVE_HEALTHY`** (un nouveau projet ne
naît pas prêt), récupère les clés et **découvre l'hôte du pooler en testant une vraie connexion** au
lieu de deviner. Il affiche les 4 lignes prêtes à coller dans le `.env`.

⚠️ **Le jeton est une clé maîtresse** — il donne accès à tous les projets du compte. Il est lu depuis
l'environnement et jamais écrit sur disque. Si vous installez pour des tiers, utilisez le jeton DU CLIENT, ou
lancez le script sur votre machine et n'emportez que les 4 identifiants sur son serveur.

⚠️ **Offre gratuite : 2 projets par utilisateur**, comptés sur toutes les organisations où il est
Owner/Admin. Impossible d'héberger plusieurs clients sur un seul compte.

## Ce dont vous avez besoin avant

| Élément | Où l'obtenir |
|---|---|
| VPS (Docker) | HostGator — VPS avec Docker (n8n/OpenClaw/GatorClaw). D'autres hébergeurs avec Docker conviennent aussi — si le vôtre a déjà son propre proxy sur les ports 80/443, [voir ici](#vps-livré-avec-son-propre-proxy-hostinger-coolify-dokploy) |
| Domaine | Registre de domaine (pointez un enregistrement A vers l'IP du VPS) |
| Base de données | Compte gratuit sur [supabase.com](https://supabase.com) (3 clés + connection string) |
| IA | Une clé de votre fournisseur d'IA |
| WhatsApp | Votre numéro — connecté par QR code pendant l'onboarding |

## Prérequis du VPS

- **4 Go de RAM recommandés.** L'image est pré-construite, donc le serveur ne compile rien et la
  stack DÉMARRE avec 2 Go — mais l'exploiter est autre chose : il y a 7 conteneurs, et WAHA consomme
  ~150 Mo par session WhatsApp en plus de ~300 Mo de surcoût Node. Avec 2 Go vous tournez
  à la limite et aurez besoin de swap. Voir `docs/runbooks/waha-hostgator.md`.
- Ports **80** et **443** ouverts (`ufw allow 80,443,22/tcp`).
- Docker + Docker Compose v2 — `install.sh` installe Docker tout seul s'il manque (voir ci-dessus).

### VPS livré avec son propre proxy (Hostinger, Coolify, Dokploy…)

Certains hébergeurs livrent le VPS avec un **Traefik** qui occupe déjà les ports 80/443 — c'est lui
qui donne le HTTPS automatique à ce que le panneau installe. Le Caddy du kit veut les mêmes ports et ne
démarre pas. L'installateur **le détecte tout seul** et écrit `REVERSE_PROXY=traefik` dans le `.env` ; à
partir de là les scripts du kit incluent l'override qui désactive Caddy et publie l'app via le
Traefik de l'hébergeur. Si vous lancez compose à la main sur ces installations, utilisez les deux fichiers :

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml up -d
```

N'arrêtez pas le Traefik de l'hébergeur pour libérer les ports — cela casse les automatisations de
son panneau. Si votre Traefik utilise des noms différents de `websecure`/`letsencrypt`, ajustez
`TRAEFIK_ENTRYPOINT` et `TRAEFIK_CERTRESOLVER` dans le `.env`.

Il y a un cas où l'installateur **demande au lieu de décider** : quand le Traefik de
l'hébergeur tourne en `--network host` (Hostinger fait ainsi), Docker n'affiche de port
publié pour aucun conteneur, et alors il est impossible de prouver que c'est lui qui sert votre
domaine — ce pourrait être un nginx installé directement sur le serveur. Comme publier le CRM derrière le
mauvais proxy laisse le site en ligne sans répondre, l'installateur montre ce qu'il a trouvé et demande
confirmation. Avec `bash install.sh --yes` il n'y a personne à qui demander : il s'arrête et vous demande de
déclarer `REVERSE_PROXY=traefik` dans le `.env` — alors le choix est le vôtre et il continue sans demander.

## Scripts du kit

| Script | Rôle |
|---|---|
| `install.sh` | Installe tout (idempotent) |
| `update.sh` | Met à jour vers la nouvelle version |
| `backup.sh` | Sauvegarde de la base + sessions WhatsApp |
| `restore.sh` | Restaure une sauvegarde |
| `reset-password.sh` | Réinitialise le mot de passe d'un utilisateur |
| `reset-mfa.sh` | Retire le MFA d'un utilisateur bloqué |
| `healthcheck.sh` | Diagnostic des services |

## Automatisations et webhooks

`install.sh` (et `update.sh`, à chaque mise à jour) active déjà tout seul un cron qui tourne chaque minute et « tire » la file des événements en attente (`/api/v1/cron/event-log-drain`) — c'est ce qui fait qu'une automatisation se déclenche vraiment sur votre serveur (ex. : envoyer un message WhatsApp quand une commande change de statut). **Sans ce cron, les automatisations restent bloquées dans la file et ne tournent jamais** — c'est une exigence, pas un bonus.

Relancer `install.sh`/`update.sh` ne duplique pas la ligne du cron (il remplace lui-même l'ancienne). La 1re fois que le cron est activé sur une installation qui existait depuis un moment, le script nettoie aussi les événements en attente depuis plus de 7 jours (en les marquant comme terminés, sans effacer l'historique) — ainsi le premier drain ne déclenche pas des effets en retard de plusieurs semaines.

Pour tester à la main, lancez sur le VPS lui-même (utilise l'`INTERNAL_SECRET` de votre `.env`) :

```bash
source .env && curl -s -H "Authorization: Bearer ${INTERNAL_SECRET}" "${NEXT_PUBLIC_APP_URL}/api/v1/cron/event-log-drain"
```

Réponse attendue : `{"data":{"scanned":N,...}}` (N peut être 0 s'il n'y a pas d'événements dans la file — l'important est de recevoir ce format, pas une erreur d'authentification ou de connexion).

## Support

Les problèmes courants et comment les résoudre sont dans le `CLAUDE.md` (section « Quand il y a un problème »).
