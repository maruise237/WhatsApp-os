# WhatsApp OS

**Le CRM de vente sur WhatsApp, avec un assistant IA, pour les commerçants d'Afrique francophone.**

Vos clients écrivent sur WhatsApp ; l'assistant répond, présente le catalogue,
prépare la commande et demande la preuve de paiement. Vous validez le paiement,
vous livrez, tout est suivi au même endroit. Prix en **FCFA**, heure de
**Douala**, numéros **+237** par défaut. Interface entièrement en français,
pensée pour le téléphone.

Open source (MIT), auto-hébergé : vos données restent chez vous.

---

## Ce que fait l'application

| | |
|---|---|
| **Boîte de réception WhatsApp** | Toutes les conversations, par numéro ; prise en main par un humain à tout moment. |
| **Assistant IA** | Répond, qualifie, présente les produits, crée un brouillon de commande, demande la preuve de paiement. Ne promet jamais de remise ou de délai que vous n'avez pas autorisé. Passe la main à un humain quand il le faut. |
| **Ventes** | Catalogue (prix en FCFA, stock), commandes, preuves de paiement à valider, suivi de livraison. |
| **Tableau des ventes** | Colonnes Nouveau → En cours → Gagné / Perdu, glisser-déposer. |
| **Relances** | Relances automatiques des clients silencieux, dans la plage horaire autorisée. |
| **Équipe** | Rôles lecteur, agent, manager, admin ; répartition des conversations. |
| **Base de connaissances** | Vos documents (horaires, conditions, FAQ) que l'assistant consulte avant de répondre. |
| **Données personnelles** | Export et anonymisation d'un contact sur demande, journal d'audit. |

## Architecture

```
                 ┌──────────── Neon (cloud) ────────────┐
                 │  Postgres 17 · Neon Auth · Data API  │
                 └───────────────▲──────────────────────┘
                                 │
┌──────────────────────── votre VPS (Dokploy) ─────────────────────────┐
│  app (Next.js)  ── worker (agent IA)  ── scheduler (tâches planifiées) │
│        │                                                              │
│  whatsapp-gateway ── evolution-go (+ evolution-db)   seaweedfs (médias)│
└───────────────────────────────────────────────────────────────────────┘
                 IA : DeepSeek (clé de la plateforme)
```

- **Neon** héberge la base, les comptes et l'API de données. Toutes les tables
  métier sont isolées par organisation (RLS).
- **app** : interface et API. Applique le schéma de la base au démarrage.
- **worker** : tours de l'assistant IA, en continu.
- **scheduler** : relances, reprises, nettoyages (appelle l'app à heure fixe).
- **Evolution Go** + **gateway** : connexion WhatsApp (QR code ou code).
- **SeaweedFS** : photos, audios, preuves de paiement (bucket privé).

Mesuré à vide : 7 conteneurs, ~310 Mo de RAM au total ; chaque service a un
plafond mémoire. Détails : [`docs/stack-dokploy.md`](docs/stack-dokploy.md).

---

## Déployer sur Dokploy

### 1. Créer le projet Neon

1. Sur [neon.com](https://neon.com), créez un projet (Postgres 17, région la plus
   proche de vos clients).
2. Activez **Neon Auth** et la **Data API**. Dans les réglages d'auth, ajoutez
   votre domaine (ex. `crm.maboutique.cm`) aux domaines de confiance.
3. Notez :
   - l'URL d'auth (`NEON_AUTH_BASE_URL`) et l'URL de la Data API (`NEON_DATA_API_URL`) ;
   - la chaîne de connexion **poolée** (`NEON_DATABASE_URL`) ;
   - la chaîne de connexion **directe** du propriétaire (`NEON_DATABASE_ADMIN_URL`),
     utilisée pour appliquer le schéma.

### 2. Créer l'application dans Dokploy

1. **Create Service → Compose**, source : ce dépôt, branche `main`,
   fichier `docker-compose.dokploy.yml`.
2. Onglet **Environment** : collez les variables ci-dessous.
3. Onglet **Domains** : votre domaine vers le service `app`, port `3000`, HTTPS.
4. **Deploy**.

Au premier démarrage, l'app applique le schéma de la base
(`scripts/db-migrate.mjs`, à chaque démarrage, sans effet si rien n'a changé).

### 3. Variables d'environnement

Obligatoires :

| Variable | Rôle |
|---|---|
| `DOMAIN` | Votre domaine, ex. `crm.maboutique.cm` |
| `NEXT_PUBLIC_APP_URL` | `https://` + votre domaine |
| `NEON_AUTH_BASE_URL`, `NEON_DATA_API_URL` | Fournies par Neon |
| `NEON_DATABASE_URL` | Connexion poolée |
| `NEON_DATABASE_ADMIN_URL` | Connexion directe (schéma au démarrage) |
| `NEON_AUTH_COOKIE_SECRET` | 32 caractères aléatoires ou plus |
| `INTERNAL_SECRET` | Secret partagé app ↔ scheduler/worker |
| `AI_CRED_AES_KEY` | Clé de chiffrement (32 octets en base64) |
| `WHATSAPP_GATEWAY_TOKEN` | Secret partagé app ↔ gateway |
| `EVOLUTION_GO_API_KEY`, `EVOLUTION_GO_WEBHOOK_SECRET`, `EVOLUTION_GO_POSTGRES_PASSWORD` | Evolution Go |
| `DEEPSEEK_API_KEY` | Clé DeepSeek : sans elle, l'assistant reste en brouillon |

Pour générer les secrets :

```bash
openssl rand -hex 32          # secrets texte
openssl rand -base64 32       # AI_CRED_AES_KEY
```

Facultatives : `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (e-mails d'invitation et de
mot de passe), `SENTRY_DSN`, `COMPOSE_PROFILES=redis` (rate-limit partagé),
`APP_NAME` / `APP_LOGO_URL` / `APP_ACCENT_HEX` (votre marque). La liste complète
et commentée est dans [`.env.example`](.env.example).

### 4. Premier compte

1. Ouvrez `https://votre-domaine/signup` et créez votre compte : l'organisation
   est créée et l'assistant de démarrage s'ouvre.
2. Pour accéder au panneau d'administration de la plateforme (marque, toutes
   les organisations), donnez-vous le rôle propriétaire dans la console SQL de Neon :

   ```sql
   insert into public.platform_admins (user_id, granted_by, reason)
   select id, id, 'propriétaire de l''installation'
     from neon_auth."user" where email = 'vous@exemple.cm';
   ```

3. Dans l'assistant de démarrage, connectez votre numéro WhatsApp (QR code ou
   code à 8 chiffres).

### 5. Mettre à jour

Chaque fusion sur `main` publie de nouvelles images (`ghcr.io/maruise237/*`).
Dans Dokploy : **Redeploy** (ou activez le déploiement automatique). Le schéma de
la base est mis à jour au démarrage de l'app.

### Vérifier

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://votre-domaine/login   # 200
```

Dans Dokploy, les 7 services doivent être `healthy`.

---

## Développer en local

Prérequis : Node 22, pnpm 9, Docker.

```bash
pnpm install
bash scripts/local-stack/up.sh     # Postgres + auth + Data API + stockage locaux
pnpm build
set -a; . .superpowers/local-stack.env; set +a; pnpm next start -p 3000
```

La pile locale reproduit Neon (même schéma, même auth). Mode d'emploi :
[`scripts/local-stack/README.md`](scripts/local-stack/README.md).

### Tests

```bash
pnpm typecheck      # TypeScript strict
pnpm lint
pnpm test:unit      # Vitest
pnpm test:db        # base jetable + schéma + tests d'invariants (isolation entre organisations, droits)
```

### Base de données

- Schéma : `db/migrations/` (une migration = un fichier `NNNN_nom.sql`,
  idempotent, listé dans `db/migrations/MANIFEST.md`).
- Appliquer : `node scripts/db-migrate.mjs` (lit `NEON_DATABASE_ADMIN_URL`).

## Licence

MIT — voir [LICENSE](LICENSE).
