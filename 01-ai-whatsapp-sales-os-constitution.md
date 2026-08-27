# AI WhatsApp Sales OS — Constitution

**Statut** : v1.0 · **Date** : 19/08/2026 · **Portée** : gouverne toutes les specs et tout le code généré par un agent IA sur ce projet.

> Ce document est la loi du projet. Un agent (Claude Code, Cursor, ou autre) qui génère du code
> en contradiction avec un principe ci-dessous doit être arrêté et corrigé — la spec ou le plan
> ont priorité sur l'intuition de l'agent, et cette constitution a priorité sur la spec.

---

## 0. Mission

AI WhatsApp Sales OS donne à un vendeur qui vend dans des groupes WhatsApp un numéro dédié, branché sur un
agent IA qui qualifie, vend et encaisse — jusqu'à la vérification du paiement, où la main revient
à un humain. Ce n'est pas un chatbot FAQ, c'est un commercial externalisé.

---

## 1. Principes non négociables

### P1 — Isolation par vendeur, jamais par instance
Chaque vendeur a son catalogue, son stock, ses conversations, ses paiements et son numéro
WhatsApp complètement isolés des autres. **Ceci est une garantie applicative (tenant_id sur
chaque ligne, vérifié à chaque requête)** — indépendante de la mutualisation technique des
instances Evolution sur un même serveur, qui reste une optimisation d'infrastructure normale
et documentée par l'éditeur lui-même (voir P6).

### P2 — Un numéro = une instance = un vendeur
Pas de numéro partagé entre deux vendeurs. Plusieurs instances peuvent cohabiter sur le même
serveur Evolution Go, mais chaque instance appartient à un seul vendeur.

### P3 — Vérification de paiement toujours semi-humaine
L'IA détecte et rassure ; **seul un humain confirme réellement un paiement.** Aucune fonction
ne doit faire passer une commande à `PAYÉE` automatiquement sur la seule foi d'une capture
d'écran. C'est une règle de sécurité financière, pas une préférence.

### P4 — Commande officielle = après paiement
Tant que la capture n'est pas envoyée, c'est une conversation, pas une commande. Le statut
`en_cours` précède toujours `en_attente_paiement` puis `payée`.

### P5 — Anti-ban by design
Aucun envoi en masse à intervalle fixe. Délais aléatoires, quotas 24h, réglages de présence
(`always_online`, `read_status`, `reject_calls`) appliqués par défaut sur chaque instance créée
— pas en option qu'on active plus tard.

### P6 — Proxy unique devant Evolution Go
Le code applicatif (dashboard, agent IA) ne connaît jamais l'URL ni la clé d'Evolution Go
directement. Un seul point d'entrée (`whatsapp-gateway`) encapsule toutes les actions. C'est
une pratique standard pour toute API multi-tenant exposée à des clients — documentée par
l'éditeur d'Evolution API lui-même, pas une astuce propriétaire d'un concurrent.

### P7 — 100 % Docker Compose, zéro Cloudflare, zéro AWS
Tout tourne sur un VPS via `docker-compose.yml`. Exception explicitement acceptée et documentée :
Evolution Go doit s'activer auprès du serveur de licence de l'Evolution Foundation (gratuit,
sans limite d'instance, mais nécessite un accès sortant + un heartbeat périodique — voir
`02-ai-whatsapp-sales-os-spec.md §6`). Ce n'est ni Cloudflare ni AWS, donc ça respecte P7, mais c'est une
dépendance externe réelle à documenter, pas à cacher.

### P8 — Spec-driven, pas de vibe coding
Aucun agent n'écrit de code métier sans une tâche référencée dans `04-ai-whatsapp-sales-os-tasks.md`
elle-même dérivée d'une exigence de `02-ai-whatsapp-sales-os-spec.md`. Si une tâche n'existe pas encore,
on l'ajoute d'abord à la spec, on ne code pas "en attendant".

### P9 — Erreurs typées, jamais d'erreur technique brute côté client
Toute erreur exposée au vendeur ou au client final a un code métier et un message humain.
Le detail technique reste dans les logs.

### P10 — Le vendeur ne fait que trois choses
Vérifier le solde, confirmer la commande, organiser la livraison. Toute fonctionnalité qui
ajoute une quatrième tâche récurrente au vendeur doit être justifiée explicitement dans sa spec.

---

## 2. Contraintes techniques figées

| Domaine | Choix | Verrouillé |
|---|---|---|
| Orchestration | Docker Compose (pas de Kubernetes/Swarm au lancement) | ✅ |
| WhatsApp | Evolution Go (`whatsmeow`, Go, licence gratuite Evolution Foundation) | ✅ |
| Base de données | PostgreSQL (conteneur Docker) | ✅ |
| Cache / files | Valkey (fork BSD de Redis) | ✅ |
| Stockage médias | SeaweedFS (S3-compatible, remplace MinIO — voir `03-ai-whatsapp-sales-os-plan.md §4`) | ✅ |
| Vision IA | Gemini (analyse photos produits + captures de paiement) | ✅ |
| LLM texte | DeepSeek-V4-Flash | ✅ |
| Hébergement | VPS (Hetzner/Contabo/OVH), pas de Cloudflare, pas d'AWS | ✅ |
| Frontend / dashboard | À trancher dans `03-ai-whatsapp-sales-os-plan.md` | 🔓 |
| Backend applicatif | À trancher dans `03-ai-whatsapp-sales-os-plan.md` | 🔓 |

---

## 3. Comment ce paquet de specs se lit

Structure alignée sur le workflow Spec-Kit (le standard agnostique 2026, compatible Claude Code,
Cursor, Copilot, Codex — `/speckit.specify → /speckit.plan → /speckit.tasks → /speckit.implement`) :

1. **`01-ai-whatsapp-sales-os-constitution.md`** (ce fichier) — les règles qui ne changent pas.
2. **`02-ai-whatsapp-sales-os-spec.md`** — le *quoi* : exigences fonctionnelles en notation EARS
   (`QUAND <déclencheur>, LE SYSTÈME DOIT <réponse>`), testables une par une.
3. **`03-ai-whatsapp-sales-os-plan.md`** — le *comment* : architecture technique, services Docker Compose,
   modèle de données, intégration Evolution Go.
4. **`04-ai-whatsapp-sales-os-tasks.md`** — le découpage en tâches atomiques, dans l'ordre d'exécution,
   que l'agent IA implémente une par une.

**Règle d'usage avec un agent IA (Claude Code ou autre)** : donner à l'agent la constitution +
la tâche en cours + la section de spec qu'elle référence. Ne pas donner les 4 fichiers entiers
à chaque prompt — ça noie le contexte. Un `CLAUDE.md` à la racine du repo doit pointer vers ces
4 fichiers (`@01-ai-whatsapp-sales-os-constitution.md` etc.) pour que l'agent les charge automatiquement.

---

## 4. Ce que ce document n'est pas

Il ne remplace pas le débat produit (ça, c'était le document HTML de la session précédente).
Il ne contient aucune information propriétaire extraite d'un concurrent — chaque pattern cité
ici (proxy unique, health-check, machine à états, anti-ban) est documenté publiquement par
l'éditeur d'Evolution API/Go ou par la littérature d'ingénierie générale, sources citées dans
`03-ai-whatsapp-sales-os-plan.md`.
