<div align="center">

🇫🇷 Français · [🇺🇸 English](README.en.md) · [🇪🇸 Español](README.es.md)

# 🛠️ DeskcommCRM — le système d'exploitation commercial avec IA, open source, pour WhatsApp

**Des agents IA qui répondent, qualifient et vendent sur WhatsApp — dans un CRM open source qui tourne sur votre serveur.**
**Pensé pour les commerçants et entreprises d'Afrique francophone qui vendent en FCFA sur WhatsApp : sans abonnement, sans fonction verrouillée, vos données chez vous.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Postgres](https://img.shields.io/badge/Postgres-RLS%2Bvector-336791?logo=postgresql)](https://www.postgresql.org)
[![Auto-hébergé](https://img.shields.io/badge/auto--h%C3%A9berg%C3%A9-1%20commande-orange)](hostgator-setup-kit/)
[![CI](https://github.com/melgarafael/DeskcommCRM/actions/workflows/ci.yml/badge.svg)](https://github.com/melgarafael/DeskcommCRM/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**⚡ Installer**](#-installer-sur-votre-vps-le-chemin-principal) · [**🔄 Mettre à jour**](#-mettre-à-jour) · [**🧭 Vision**](VISION.md) · [**🏗️ Architecture**](ARCHITECTURE.md) · [**🤝 Contribuer**](CONTRIBUTING.md) · [**🗺️ Feuille de route**](#%EF%B8%8F-feuille-de-route)

</div>

---

> ### ☁️ Faites tourner ce CRM en production avec 1 commande
>
> Le kit [`hostgator-setup-kit/`](hostgator-setup-kit/) installe le CRM complet (app + WhatsApp + base)
> sur un VPS avec une seule commande, et le [runbook de production](docs/runbooks/waha-hostgator.md)
> part déjà de cet environnement.
>
> **[👉 Louer un VPS HostGator avec la remise partenaire](https://www.hostgator.com.br/52708-141-3-52.html)** —
> ou n'importe quel VPS avec Docker. Choisissez un datacenter proche de vos clients pour que WhatsApp tourne 24/7 avec une bonne latence. *(lien partenaire — souscrire par lui soutient le projet et coûte moins cher)*
>
> **Vous n'avez pas encore de serveur ?** Lancez ceci **sur votre ordinateur** (macOS, Linux ou WSL). Il vous dit
> quelle offre louer — avec les chiffres du runbook, pas un « ça dépend » — et vous rend la
> bonne commande pour votre cas :
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/melgarafael/DeskcommCRM/main/hostgator-setup-kit/comecar.sh | bash
> ```
>
> *(vous préférez lire avant d'exécuter ? clonez le dépôt et lancez `bash hostgator-setup-kit/comecar.sh` —
> il n'installe rien sans votre confirmation.)*

---

## ⚡ Installer sur votre VPS (le chemin principal)

### 1. Entrez dans votre VPS

Ouvrez le **Terminal** sur votre ordinateur (sous Windows, **PowerShell** ; sur Mac ou Linux, le
**Terminal**) et connectez-vous avec l'IP et le port que l'hébergeur vous a envoyés par e-mail :

```bash
ssh -p PORT root@VOTRE_IP
```

Remplacez `PORT` et `VOTRE_IP` par les vôtres. Si l'hébergeur n'a mentionné aucun port, c'est celui par défaut
(22) et vous pouvez l'omettre : `ssh root@VOTRE_IP`.

Il demande le mot de passe. **En le tapant, rien n'apparaît à l'écran — pas même des astérisques.** Ce n'est pas
un blocage : c'est le terminal qui cache le mot de passe. Tapez-le (ou collez-le) et appuyez sur Entrée.

> À la première connexion il demande `Are you sure you want to continue connecting?` — répondez
> `yes`. C'est le serveur qui se présente pour la première fois.

### 2. Lancez l'installateur

Une fois dans le VPS :

```bash
git clone https://github.com/melgarafael/DeskcommCRM.git
cd DeskcommCRM
bash hostgator-setup-kit/install.sh
```

C'est tout. **Vous n'installez ni Node, ni pnpm, et ne compilez rien** — l'image de l'app arrive prête.
S'il manque Docker, l'installateur demande et l'installe tout seul.

### Ce qu'il vous faut sous la main

| Élément | Où l'obtenir |
|---|---|
| **VPS avec Docker** | [HostGator](https://www.hostgator.com.br/52708-141-3-52.html) (partenariat) — ou n'importe quel VPS avec Docker. 4 Go de RAM recommandés |
| **Domaine** | Un enregistrement **A** qui pointe vers l'IP du VPS (ex. : `crm.votreentreprise.com`) |
| **Base de données** | Un projet Postgres gratuit — les clés + la connection string du **Session pooler** |
| **IA** | Une clé de votre fournisseur d'IA — l'installateur demande lequel vous voulez |
| **WhatsApp** | Votre numéro, connecté par QR code pendant l'onboarding (ou le canal officiel de Meta) |

> 💡 **La base peut être créée par l'installateur lui-même.** Exportez un jeton d'accès
> avant de lancer et il crée le projet, attend que la base soit en bonne santé,
> récupère les 4 identifiants et découvre l'hôte du pooler en testant une vraie connexion — sans copier-coller.

### Ce que l'installateur fait pour vous

Il **ne demande que ce qui est à vous** (domaine, clés, mot de passe de l'admin), **valide chaque réponse avant
de continuer** — une mauvaise clé est refusée sur-le-champ, pas trois étapes plus tard — et s'occupe du reste :

1. Génère tous les secrets techniques tout seul (vous n'inventez aucun mot de passe).
2. Crée les extensions Postgres et applique le schéma complet (`supabase/baseline.sql`).
3. Crée le premier admin avec l'e-mail et le mot de passe que vous avez choisis.
4. Démarre toute la stack avec **HTTPS automatique** et vérifie la santé à la fin.
5. Installe le **cron des automatisations** (sans lui, les règles QUAND/SI/ALORS restent bloquées dans la file)
   et l'**agent de mise à jour**, qui est ce qui fait exister le bouton « Mettre à jour maintenant » à l'écran.

**Relancer ne casse rien** — `install.sh` est idempotent : il ne duplique pas le cron, ne recrée pas
l'utilisateur, reprend là où il s'était arrêté.

> **Mode non interactif :** copiez `.env.hostgator.example` vers `.env`, remplissez-le et lancez
> `bash hostgator-setup-kit/install.sh --yes`.

### Autre hébergeur ? (Hostinger, Coolify, Dokploy, CapRover…)

Ça fonctionne. Si votre VPS arrive déjà avec un **proxy inverse propre** qui occupe les ports 80/443, l'
installateur **le détecte tout seul** et publie le CRM à travers lui, au lieu d'essayer de démarrer un
Caddy qui n'aurait pas sa place. Dans un cas précis — proxy en `--network host`, comme le fait Hostinger —
il **demande au lieu de deviner**, parce que publier derrière le mauvais proxy installe « avec
succès » un site muet. Détails dans [`hostgator-setup-kit/README.md`](hostgator-setup-kit/README.md#vps-livré-avec-son-propre-proxy-hostinger-coolify-dokploy).

### Premier accès

Ouvrez `https://<votre-domaine>` (le cadenas met ~1 min à apparaître), connectez-vous avec l'admin, et ayez
**Google Authenticator** ou **Authy** sous la main *si* vous voulez activer la vérification en deux étapes — elle est **optionnelle** et se trouve dans Paramètres › Sécurité ; la première connexion **ne** l'exige **pas**. Pendant l'onboarding,
scannez le QR code avec le WhatsApp de votre numéro.

### 🤖 Vous préférez qu'un assistant IA installe pour vous ?

Déposez le dossier `hostgator-setup-kit/` dans le chat de votre **assistant de code IA** qui tourne dans le VPS et dites
*« installe DeskcommCRM pour moi »*. Il lit le [`CLAUDE.md`](hostgator-setup-kit/CLAUDE.md) du kit
— qui contient le pas à pas et les pièges déjà connus — et conduit tout en français.

---

## 🔄 Mettre à jour

Une nouvelle version est sortie ? Il y a deux chemins, et le premier **n'exige pas de terminal**.

### Depuis l'écran (recommandé)

Quand une nouvelle version existe, le pied du menu latéral affiche **« Nouvelle version »** — seulement pour le propriétaire du
serveur, parce qu'avertir qui ne peut pas mettre à jour, c'est du bruit. Cliquez et vous arrivez dans
**Paramètres → Mise à jour**, qui montre ce qui change, fait **une sauvegarde de la base toute seule** et
suit chaque phase (sauvegarde → code → base → en ligne) jusqu'à la fin. Pas de SSH.

Si la nouvelle version démarre cassée, l'agent **revient tout seul à l'image précédente** et enregistre ce
retour dans le `.env` — sans cela, le prochain redémarrage ramènerait l'app cassée, en silence.

> En coulisse : l'app ne fait qu'enregistrer la demande ; c'est l'agent qu'`install.sh` a laissé sur
> votre VPS qui l'exécute, dans un cron qui vérifie **toutes les 5 minutes** — donc la mise à jour commence au plus 5
> minutes après le clic. Si cet agent est hors service, l'écran affiche
> **« Mise à jour automatique indisponible »** et montre la commande ci-dessous — il ne fait pas semblant que ça a marché.

### Depuis le terminal

```bash
cd /chemin/vers/DeskcommCRM
bash hostgator-setup-kit/update.sh
```

La commande fait, dans cet ordre : (1) vérifie qu'il y a vraiment une nouvelle version — sinon, elle sort aussitôt ;
(2) **fait une sauvegarde de la base avant de toucher à quoi que ce soit** ; (3) télécharge le nouveau code ;
(4) met à jour la base en réappliquant le `baseline.sql`, qui est idempotent et **auto-réparateur**
(il répare tout seul les données mises en désordre par d'anciennes versions) ; (5) récupère la nouvelle image de l'app ;
(6) vérifie la santé à la fin.

**La cible est la dernière version publiée** (`v1.2.3`), pas le sommet de `main` — mettre à jour mène toujours
à une version marquée et décrite dans le [`CHANGELOG.md`](CHANGELOG.md), jamais à un commit non testé.
Il **refuse** de revenir à une version antérieure à celle installée (cela désactiverait des choses que vous avez déjà) ;
pour cela il existe `--force`, exprès.

**Choses normales que vous allez voir :** une série de `already exists` / `multiple primary keys` dans la
partie base — **c'est attendu et inoffensif**, ce sont des choses qui existaient déjà. Le script filtre ce
bruit et affiche `✓ base mise à jour`. S'il apparaît `⚠ avertissements qui ne sont pas ceux attendus`, alors oui,
gardez le message.

**Ça a mal tourné ?** `bash hostgator-setup-kit/restore.sh` revient à la sauvegarde.
**Vous voulez seulement diagnostiquer ?** `bash hostgator-setup-kit/healthcheck.sh`.

> ⚠️ **Sur une ancienne installation qui n'a pas encore l'agent de l'écran**, lancez `update.sh` **deux
> fois** : la première exécution est encore celle de l'ancien script (qui télécharge le nouveau) ; la seconde installe
> l'agent et active le bouton.

Pas à pas en langage simple : [`docs/ATUALIZANDO.md`](docs/ATUALIZANDO.md).

### Autres commandes du kit

| Script | Rôle |
|---|---|
| `install.sh` | Installe tout (idempotent — peut être relancé) |
| `update.sh` | Met à jour vers la nouvelle version, avec sauvegarde automatique |
| `backup.sh` | Sauvegarde de la base + sessions WhatsApp |
| `restore.sh` | Restaure une sauvegarde |
| `reset-password.sh` | Réinitialise le mot de passe d'un utilisateur |
| `reset-mfa.sh` | Retire le MFA de qui a perdu son téléphone |
| `healthcheck.sh` | Diagnostic de tous les services d'un coup |

> **La sauvegarde compte :** une offre de base gratuite **ne fait pas de sauvegarde toute seule**. Planifiez
> `backup.sh` dans le cron chaque jour. `update.sh` lance déjà une sauvegarde avant chaque mise à jour.

---

## ✨ Ce que c'est

**Deskcomm** vient de **Desk** (bureau) + **comm** (commerce) : **le commercial de bureau** — toute l'activité commerciale de votre entreprise sur un seul bureau, opérée ensemble par des personnes et des agents IA.

Le projet est né comme CRM d'e-commerce et la communauté l'a emmené bien plus loin : il tourne aujourd'hui dans des **cliniques, agences immobilières, produits numériques, agences, boutiques et prestataires de services** — toute entreprise qui vend par WhatsApp. En Afrique francophone, c'est là que se passe la vente : la boutique de Douala, le grossiste d'Abidjan, l'agence de Dakar répondent à leurs clients sur WhatsApp, négocient en FCFA et concluent dans la conversation. Le produit a suivi ce virage et est devenu un **système d'exploitation commercial** : des agents IA avec RAG par organisation répondent, qualifient, font avancer les leads dans l'entonnoir, déclenchent des automatisations et savent quand passer la main à un humain — avec tout le CRM exposé via **MCP** pour que les agents opèrent pour de vrai. L'histoire complète est dans [`VISION.md`](VISION.md).

### Points forts

- 🤖 **Des agents IA qui opèrent le CRM** — RAG par organisation, compétences que l'agent exécute seul pendant la conversation, mémoire de l'activité, analyse du sentiment, passage IA→humain audité, IA assignable comme un membre de l'équipe à part entière et plafond de dépenses par organisation. Ce n'est pas un chatbot décoratif : l'agent répond, qualifie et fait avancer l'entonnoir.
- 🔁 **Rien ne meurt dans le silence** — relances qui reprennent la conversation refroidie (avec un délai adaptatif et des déclencheurs par étape de l'entonnoir), radar de ce qui risque de mourir sans réponse, et centre d'alertes pour ce qui demande une décision humaine.
- 🧠 **Des agents qui s'améliorent eux-mêmes** — les conversations résolues deviennent de nouvelles connaissances ; l'écran **Évolution de l'IA** montre si l'agent s'améliore, où il se trompe et ce qu'il reste à lui apprendre ; les **Propositions** sont des améliorations que l'IA se suggère à elle-même, applicables comme nouvelle version — toujours avec validation humaine.
- 🧩 **Multi-secteur par conception** — vocabulaire configurable par entonnoir : le lead devient *Client*, *Patient* ou *Acheteur* ; gagné devient *Payé*, *Rendez-vous pris* ou *Conclu*. Le même cœur sert l'e-commerce (notre berceau), la clinique, l'immobilier ou les produits numériques.
- 💬 **WhatsApp de deux façons** — par **QR code** (multi-numéro, avec anti-bannissement : limitation de cadence + gigue + fenêtre horaire) ou par le **canal officiel de Meta** (Cloud API, avec modèles approuvés et synchronisés). Médias via stockage objet, détection du STOP.
- 🔀 **Choisissez votre IA** — le fournisseur est choisi à l'installation et modifiable ensuite depuis l'écran, **par partie du système** (celui qui converse n'a pas besoin d'être celui qui indexe).
- 👥 **Gouvernance du service client** — RBAC réellement côté serveur, attribution/transfert audités, file avec rotation, routage automatique par intention et périmètre de visibilité par rôle.
- 🏢 **Multi-organisation + protection des données dès la conception** — RLS sur toute table liée à une organisation avec un test d'isolement comme contrôle de CI ; anonymisation préférée à la suppression ; audit en ajout seul avec rétention de 5 ans.
- 🖥️ **Vraiment auto-hébergé** — vos données sur votre VPS ; installation et mise à jour en 1 commande (ou 1 clic) ; pas de version payante, pas de fonction verrouillée.

### 🔌 Webhooks & automatisations

Chaque organisation peut créer des **sources de captation** : une adresse publique (`/api/v1/webhooks/in/<token>`) qui reçoit des leads depuis des pages d'atterrissage, des formulaires maison ou des outils comme Zapier/n8n via POST (JSON ou `application/x-www-form-urlencoded`) et les fait entrer directement dans l'entonnoir/l'étape choisis — sans code, sans intégration sur mesure par organisation. Par-dessus ces sources (et les autres événements du CRM — lead qui change d'étape, reçoit une étiquette, message WhatsApp reçu), l'organisation monte des **automatisations** : des règles au format QUAND/SI/ALORS qui déclenchent des actions comme ajouter une étiquette, déplacer le lead dans l'entonnoir, l'attribuer à un agent, envoyer un message WhatsApp ou prévenir un autre système via webhook sortant.

Dans l'interface, tout se trouve dans **Webhooks** dans la barre latérale (visible seulement pour les rôles `manager`/`admin`). L'écran a trois onglets : **Recevoir des données** (créer une source, copier l'adresse/le formulaire prêt, envoyer un lead de test, voir les dernières réceptions), **Automatisations** (monter la règle, qui naît toujours en pause jusqu'à ce que vous la relisiez et l'activiez) et **Activité** (chronologie de chaque exécution, avec le résultat de chaque action et un renvoi manuel quand un appel externe échoue).

En coulisse, chaque événement devient une ligne dans `event_log` — aucun trigger de base ne fait d'appel HTTP directement. Celle qui vide cette file est la route `/api/v1/cron/event-log-drain`, appelée chaque minute. **`install.sh`/`update.sh` configurent déjà ce cron tout seuls** — sans lui, les automatisations sont créées normalement mais ne tournent jamais.

---

## 🖥️ Ce que vous pilotez (les écrans)

| Groupe | Écrans |
|---|---|
| **Service client** | **Boîte de réception** (conversations WhatsApp, vous et l'IA côte à côte) · **Radar** (qui s'est refroidi et reste ouvert) · **Réponses rapides** |
| **CRM** | **Kanban** (où en est chaque affaire dans l'entonnoir) · **Contacts** · **Entonnoirs** (étapes, vocabulaire métier et motifs de perte) |
| **Agent IA** | **Agents** · **Relances** · **Routeurs** · **Fournisseurs** et **Identifiants** · **Connaissances** (RAG) · **Mémoire** · **Compétences** · **Cas** · **Alertes** · **Propositions** · **Exécutions** · **Utilisation et budget** |
| **Canaux** | **Connexions** (QR ou canal officiel de Meta, avec santé, reconnexion et modèles) · **Nuvemshop** · **Webhooks** |
| **Analyse** | **Performance** (entonnoir et performance par agent) · **Évolution de l'IA** · **Journal d'audit** |
| **Organisation** | **Équipe** · **Distribution du service client** · **Organisation** · **Protection des données** · **Jetons d'API** · **Sécurité** (MFA, codes de récupération, sessions) · Profil, Notifications, Facturation |

Chaque écran a une porte dans la navigation — la CI recale un écran qui existe mais auquel on n'accède qu'en tapant l'URL.

---

## 🧱 Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| **Frontend** | Next.js 16 App Router (Turbopack) + React 19 + TypeScript 6 strict | Server Components + Route Handlers dans le même dépôt |
| **Style** | Tailwind + shadcn/ui (`new-york`, neutral) | Personnalisable sans verrouillage |
| **Base** | Postgres (+ RLS + `vector`) | Multi-organisation natif, embeddings pour le RAG |
| **Auth** | Authentification managée, cookies de session | Cookie SameSite=Strict, HttpOnly |
| **Temps réel** | Temps réel Postgres | postgres_changes + broadcast |
| **Stockage** | Stockage objet (URL signées) | Bucket privé `whatsapp-media` |
| **WhatsApp** | Passerelle QR (moteur NOWEB) + Meta Cloud API | QR pour démarrer vite ; canal officiel pour passer à l'échelle |
| **Files** | Table `event_log` + workers (cron) | Un trigger de base ne fait jamais de HTTP |
| **Limitation de débit** | Redis (fenêtre glissante) | Serverless, offre gratuite suffisante |
| **IA** | SDK IA multi-fournisseur | L'installateur demande lequel ; modifiable ensuite depuis l'écran |
| **Validation** | Zod | Entrées externes, env, payloads |
| **Observabilité** | Sentry (nettoyage des erreurs, transactions, spans et breadcrumbs) | Télémétrie sur consentement à l'installation |
| **Hébergement** | VPS avec Docker | App + WhatsApp + workers sur votre machine |

Détails : [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 🧑‍💻 Développement (seulement pour contribuer au code)

> ⚠️ **Si vous voulez UTILISER le CRM, ce n'est pas ici** — utilisez l'[installateur du VPS](#-installer-sur-votre-vps-le-chemin-principal).
> Cette section est pour qui va toucher au code.

```bash
git clone https://github.com/melgarafael/DeskcommCRM.git
cd DeskcommCRM

nvm use                     # Node 22
npm install -g pnpm && pnpm install

cp .env.example .env.local  # guide complet dans docs/SETUP.md

docker compose up -d        # WAHA local (optionnel en dev sans WhatsApp)

# Schéma : appliquez le baseline, PAS les migrations.
# Les migrations 0001-0009 et 0013 sont des stubs `SELECT 1;` — la chaîne ne démarre pas de zéro.
# Le vrai schéma vit dans baseline.sql, le même qu'install.sh applique sur le VPS.
# `supabase db push` « passe » et laisse la base vide.
supabase link --project-ref <votre-ref>

# Sur un NOUVEAU projet, activez d'abord les extensions qu'utilise le schéma —
# sans elles le baseline s'arrête sur `type public.vector does not exist`.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c \
  'create extension if not exists vector with schema public;
   create extension if not exists citext with schema public;
   create extension if not exists pg_trgm with schema public;'

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql

pnpm dev
```

App : <http://localhost:3000> · Contrôle de santé : <http://localhost:3000/api/v1/health>

[`docs/SETUP.md`](docs/SETUP.md) est le tutoriel complet de **toutes les intégrations** (base, WhatsApp, fournisseurs d'IA, Redis, Sentry, Resend, Nuvemshop) — ~60–90 min de zéro à l'app qui tourne.

---

## 📁 Structure

```
DeskcommCRM/
├── app/                    # Next.js App Router
│   ├── (admin)/            # Routes super-admin (impersonation, organisations)
│   ├── (public)/           # Connexion, récupération
│   ├── app/                # Routes authentifiées : inbox, radar, kanban, contacts,
│   │                       #   connections, ai/*, integrations, metrics, lgpd,
│   │                       #   audit, team, settings
│   └── api/v1/             # API REST canonique (196 route handlers)
├── components/             # React (ui/, inbox/, kanban/, shell/, ...)
├── lib/                    # supabase/, waha/, channels/, ai/, agent-engine/,
│                           #   api/, routing/, navigation/, env.ts
├── workers/                # consommateurs d'event_log (IA, RAG, données personnelles, médias, routines)
├── supabase/migrations/    # SQL versionné (+ baseline.sql pour l'auto-hébergement)
├── tests/{e2e,unit,invariants,shell}/
├── scripts/                # seeds, qa-waves, maintenance
├── docs/                   # PRD, specs, runbooks, SETUP.md, ATUALIZANDO.md
└── hostgator-setup-kit/    # installation et mise à jour auto-hébergées
```

---

## 🧪 Tests

```bash
pnpm typecheck     # tsc --noEmit (strict)
pnpm lint          # eslint next/core-web-vitals
pnpm test:unit     # Vitest (N'inclut PAS tests/invariants/**)
pnpm test:db       # Postgres éphémère + baseline install/update + invariants
pnpm test:e2e      # Playwright (exige le serveur de dev)
```

**Ces contrôles sont obligatoires** pour fusionner dans `main`. La liste ci-dessous a déjà dit « quatre » puis « cinq » — **mesurez, ne lui faites pas confiance** :

```bash
gh api repos/melgarafael/DeskcommCRM/branches/main/protection \
  --jq '.required_status_checks.contexts|join(", ")'
# au 2026-08-14 : verify, build-and-size, invariants, e2e, imagens-ok
```


| Contrôle | Ce qu'il fait |
|---|---|
| `verify` | typecheck + lint + `lint:channels` + `test:unit` + `test:shell` |
| `invariants` | démarre un Postgres propre, applique le `baseline.sql` en mode **install** puis en mode **update** — les deux passes avec `ON_ERROR_STOP=1`, ce qui fait de la seconde une preuve d'idempotence et pas seulement un « c'est fini » —, et exécute les invariants de RBAC, attribution, périmètre, routage, relances, webhooks et automatisations |
| `build-and-size` | `pnpm build` sous Node 22 |
| `e2e` | démarre une base locale, applique le `baseline.sql` et exécute les specs Playwright par le frontend (toutes sauf une) |
| `imagens-ok` | échoue quand l'une des trois images Docker (`app`, `worker`, `scheduler`) ne se construit pas — c'est l'artefact que l'auto-hébergeur installe |

La seule spec hors de `e2e` est `vps-fresh-onboarding` — elle a besoin de WhatsApp + Redis + Resend + Nuvemshop pour de vrai. C'est la **P0** de notre doctrine de QA visuelle, donc `e2e` vert **ne** prouve **pas** le parcours d'installation neuve ; celui-là se prouve sur un VPS.

Parmi les invariants se trouve le **test d'isolement RLS** : il crée 2 organisations, simule les claims JWT par le même chemin `auth.uid()` / `fn_user_org_ids()` qu'utilisent les policies de production, et prouve qu'un utilisateur de l'org A voit **zéro ligne** de l'org B dans `conversations`, `messages`, `contacts` et `crm_leads`. Avant cela, un cas de contrôle prouve que les lignes de l'org B existent vraiment — sans lui, le test passerait avec la table vide.

---

## 📚 Documentation

| Doc | Contenu |
|---|---|
| [`hostgator-setup-kit/README.md`](hostgator-setup-kit/README.md) | **Installation auto-hébergée** — le kit, les scripts, les hébergeurs avec leur propre proxy |
| [`docs/ATUALIZANDO.md`](docs/ATUALIZANDO.md) | **Comment mettre à jour** votre installation, en langage simple |
| [`VISION.md`](VISION.md) | **Vision et positionnement** — ce qu'est le projet, en quoi il croit et où il va |
| [`CHANGELOG.md`](CHANGELOG.md) | Ce qui a changé à chaque version — **lisez la section de la version avant de mettre à jour** |
| [`docs/SETUP.md`](docs/SETUP.md) | Mise en place de développement, pas à pas de toutes les intégrations |
| [`docs/white-label.md`](docs/white-label.md) | **Installer pour des clients** — changer la marque, une installation par client ou partagée, revente |
| [`docs/runbooks/waha-hostgator.md`](docs/runbooks/waha-hostgator.md) | Runbook WhatsApp en production (dimensionnement, reprise) |
| [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md) | Déploiement en production |
| [`CLAUDE.md`](CLAUDE.md) | Conventions non négociables (lecture obligatoire pour contribuer) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Vue d'une page de l'architecture |
| [`docs/index.md`](docs/index.md) | Index des documents, avec règle de précédence |
| [`docs/prd/`](docs/prd/) · [`docs/specs/`](docs/specs/) | PRD et specs techniques (schéma SQL, payloads, MCP, gouvernance) |

---

## 🤝 Contribuer

Ce projet est open source pour la communauté. Toute contribution est la bienvenue — de la correction d'une coquille dans la doc à une nouvelle fonctionnalité.

**Avant d'ouvrir une PR :**

1. Lisez [`CLAUDE.md`](CLAUDE.md) (~5 min) — conventions non négociables (multi-organisation, RLS, audit, protection des données).
2. Lisez [`CONTRIBUTING.md`](CONTRIBUTING.md) — flux de branches, commits, epic-executor.
3. Suivez le [Code de conduite](CODE_OF_CONDUCT.md).

**Flux court :**

```bash
git checkout -b feat/short-slug
# implémentation + tests
pnpm typecheck && pnpm lint && pnpm lint:channels && pnpm test:unit && pnpm test:shell && pnpm build
pnpm test:db   # a besoin de Docker — c'est le job `invariants`, obligatoire à la fusion
git commit -m "feat(perimetre): description"
# ouvrez la PR — le modèle apporte déjà la checklist de la Definition of Done
```

Ces deux lignes sont **tout ce qu'il est possible de lancer sur votre machine**, exprès : n'en lancer que la moitié et
découvrir le reste comme une surprise rouge après des heures d'attente est la pire première expérience
que ce dépôt sache offrir.

Deux contrôles obligatoires **n'y** tiennent **pas** et ne tournent qu'en CI : `e2e` (a besoin d'une base locale) et
`imagens-ok` (construit les trois images Docker). Vert sur votre machine n'est pas vert à la fusion.

**Definition of Done :** typecheck à zéro, lint à zéro, tests pertinents verts, RLS testée si une table liée à une organisation est touchée, journal d'audit émis lors des mutations, migration versionnée **+ annexe dans `baseline.sql`** si le schéma change (sinon le changement n'atteint pas qui s'auto-héberge). Détails dans [`CLAUDE.md`](CLAUDE.md#definition-of-done).

---

## 🐛 Signaler des bugs

Ouvrez une [issue](https://github.com/melgarafael/DeskcommCRM/issues/new/choose) — le modèle demande ce dont nous avons besoin (environnement, `/api/v1/health`, étapes). Lancer `bash hostgator-setup-kit/healthcheck.sh` et coller la sortie aide beaucoup.

Pour les **vulnérabilités de sécurité**, **N'ouvrez PAS d'issue publique** — utilisez le [signalement privé de vulnérabilités](https://github.com/melgarafael/DeskcommCRM/security/advisories/new). Détails dans [`SECURITY.md`](SECURITY.md).

---

## 🗺️ Feuille de route

### ✅ Livré

- **Fondation & plateforme** — authentification (MFA optionnel), multi-organisation avec RLS + test d'isolement, RBAC à 4 rôles, journal d'audit en ajout seul, onboarding d'organisation.
- **Service client WhatsApp** — boîte de réception à 3 panneaux en temps réel, connexions multi-numéro par **QR** ou **canal officiel de Meta** (modèles approuvés et synchronisés), médias via stockage objet, anti-bannissement (limitation de cadence + gigue + fenêtre horaire), détection du STOP.
- **CRM & commandes** — kanban avec vocabulaire configurable par secteur (fractional indexing), gestion des entonnoirs depuis l'écran, vue client 360, contacts, étiquettes, intégration Nuvemshop.
- **IA native** — agents avec RAG par organisation (pgvector), **compétences** que l'agent exécute seul, **mémoire de l'organisation**, routeur d'intention par numéro, analyse du sentiment, passage IA→humain, plafond de dépenses par organisation, serveur MCP interne.
- **Choix du fournisseur d'IA** — décidé à l'installation et modifiable par partie du système depuis l'écran.
- **Relances vivantes** — reprise de la conversation refroidie avec délai adaptatif, déclencheurs par étape de l'entonnoir et par cas, file avec rotation, et le Radar de ce qui risque de mourir sans réponse.
- **Protection des données** — export et effacement via des workers, anonymisation en cascade, consentement audité.
- **Auto-hébergement** — `hostgator-setup-kit` (app + WhatsApp + base en 1 commande), `baseline.sql` auto-réparateur, **mise à jour depuis l'écran** avec sauvegarde automatique, runbook de production.
- **Webhooks & automatisation** — sources de captation + règles QUAND/SI/ALORS + déclencheurs vers des systèmes externes.
- **Gouvernance du service client** — RBAC côté serveur sur toute l'API, attribution et transfert audités (IA assignable à part entière), visibilité par rôle (RLS) + métriques par agent, routage automatique avec file et panneau de gestion, et contrat de gouvernance pour les agents IA externes ([`docs/specs/14`](docs/specs/14-contrato-governanca-agentes-externos.md)).
- **Activité visible** — motif de la retenue anti-bannissement traduit dans la conversation, centre d'alertes avec sévérité, alerte de message bloqué, contrôle de la protection d'envoi (fenêtre/cadence/plafond), capacités déclarées de l'agent et propositions du flywheel applicables comme nouvelle version (avec validation humaine).

### 🔮 Prochainement

- **MCP public** — les capacités du CRM exposées à l'écosystème d'agents : branchez l'agent que vous voulez et il opère Deskcomm.
- **Modèles par secteur** — entonnoirs et vocabulaires prêts pour la clinique, l'immobilier, les produits numériques et les services (e-commerce déjà livré).
- **Intégrations** — VTEX et Shopify via le pattern adapter (Nuvemshop déjà livré).
- **Identité probabiliste** — unification des contacts entre canaux.

---

## 💬 Communauté

- **Discussions :** [GitHub Discussions](https://github.com/melgarafael/DeskcommCRM/discussions) — pour les questions, idées, démonstrations.
- **Issues :** [GitHub Issues](https://github.com/melgarafael/DeskcommCRM/issues) — bugs et tâches.
- **Instagram :** [@melgarafael](https://www.instagram.com/melgarafael)
- **YouTube :** [youtube.com/@melgarafael](https://www.youtube.com/@melgarafael)

---

## 📜 Licence

Distribué sous licence **MIT** — voir [`LICENSE`](LICENSE). Vous pouvez utiliser, modifier
et distribuer librement, y compris commercialement. Le logiciel est fourni **« tel quel »,
sans garantie** (voir la clause d'exonération dans `LICENSE`).

---

## 🛟 Support & responsabilités (auto-hébergement)

C'est un projet **auto-hébergé** : chaque personne fait tourner le CRM sur sa **propre infrastructure**
(VPS, base de données et clé d'IA propres). Cela implique :

- **Le support est communautaire et « tel quel ».** Questions et bugs entrent comme
  [Issues](https://github.com/melgarafael/DeskcommCRM/issues) ou
  [Discussions](https://github.com/melgarafael/DeskcommCRM/discussions). Il n'y a ni SLA ni
  support garanti — c'est de l'open source maintenu de bonne volonté.
- **Vous êtes responsable de votre installation.** Les mises à jour ne sont pas automatiques (vous cliquez
  ou lancez `update.sh` quand vous voulez), et la maintenance/sauvegarde de votre serveur vous revient.
- **Protection des données — attention :** qui **héberge** l'instance est le **responsable du traitement** des données personnelles
  qui y sont traitées (clients, conversations, commandes), avec les obligations légales qui en découlent. Les
  mainteneurs du projet **ne sont ni** responsables du traitement ni sous-traitants de votre instance, et n'ont
  pas accès à votre base, à votre WhatsApp ni à votre stockage. La seule chose qui peut sortir
  de votre machine vers nous est le rapport d'erreur décrit ci-dessous — et seulement si vous le permettez.
- **Télémétrie (Sentry) :** `install.sh` **demande** pendant l'installation et respecte votre
  réponse ; en mode non interactif, sans `SENTRY_DSN` défini, la télémétrie reste
  **désactivée**. Si vous acceptez le Sentry de la communauté, ce qui est envoyé, ce sont des **rapports
  d'erreur** (stack trace) avec numéros d'identité, téléphones et e-mails remplacés, en-têtes sensibles
  retirés, et jetons de webhook/invitation masqués dans l'URL — **sans** suivi de
  performance et **sans** replay de session, qui restent à 0 sur ce chemin. Pour désactiver à
  tout moment : `SENTRY_DSN=off` dans le `.env`. Pour envoyer vers **votre** Sentry (alors avec
  performance et replay) : `SENTRY_DSN=<votre-dsn>`. Ce qui est masqué, et pourquoi, se trouve dans
  [`lib/sentry/scrub.ts`](lib/sentry/scrub.ts) ; la résolution du DSN dans
  [`lib/sentry/dsn.ts`](lib/sentry/dsn.ts).

---

## 🙏 Remerciements

- **WAHA** ([devlikeapro](https://waha.devlikeapro.com/)) — moteur WhatsApp.
- **Postgres** et son écosystème — base, authentification, stockage et temps réel.
- **HostGator** — partenariat d'infrastructure qui a rendu possible l'auto-hébergement en 1 commande.
- **shadcn/ui** — base de composants.
- La communauté qui nous a emmenés de l'e-commerce vers les cliniques, l'immobilier, les produits numériques et au-delà — vous avez défini ce qu'est ce projet.

---

<div align="center">

**Construit avec ☕ · pour les vendeurs d'Afrique francophone** · **Fait pour la communauté**

Suivez le développement : [Instagram](https://www.instagram.com/melgarafael) · [YouTube](https://www.youtube.com/@melgarafael)

</div>
